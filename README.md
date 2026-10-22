An independent artificial intelligence created and trained **from scratch** for
schoolwork, learning, note-taking, and educational research.

**Rules this project follows (no exceptions):**

- No pretrained model weights, no pretrained tokenizers, no pretrained OCR.
- No external generative-AI APIs. Web search is a retrieval system, not an AI.
- No fake training. Checkpoints exist only for runs that actually happened.
- No invented sources, quotations, URLs, or claims of accuracy.
- Webpage text is untrusted data — never treated as instructions.

## What actually has been trained (honest status)

| Stage | Status |
|---|---|
| NumPy smoke experiment (tiny decoder-only Transformer, ~11k params) | **Completed** — real checkpoint in `runs/numpy_smoke_v1/` |
| English pretraining at scale | Not started (needs PyTorch + larger corpus) |
| Knowledge training | Not started |
| Educational supervised training | Not started |
| OCR training | Not started (code ready in `study/ocr.py`) |
| Web search + grounding | Code complete; needs `BRAVE_SEARCH_API_KEY` to run live |

The smoke experiment trained a randomly initialized Transformer for 120 steps
with hand-derived backprop, verified against finite differences (worst
relative error ~1e-7), and reduced held-out validation loss. It proves the
pipeline works. It does **not** prove English proficiency — the eval report
says so explicitly.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

python -m study.inspect_hardware         # hardware + honest feasibility notes
python -m study.numpy_smoke              # the verified from-scratch experiment
python -m unittest discover -s tests -v  # 35 tests (torch tests skip without torch)
python -m uvicorn study.app:app --host 127.0.0.1 --port 8000
```

Then open `web/index.html` (or http://127.0.0.1:8000 with a static mount).
The website has exactly three tools: **Homework AI**, **AI Notes**,
**Learn With AI**.

## Scale-up training

```bash
# English pretraining (randomly initialized PyTorch Transformer)
python -m study.train --stage english --steps 200 --context 256 --width 128 --layers 4 --heads 4 --batch 4

# Continue from a checkpoint
python -m study.train --stage knowledge --init-from runs/english_v1/checkpoint.pt

# Educational supervised training (response-masked loss)
python -m study.train --stage supervised --init-from runs/knowledge_v1/checkpoint.pt

# OCR (needs PyTorch)
python -m study.ocr
```

## Web search

Export a Brave Search API key on the backend (an ordinary search index,
not an AI answer service):

```bash
export BRAVE_SEARCH_API_KEY=your_key
```

`POST /api/search` runs the full pipeline: search → open pages (robots.txt
respected, never bypassing paywalls) → extract main text → structured source
records. The research summary counts **only pages actually opened**.
Snippet-only results are labeled as such.

## Project layout

```
study/
  model.py          pure-NumPy Transformer + hand-derived backward + gradcheck
  torch_model.py    PyTorch scale-up model (randomly initialized)
  train.py          training CLI (english / knowledge / supervised stages)
  tokenizer.py      character tokenizer trained from the corpus
  numpy_smoke.py    the verified smallest working experiment
  ocr.py            from-scratch OCR (CNN+BiLSTM+CTC, synthetic bitmap font)
  school.py         homework: question detection, selection, deterministic math
  notes.py          four note styles (extraction, faithful to source)
  websearch.py      search + fetch + extraction + robots.txt + rate limits
  grounding.py      citation validation + exact-quote + claim-support checks
  app.py            FastAPI backend (6 endpoints)
  inspect_hardware.py
  data/             original training data + provenance/license records
web/                three-tool website (mobile-friendly)
tests/              24 automated tests
runs/               REAL checkpoints only — never fabricated
```

## Capabilities and limitations (real)

**Can do now:** question-number detection and selection, deterministic math
checking, faithful verbatim note extraction, live web search with inspected
sources, citation and quotation validation, honest "I don't know" behavior.

**Cannot do yet:** answer school questions with the language model (too small),
model-generated summaries, image reading (OCR untrained), semantic
fact-checking beyond lexical support checks.

**Never does:** invent quotations, sources, or URLs; treat snippets as
inspected pages; train on visited webpages automatically; expose secrets to
the frontend.

## Security

Webpage content is untrusted data. It is never executed and never treated as
instructions to the system. robots.txt is respected; paywalls and
authentication are never bypassed; rate limits are enforced. Keep this
prototype off the public internet until auth, isolation, and quotas exist.

## License

Project-authored original code and data. See `study/data/provenance.json`
for dataset licensing records.
