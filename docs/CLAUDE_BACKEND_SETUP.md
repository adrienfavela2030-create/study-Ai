# Claude API setup for Study AI

This project can use Claude for Homework AI, AI Notes, and Learn With AI through its Python backend. The browser must never receive the Anthropic API key.

## 1. Add server-side environment variables

On the backend host's secret/environment-variable settings, add:

- `ANTHROPIC_API_KEY` — your Anthropic API key (keep it secret; never paste it into HTML, JavaScript, GitHub, or a chat).
- `ANTHROPIC_MODEL` — optional model override. The default is `claude-sonnet-4-5`.
- `STUDY_AI_ALLOWED_ORIGINS` — optional comma-separated list of trusted frontend origins, for example `https://your-site.example`. Leave unset only for local development or if you understand the risk of allowing any browser origin.

Anthropic API usage is billed separately and is subject to your account's balance, limits, and rate limits. Set spending limits/alerts in your Anthropic account if available.

## 2. Start the backend

```bash
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The exact start command may differ on your hosting service. Visit `/api/health` to confirm whether `provider` is `claude`. If it says `local_fallback`, the key is missing from the running backend or the service needs a restart.

## 3. Important frontend note

GitHub Pages can serve static HTML but cannot safely store an API key or run this Python backend. Deploy the backend to a Python-capable host and connect the frontend to that backend URL. Do not put `ANTHROPIC_API_KEY` in `frontend/static/app.js`, `docs/index.html`, or any public repository file.

## Current limitations

- The existing from-scratch model remains as a fallback when the Claude key is not configured and its checkpoint is available.
- This change does not add photo OCR. Students must type worksheet text for now.
- Research uses the project's existing search pipeline. Live search still requires its configured search provider key.
- This is an API integration foundation, not a claim that the app has been deployed, connected to a host, or fully tested in production.
- Saving student conversations or training examples is not enabled by this change. Add privacy controls, authentication, and retention rules before storing student work.
