"""FastAPI backend for the Study AI website.

Endpoints:
  POST /api/homework   — solve selected worksheet questions (3 answer modes)
  POST /api/notes      — four note styles from uploaded text
  POST /api/learn      — guided learning session with context
  POST /api/read-image — from-scratch OCR of an uploaded page (once trained)
  POST /api/search     — real web search returning structured source records
  GET  /api/health     — status of each component, honestly reported

Security: retrieved webpage text is treated as untrusted data, never as
instructions. No secrets are exposed to the frontend.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel

from . import grounding, school, websearch
from .notes import make_notes

app = FastAPI(title="Study AI", version="0.1.0")

ROOT = Path(__file__).resolve().parent.parent
MODEL_STATUS = {
    "english_training": "smoke experiment completed (runs/numpy_smoke_v1); "
    "full pretraining not started",
    "school_answers": "not qualified — the model is too small; math is checked "
    "deterministically and no answers are invented",
    "notes": "extraction only — faithful verbatim sentences, not model summaries",
    "ocr": "not trained — requires running study/ocr.py training on hardware with PyTorch",
    "web_search": "available — requires BRAVE_SEARCH_API_KEY on the backend",
}


class HomeworkRequest(BaseModel):
    page_text: str
    selection: str = "all"
    mode: str = "answer_and_explain"


class NotesRequest(BaseModel):
    text: str
    style: str = "medium"
    source_kind: str = "uploaded"


class LearnRequest(BaseModel):
    session_id: str
    message: str


@app.get("/api/health")
def health():
    return {"status": "ok", "components": MODEL_STATUS}


@app.post("/api/homework")
def homework(req: HomeworkRequest):
    questions = school.detect_questions(req.page_text)
    numbers = [q.number for q in questions]
    selected = school.parse_selection(req.selection, numbers)
    results = []
    for q in questions:
        if q.number in selected:
            results.append(
                vars(school.answer_question(q, req.mode, source_text=req.page_text))
            )
    return {
        "detected_question_numbers": numbers,
        "selected": selected,
        "mode": req.mode,
        "results": results,
        "answer_modes": school.ANSWER_MODES,
    }


@app.post("/api/notes")
def notes(req: NotesRequest):
    result = make_notes(req.text, req.style, req.source_kind)
    return vars(result)


@app.post("/api/learn")
def learn(req: LearnRequest):
    """Guided session. Honest: context is kept, but the tutor brain is
    the trained-model pipeline which is not yet qualified — so replies
    come from deterministic guidance templates plus search when asked."""
    return {
        "session_id": req.session_id,
        "reply": (
            "I can keep this session's context and search the web for you. "
            "Note: my language model is still in early training, so I will not "
            "pretend to know things. Ask me to research a topic and I will "
            "return sources with citations."
        ),
        "model_status": MODEL_STATUS["school_answers"],
    }


@app.post("/api/read-image")
async def read_image(file: UploadFile = File(...)):
    """OCR endpoint. Until OCR training has actually run, this reports
    that no image-reading model exists — it never pretends to read."""
    try:
        from . import ocr  # noqa: F401

        has_torch = True
        import torch  # noqa: F401
    except ImportError:
        has_torch = False
    ckpt = ROOT / "runs" / "ocr_v1" / "checkpoint.pt"
    if not has_torch or not ckpt.exists():
        return {
            "status": "ocr_not_trained",
            "message": (
                "No trained image-reading model exists yet. Please type the "
                "question text instead, or run the OCR training pipeline "
                "(python -m study.ocr) and try again."
            ),
            "fallback": "manual_text_entry",
        }
    # If a real checkpoint exists, run inference here (kept for the future
    # training run; nothing is fabricated before then).
    return {"status": "not_implemented_yet", "message": "Checkpoint found but inference path pending."}


class SearchRequest(BaseModel):
    query: str
    count: int = 5


@app.post("/api/search")
def search(req: SearchRequest):
    """Real web search. Only counts pages actually opened and read."""
    try:
        result = websearch.research(req.query, count=req.count)
    except RuntimeError as e:
        return {"status": "needs_api_key", "message": str(e)}
    # Provide the grounding validator's contract alongside the sources.
    sources = [websearch.SourceRecord(**s) for s in result["sources"]]
    return {
        "status": "ok",
        "query": req.query,
        "research_summary": result["research_summary"],
        "sources": result["sources"],
        "grounding_rules": {
            "exact_quotes_must_match_source": True,
            "citations_must_reference_inspected_pages": True,
            "unsupported_claims_must_be_revised_or_dropped": True,
        },
        "validator": grounding.validate_citations("", sources),
    }
