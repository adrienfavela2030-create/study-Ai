# Study AI — From-Scratch Educational Assistant

**Mission**: An independent AI trained from randomly initialized parameters for schoolwork, learning, reading comprehension, note-taking, and educational research. No pretrained model weights. No external generative AI APIs.

## Current Status

**Verified working:**

- From-scratch BPE tokenizer + pure-PyTorch decoder-only Transformer (random init)
- Next-token language modeling training loop with checkpoints, validation, logging
- Minimal public-domain English data + provenance
- **Real web search + webpage extraction + source-grounding validator**
- **Website** with three tools: Homework AI, AI Notes, Learn With AI

Still to build: more educational training data, from-scratch OCR (Phase 4).

See `docs/STATUS_REPORT.md` for measured results and honest limitations.

## Quick Start

```bash
pip install -r requirements.txt

# Website (three tools)
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
# Open http://127.0.0.1:8000

# Train from scratch (tiny verification run)
python scripts/prepare_tiny_data.py
python scripts/train_tokenizer.py
python scripts/train_lm.py --config configs/tiny_lm.yaml

# Web research demo
python scripts/research_demo.py "Perseverance rover Mars"
```

Training starts from **randomly initialized weights**. Web search is retrieval-only.

## Project Structure

```
study-ai/
├── backend/          # FastAPI (homework, notes, learn, search)
├── frontend/         # Mobile-friendly 3-tool UI
├── src/              # tokenizer, model, training, search
├── scripts/          # train, generate, research, run website
├── configs/
├── data/
├── docs/
└── requirements.txt
```

## Design Principles

1. Random initialization only — no pretrained weights.
2. Tokenizer trained on the project’s own corpus.
3. Decoder-only Transformer with standard tensor libraries.
4. Real web search that opens pages and grounds answers.
5. Source provenance tracked for training data.
6. Start small, measure, then scale.

See `docs/SCALING.md` and `docs/DATASET_LICENSING.md`.
