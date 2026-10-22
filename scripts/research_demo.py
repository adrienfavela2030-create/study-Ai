#!/usr/bin/env python3
"""Demo real web search + extraction."""
import argparse, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.search.web_search import research, format_sources_for_model
def main():
    p = argparse.ArgumentParser()
    p.add_argument("query")
    p.add_argument("--max-pages", type=int, default=2)
    args = p.parse_args()
    b = research(args.query, max_pages_to_open=args.max_pages)
    print(b.summary())
    for i, s in enumerate(b.sources, 1):
        print(f"[{i}] full={s.is_full_page} {s.title} ({s.word_count} words)")
        print(f"    {s.url}")
    print(format_sources_for_model(b)[:1500])
if __name__ == "__main__":
    main()
