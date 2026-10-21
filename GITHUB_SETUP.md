# Put Study AI on GitHub

This repo contains the complete Study AI project:
- From-scratch tokenizer + Transformer (random init)
- Training scripts + verification data
- Real web search + page extraction + source grounding
- Website: 3 tools (Homework AI, AI Notes, Learn With AI)
- Backend API (FastAPI)

## Run the website

```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open http://127.0.0.1:8000

Note: Binary model checkpoints (*.pt) are not included in the initial push; train locally or add them separately.
