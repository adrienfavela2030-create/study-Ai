#!/usr/bin/env python3
"""Prepare tiny public-domain educational dataset for pipeline verification."""
from pathlib import Path
RAW = Path("data/raw"); PROC = Path("data/processed")
RAW.mkdir(parents=True, exist_ok=True); PROC.mkdir(parents=True, exist_ok=True)
TINY = """
The quick brown fox jumps over the lazy dog.
A student learns best when ideas are explained clearly.
Mathematics is the study of numbers, shapes, and patterns.
In science, we observe the world carefully. Plants need sunlight and water.
History teaches us about people and events from the past.
Geography describes the Earth. Continents are large land masses.
Good writing uses complete sentences and clear organization.
When a question is difficult, break it into smaller steps.
Photosynthesis is how green plants make food using sunlight.
Learning continues throughout life. Curiosity drives discovery.
""".strip()
def main():
    (RAW / "tiny_corpus.txt").write_text(TINY, encoding="utf-8")
    split = int(len(TINY) * 0.8)
    (PROC / "tiny_train.txt").write_text(TINY[:split], encoding="utf-8")
    (PROC / "tiny_val.txt").write_text(TINY[split:], encoding="utf-8")
    print("Tiny data prepared.")
if __name__ == "__main__":
    main()
