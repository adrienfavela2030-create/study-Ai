"""Build the v2 English training corpus from verified public-domain sources.

Sources (all public domain in the United States, downloaded from
Project Gutenberg plain-text files):
  - McGuffey's Revised First Reader  (Gutenberg #14640)
  - McGuffey's Third Eclectic Reader (Gutenberg #14766)
  - Aesop's Fables                    (Gutenberg #21)

The builder:
  1. strips Project Gutenberg boilerplate (transcriber notes, license),
  2. normalizes line endings and whitespace,
  3. keeps only lines with real text (drops illustration markers and
     running headers),
  4. deduplicates exact duplicate lines,
  5. writes study/data/corpus_english_v2.txt (one paragraph per line),
  6. writes a fixed held-out evaluation set (eval_english.json) drawn
     from the END of the corpus — never used in training,
  7. records provenance (source URL, title, license, sha256) and exact
     token counts in study/data/provenance_v2.json.

Run: python -m study.build_corpus
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "study/data/gutenberg_raw"
OUT = ROOT / "study/data"

SOURCES = [
    {"id": "14640", "title": "McGuffey's Revised First Reader",
     "url": "https://www.gutenberg.org/files/14640/14640-0.txt",
     "license": "public domain (United States)"},
    {"id": "14766", "title": "McGuffey's Third Eclectic Reader",
     "url": "https://www.gutenberg.org/files/14766/14766-0.txt",
     "license": "public domain (United States)"},
    {"id": "21", "title": "Aesop's Fables (translated, G. F. Townsend)",
     "url": "https://www.gutenberg.org/files/21/21-0.txt",
     "license": "public domain (United States)"},
]

# Documented ASCII normalization (the tokenizer's fixed charset is
# printable ASCII + a few math/typographic chars; 19th-century sources
# use curly quotes, em-dashes and ligatures that are normalized here so
# every model with the standard charset can be scored on the same data).
NORMALIZE = {
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-", "\u2212": "-",
    "\u00e6": "ae", "\u0153": "oe", "\u00c6": "Ae", "\u0152": "Oe",
    "\u00e9": "e", "\u00e8": "e", "\u00ea": "e", "\u00e0": "a", "\u00e7": "c",
    "\u00ff": "y", "\u00bf": "", "\u00a0": " ", "\ufeff": "",
    "\u00e2": "a", "\u00fc": "u", "\u1f10": "epsilon",
}

# Greek letters appear in a few Aesop footnotes; transliterate the common
# ones to their Latin names so the corpus stays in the standard charset.
GREEK = {
    "\u03b1": "alpha", "\u03b2": "beta", "\u03b3": "gamma", "\u03b4": "delta",
    "\u03b5": "epsilon", "\u03b6": "zeta", "\u03b7": "eta", "\u03b8": "theta",
    "\u03b9": "iota", "\u03ba": "kappa", "\u03bb": "lambda", "\u03bc": "mu",
    "\u03bd": "nu", "\u03be": "xi", "\u03bf": "omicron", "\u03c0": "pi",
    "\u03c1": "rho", "\u03c2": "sigma", "\u03c3": "sigma", "\u03c4": "tau",
    "\u03c5": "upsilon", "\u03c6": "phi", "\u03c7": "chi", "\u03c8": "psi",
    "\u03c9": "omega", "\u0391": "Alpha", "\u0392": "Beta", "\u0393": "Gamma",
    "\u0394": "Delta", "\u0395": "Epsilon", "\u0396": "Zeta", "\u0397": "Eta",
    "\u0398": "Theta", "\u0399": "Iota", "\u039a": "Kappa", "\u039b": "Lambda",
    "\u039c": "Mu", "\u039d": "Nu", "\u039e": "Xi", "\u039f": "Omicron",
    "\u03a0": "Pi", "\u03a1": "Rho", "\u03a3": "Sigma", "\u03a4": "Tau",
    "\u03a5": "Upsilon", "\u03a6": "Phi", "\u03a7": "Chi", "\u03a8": "Psi",
    "\u03a9": "Omega", "\u1f00": "alpha", "\u1f30": "iota", "\u1f41": "omicron",
    "\u1f61": "omega", "\u1f76": "iota", "\u1fb6": "alpha", "\u1fc6": "eta",
    "\u1ff6": "omega", "\u1f70": "alpha", "\\u03ac": "alpha", "\u03ae": "eta",
    "\u03af": "iota", "\u03cd": "upsilon", "\u03ce": "omega",
}


def normalize_chars(text: str) -> str:
    for k, v in NORMALIZE.items():
        text = text.replace(k, v)
    for k, v in GREEK.items():
        text = text.replace(k, v)
    return text


HEADER_RE = re.compile(r"^\*\*\* ?START OF TH(E|IS) PROJECT GUTENBERG.*$", re.I)
FOOTER_RE = re.compile(r"(^\*\*\* ?END OF TH(E|IS) PROJECT GUTENBERG|^End of the Project Gutenberg)", re.I | re.M)
ILLUSTRATION_RE = re.compile(r"\[Illustration[^\]]*\]", re.I)
RUNNING_HEADER_RE = re.compile(r"^\s*(McGuffey.*Reader\.?|AESOP'?S FABLES.*|[IVXLC]+\.\s*$)", re.I)


def clean_text(raw: str) -> str:
    # cut header: everything up to the START marker line (inclusive) plus
    # transcriber notes that follow it
    raw = normalize_chars(raw)
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    start = 0
    for i, l in enumerate(lines):
        if HEADER_RE.match(l.strip()):
            start = i + 1
            break
    # cut footer
    end = len(lines)
    for i in range(len(lines) - 1, start, -1):
        if FOOTER_RE.search(lines[i]):
            end = i
            break
    body = lines[start:end]
    out = []
    for l in body:
        l = ILLUSTRATION_RE.sub(" ", l)
        l = re.sub(r"[ \t]+", " ", l).strip()
        if not l:
            out.append("")
            continue
        if RUNNING_HEADER_RE.match(l):
            continue
        # skip lesson-number-only lines (roman numerals handled above)
        out.append(l)
    text = "\n".join(out)
    # collapse 3+ blank lines to one
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main():
    all_paragraphs: list[str] = []
    provenance = []
    for src in SOURCES:
        path = RAW / f"g{src['id']}.txt"
        raw = path.read_text(encoding="utf-8", errors="replace")
        sha = hashlib.sha256(raw.encode()).hexdigest()
        cleaned = clean_text(raw)
        # split into paragraphs on blank lines
        paragraphs = [re.sub(r"\s+", " ", p).strip() for p in cleaned.split("\n\n")]
        paragraphs = [p for p in paragraphs if len(p) >= 40]  # real prose only
        # drop paragraphs that are mostly non-ASCII after normalization
        # (Greek quotes, tables of symbols, etc.) — documented exclusion
        paragraphs = [p for p in paragraphs
                      if sum(1 for c in p if ord(c) > 127) / len(p) < 0.05]
        # dedupe exact duplicates (preserve order)
        seen: set[str] = set()
        uniq = []
        for p in paragraphs:
            if p not in seen:
                seen.add(p)
                uniq.append(p)
        all_paragraphs.extend(uniq)
        provenance.append({
            "file": f"study/data/gutenberg_raw/g{src['id']}.txt",
            "title": src["title"],
            "url": src["url"],
            "license": src["license"],
            "sha256": sha,
            "paragraphs_after_cleaning": len(uniq),
        })
        print(f"{src['title']}: {len(uniq)} paragraphs, {sum(len(p) for p in uniq)} chars")

    # held-out evaluation: the LAST 15 paragraphs become the fixed eval set
    # (never used in training)
    eval_paras = all_paragraphs[-15:]
    train_paras = all_paragraphs[:-15]

    (OUT / "corpus_english_v2.txt").write_text("\n".join(train_paras), encoding="utf-8")
    (OUT / "eval_english_v2.json").write_text(json.dumps({
        "note": "fixed held-out evaluation set — never used in training",
        "paragraphs": eval_paras,
        "completion_prompts": [
            # prompts built from the held-out paragraphs: first ~60% of the
            # sentence, expected continuation is the rest (scored by
            # per-character loss on the continuation)
            *[p[: int(len(p) * 0.6)] for p in eval_paras[:10]],
        ],
        "generation_probes": [
            "The boy went to school",
            "The dog ran",
            "She said",
            "Once upon a time",
        ],
    }, indent=2), encoding="utf-8")

    (OUT / "provenance_v2.json").write_text(json.dumps({
        "corpus": "study/data/corpus_english_v2.txt",
        "sources": provenance,
        "held_out_eval": "study/data/eval_english_v2.json (last 15 paragraphs, never trained on)",
        "train_paragraphs": len(train_paras),
        "train_characters": sum(len(p) for p in train_paras),
        "train_tokens_chars": sum(len(p) for p in train_paras),
        "license": "all sources public domain (US); see per-source records",
    }, indent=2), encoding="utf-8")
    print(f"\ncorpus: {len(train_paras)} paragraphs, "
          f"{sum(len(p) for p in train_paras)} characters (train)")
    print(f"held-out eval: {len(eval_paras)} paragraphs")
    print("provenance written")


if __name__ == "__main__":
    main()
