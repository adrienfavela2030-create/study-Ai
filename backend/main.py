"""Study AI Backend — Homework / Notes / Learn / Search APIs."""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

app = FastAPI(title="Study AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
FRONTEND = ROOT / "frontend"
if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND / "static")), name="static")

class SearchRequest(BaseModel):
    query: str
    max_pages: int = Field(default=2, ge=1, le=5)

class LearnRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = Field(default_factory=list)
    use_search: bool = False
    search_query: Optional[str] = None

class NotesRequest(BaseModel):
    text: str = ""
    style: str = Field(default="medium", pattern="^(light|medium|hard|short)$")

class HomeworkRequest(BaseModel):
    question_text: str = ""
    mode: str = Field(default="answer_explain", pattern="^(help_me_understand|give_answer|answer_explain)$")
    question_numbers: Optional[str] = None

_model = None
_tokenizer = None

def get_model():
    global _model, _tokenizer
    if _model is not None:
        return _model, _tokenizer
    try:
        import torch
        from src.model.transformer import GPT, ModelConfig
        from src.tokenizer.bpe_tokenizer import BPETokenizer
        ckpt_path = ROOT / "data" / "checkpoints" / "tiny_lm" / "latest.pt"
        tok_path = ROOT / "data" / "checkpoints" / "tokenizer"
        if not ckpt_path.exists() or not tok_path.exists():
            return None, None
        ckpt = torch.load(ckpt_path, map_location="cpu")
        cfg = ModelConfig(**ckpt["model_config"])
        model = GPT(cfg)
        model.load_state_dict(ckpt["model"])
        model.eval()
        tok = BPETokenizer.load(tok_path)
        _model, _tokenizer = model, tok
        return _model, _tokenizer
    except Exception:
        return None, None

def run_search(query: str, max_pages: int = 2) -> Dict[str, Any]:
    from src.search.web_search import research, format_sources_for_model
    bundle = research(query, max_search_results=4, max_pages_to_open=max_pages)
    sources = []
    for i, s in enumerate(bundle.sources, 1):
        sources.append({
            "id": i, "url": s.url, "title": s.title, "publisher": s.publisher,
            "is_full_page": s.is_full_page, "is_snippet_only": s.is_snippet_only,
            "status": s.status, "word_count": s.word_count, "preview": s.extracted_text[:300],
            "extracted_text": s.extracted_text[:4000],
        })
    return {
        "query": bundle.query, "summary": bundle.summary(),
        "pages_opened": bundle.pages_opened, "pages_failed": bundle.pages_failed,
        "sources": sources, "context_for_model": format_sources_for_model(bundle, max_chars_per_source=1200),
    }

def generate_with_model(prompt: str, max_tokens: int = 60) -> str:
    import torch
    model, tok = get_model()
    if model is None or tok is None:
        return "[Model not loaded — run training first. This is Study AI's own randomly-initialized model.]"
    ids = tok.encode(prompt, add_bos=True)
    block = model.config.block_size
    if len(ids) > block - 8:
        ids = ids[-(block - 8):]
    idx = torch.tensor([ids], dtype=torch.long)
    with torch.no_grad():
        out = model.generate(idx, max_new_tokens=max_tokens, temperature=0.7, top_k=30)
    text = tok.decode(out[0].tolist())
    if "Answer:" in text:
        text = text.split("Answer:")[-1]
    return text.strip() or "(empty generation from tiny model)"

@app.get("/api/health")
def health():
    model_loaded = False
    try:
        m, t = get_model()
        model_loaded = m is not None
    except Exception:
        pass
    return {"status": "ok", "service": "Study AI", "model_loaded": model_loaded,
            "note": "From-scratch model + real web retrieval. No external generative AI APIs."}

@app.post("/api/search")
def api_search(req: SearchRequest):
    try:
        result = run_search(req.query, max_pages=req.max_pages)
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])

@app.post("/api/learn")
def api_learn(req: LearnRequest):
    sources_block = ""
    search_meta = None
    if req.use_search:
        q = req.search_query or req.message
        search_meta = run_search(q, max_pages=2)
        sources_block = search_meta.get("context_for_model", "")
    prompt = "You are Study AI, a school learning assistant. Explain clearly. Cite [1], [2].\n\n"
    if sources_block:
        prompt += f"Sources:\n{sources_block[:1500]}\n\n"
    prompt += f"Student: {req.message}\nAnswer:"
    answer = generate_with_model(prompt, max_tokens=70)
    return {"ok": True, "reply": answer, "used_search": req.use_search, "search": search_meta,
            "model_note": "Generated by Study AI's own tiny from-scratch model."}

@app.post("/api/notes")
def api_notes(req: NotesRequest):
    if not req.text.strip():
        return {"ok": False, "error": "No text provided."}
    styles = {
        "light": "Main ideas and essential facts only.",
        "medium": "Main ideas, supporting details, key vocabulary.",
        "hard": "Detailed test-prep notes with facts, causes, effects.",
        "short": "Compact review notes.",
    }
    prompt = f"Create {req.style} study notes. {styles.get(req.style, '')}\nSource:\n{req.text[:1200]}\nNotes:"
    notes = generate_with_model(prompt, max_tokens=80)
    return {"ok": True, "style": req.style, "notes": notes,
            "model_note": "Notes from Study AI's own tiny model."}

@app.post("/api/homework")
def api_homework(req: HomeworkRequest):
    if not req.question_text.strip():
        return {"ok": False, "error": "No question text. OCR not trained yet."}
    modes = {
        "help_me_understand": "Guide step by step; do not only give the final answer.",
        "give_answer": "Give the direct answer clearly.",
        "answer_explain": "Give the answer and a clear explanation.",
    }
    prompt = f"Homework: {modes.get(req.mode, '')}\nQuestion: {req.question_text[:800]}\nAnswer:"
    answer = generate_with_model(prompt, max_tokens=80)
    return {"ok": True, "mode": req.mode, "answer": answer,
            "model_note": "Answered by Study AI's own tiny model. Not yet reliable for real homework.",
            "ocr_status": "Image reading not available until Phase 4 OCR training."}

@app.post("/api/read-image")
async def api_read_image(file: UploadFile = File(...)):
    content = await file.read()
    return {"ok": False, "error": "From-scratch OCR not yet trained (Phase 4).",
            "filename": file.filename, "bytes_received": len(content)}

@app.get("/", response_class=HTMLResponse)
def index():
    index_path = FRONTEND / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Study AI</h1><p>Frontend not found.</p>")
