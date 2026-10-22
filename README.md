An independent artificial intelligence created and trained **from scratch** for
schoolwork, learning, note-taking, and educational research.

**Rules this project follows (no exceptions):**

- No pretrained model weights, no pretrained tokenizers, no pretrained OCR.
- No external generative-AI APIs. Web search is a retrieval system, not an AI.
- No fake training. Checkpoints exist only for runs that actually happened.
- No invented sources, quotations, URLs, or claims of accuracy.
- Webpage text is untrusted data — never treated as instructions.

> The deployed browser app (`docs/`) does NOT use pretrained OCR: the
> Tesseract.js path was removed for compliance (no pretrained model weights,
> including OCR). Photos are shown for reference; the student types the text.
> The from-scratch OCR (`study/ocr.py`) is trained on synthetic images only
> (`runs/ocr_v1/`) and is not wired into the UI until it handles real photos.

## What actually has been trained (honest status)

| Stage | Status |
|---|---|
| NumPy smoke experiment v2 (tiny Transformer, ~13k params) | **Completed and verified** — `runs/numpy_smoke_v2/` |
| English pretraining (PyTorch, 357k params) | **Ran for real** — `runs/english_v1/`, val loss 4.44 → 1.34 |
| Knowledge training | **Ran for real** — `runs/knowledge_v1/`, but val regressed (overfit) |
| Educational supervised training | **Ran for real** — `runs/supervised_v1/`, masked loss 4.4 → 0.26; still cannot generate English (verbatim samples in the status report) |
| OCR training | **Ran for real** — `runs/ocr_v1/`, 1.000 char accuracy on held-out synthetic images (not tested on photos) |
| Web search + grounding | Code complete; needs `BRAVE_SEARCH_API_KEY` to run live |

The corrected smoke experiment proves the pipeline: next-token alignment,
gradient check with randomized non-unit layernorm scales (worst error ~1e-7),
deterministic checkpoint reload, and resumable training. The scale-up runs
are real but tiny (a few KB of original text), so **none of these models
can generate English** — the app's answers are deterministic rules +
retrieval, and nothing claims otherwise. See `docs/AUDIT.md` and
`docs/STATUS_REPORT.md` for the full diagnosis and honest numbers.

The first smoke run was defective (double-shifted targets) and is archived
with a correction notice in `runs/archive/numpy_smoke_v1/` — kept as a
record, never used.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

python -m study.inspect_hardware         # hardware + honest feasibility notes
python -m study.numpy_smoke              # the verified from-scratch experiment
python -m unittest discover -s tests -v  # 46 tests (0 skipped with torch installed)
node tests/test_app.js                  # 30 tests for the deployed browser app
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
tests/              46 Python tests + 30 Node tests for the deployed app
runs/               REAL checkpoints only — never fabricated
runs/archive/       defective v1 smoke run + correction notice (kept, unused)
docs/               the deployed browser app (index.html + app.js)
tests/              46 Python tests + 30 Node tests for the deployed app
```

## Capabilities and limitations (real)

**Can do now:** question-number detection and selection, deterministic math
checking, faithful verbatim note extraction, live web search with inspected
sources, citation and quotation validation, honest "I don't know" behavior.

**Cannot do yet:** answer school questions with the language model (too small
— see the verbatim samples in `docs/STATUS_REPORT.md`), model-generated
summaries, from-scratch OCR on real photographs (synthetic images only;
photo reading in the app is disabled until then). Semantic fact-checking is
lexical: it flags unsupported wording but cannot prove truth.

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
