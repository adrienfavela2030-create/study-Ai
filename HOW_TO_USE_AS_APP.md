# Study AI is the app — not a file list

The product is the **three-tool mobile website**:
1. Homework AI
2. AI Notes
3. Learn With AI

GitHub only stores the code. To use it as an app on your iPhone you need a **live web address**.

## What you want

- Open a link in Safari
- Tap Share → **Add to Home Screen**
- Study AI opens like a normal app (full screen, own icon)

## What’s blocking that right now

The app runs only when a server is online. This chat sandbox is not a public server, so there is no permanent link yet.

## How to get the real app on your phone (phone-only path)

### Option A — Free host (best)
1. Sign up on [render.com](https://render.com) or [railway.app](https://railway.app) with GitHub
2. “New Web Service” → connect repo `adrienfavela2030-create/study-ai`
3. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. After deploy, open the `https://…` URL in Safari
5. Share → Add to Home Screen

### Option B — Use this chat as the app until hosted
Say things like:
- “Homework Answer+Explain: …”
- “Medium notes from: …”
- “Learn + search the web: …”

Same tools, works on your phone today.

## Honest limits

- Language model is still tiny (answers weak until more training)
- Photo OCR not trained yet
- Web search works for research mode
