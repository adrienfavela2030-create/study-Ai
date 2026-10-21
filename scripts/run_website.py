#!/usr/bin/env python3
"""Start Study AI website: python scripts/run_website.py"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
if __name__ == "__main__":
    import uvicorn
    print("Study AI → http://127.0.0.1:8000")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
