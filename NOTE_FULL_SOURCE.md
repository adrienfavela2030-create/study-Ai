# Study AI repo status

## Already in this repository

- Mobile website: `frontend/` (Homework AI, AI Notes, Learn With AI)
- Backend API: `backend/main.py` (all required endpoints)
- Config, requirements, docs, training entry scripts
- Package layout under `src/`

## Still to add (full from-scratch implementations)

These files exist in the development build and should be pushed next:

- `src/model/transformer.py` — decoder-only Transformer (random init)
- `src/tokenizer/bpe_tokenizer.py` — from-scratch BPE
- `src/search/web_search.py` — real page retrieval
- `src/search/grounding.py` — source grounding
- `src/training/train_lm.py` — training loop
- `data/processed/` and tokenizer checkpoint

Ask Grok to “push the remaining Study AI source modules” to finish.

## Run the website (when you have Python)

```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open http://127.0.0.1:8000
