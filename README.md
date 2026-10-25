# Study AI

Study AI is a schoolwork assistant project with three tools: **Homework AI**, **AI Notes**, and **Learn With AI**. The repository also preserves experiments toward a from-scratch model.

## AI provider

The Python backend can use Anthropic's Claude API for natural-language answers when `ANTHROPIC_API_KEY` is configured as a server-side environment variable. Without that key, the backend attempts to use the project's local model when its checkpoint is available. Never put an API key in browser code or commit one to GitHub.

Claude API usage is billed separately and is subject to Anthropic account limits. See [`docs/CLAUDE_BACKEND_SETUP.md`](docs/CLAUDE_BACKEND_SETUP.md) for setup and limitations.

## Safety and grounding

- Retrieved webpage text is untrusted evidence, not instructions.
- Research answers should cite only source records actually returned by the search pipeline.
- Missing worksheet context should trigger a follow-up instead of an invented answer.
- This change does not enable photo OCR or automatically train a model on Claude responses.
- Student work is not stored as training data by this integration.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Set `ANTHROPIC_API_KEY` in your local shell or hosting provider's secret settings before starting the server to enable Claude. Do not commit `.env` files or keys.

## From-scratch research

The existing `study/`, `src/`, `runs/`, and training scripts are retained. They are separate research experiments and are not deleted by enabling Claude in the API backend. Their checkpoints and measured results should be described honestly; a small training run does not imply production-level language ability.

## Hosting note

GitHub Pages serves static files only. It cannot run this Python API or securely hold the Claude key. Deploy the backend separately, then configure the frontend to use its HTTPS URL. See the setup guide before making the app public.
