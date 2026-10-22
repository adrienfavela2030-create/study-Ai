"""AI Notes tool.

Four note styles: light / medium / hard / short. The current model is too
small to summarize, so notes are produced by transparent extraction from
the uploaded text (faithful to the source, nothing invented), clearly
labeled as extraction rather than model-generated summary. Online
findings are kept separate from uploaded material.
"""

from __future__ import annotations

from dataclasses import dataclass

SENTENCE_END = ".!?"


def split_sentences(text: str) -> list[str]:
    out: list[str] = []
    buf: list[str] = []
    for ch in text:
        buf.append(ch)
        if ch in SENTENCE_END:
            out.append("".join(buf).strip())
            buf = []
    if buf:
        out.append("".join(buf).strip())
    return [s for s in out if s]


def keyword_score(sentence: str) -> float:
    words = sentence.lower().split()
    if not words:
        return 0.0
    # simple, transparent heuristic: longer sentences with domain cues rank higher
    cues = ("because", "therefore", "means", "important", "key", "example",
            "cause", "effect", "result", "define", "compare")
    return len(words) / 20.0 + sum(w in cues for w in words)


@dataclass
class NoteResult:
    style: str
    source_kind: str  # uploaded | web
    notes: list[str]
    method: str  # extraction | model


def make_notes(text: str, style: str = "medium", source_kind: str = "uploaded") -> NoteResult:
    sentences = split_sentences(text)
    scored = sorted(sentences, key=keyword_score, reverse=True)
    limits = {"light": 3, "medium": 6, "hard": 12, "short": 2}
    n = limits.get(style, 6)
    picked = [s for s in sentences if s in scored[:n]]
    return NoteResult(
        style=style,
        source_kind=source_kind,
        notes=picked,
        method=(
            "extraction (the trained model is too small to summarize; these are "
            "verbatim sentences from the source, ranked by a transparent keyword "
            "heuristic — nothing is invented)"
        ),
    )
