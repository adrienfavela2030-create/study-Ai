"""Source-grounding and citation validation.

Checks that important factual statements in an answer are supported by
the retrieved source text, that exact quotations match the source, and
that every [n] citation refers to a real inspected source. The model must
not present retrieved text as unquestionable truth; disagreements between
sources are surfaced rather than merged.
"""

from __future__ import annotations

import re

from .websearch import SourceRecord


def exact_quote_in_source(quote: str, source_text: str) -> bool:
    """An exact quotation must appear in the extracted source text."""
    q = re.sub(r"\s+", " ", quote).strip().strip('"\u201c\u201d')
    s = re.sub(r"\s+", " ", source_text)
    return bool(q) and q in s


def used_citation_ids(answer: str) -> list[int]:
    return sorted({int(m) for m in re.findall(r"\[(\d+)\]", answer)})


def validate_citations(answer: str, sources: list[SourceRecord]) -> dict:
    """Every [n] in the answer must map to an inspected source record."""
    ids = used_citation_ids(answer)
    problems = []
    for i in ids:
        if i < 1 or i > len(sources):
            problems.append(f"[{i}] does not match any source")
        elif not sources[i - 1].inspected:
            problems.append(f"[{i}] refers to a snippet-only result, not an inspected page")
    return {"citation_ids": ids, "problems": problems, "valid": not problems}


def claim_supported(claim: str, source_text: str, min_overlap: float = 0.75) -> tuple[bool, float]:
    """Lexical support check between a claim and source text.

    This is a deliberately conservative keyword-overlap check. It cannot
    prove a claim is true; it can only flag claims whose words do not
    appear in the source. Unsupported claims are revised or dropped.
    """
    stop = set("the a an is are was were of to in on for with and or it that this be by as at from".split())
    claim_words = {w for w in re.findall(r"[a-z]+", claim.lower()) if w not in stop and len(w) > 3}
    if not claim_words:
        return True, 1.0  # nothing checkable; nothing to flag
    src_words = set(re.findall(r"[a-z]+", source_text.lower()))
    hit = claim_words & src_words
    ratio = len(hit) / len(claim_words)
    return ratio >= min_overlap, ratio


def validate_answer(answer: str, sources: list[SourceRecord]) -> dict:
    """Run the full grounding validator over an answer."""
    claims = re.split(r"(?<=[.!?])\s+", answer)
    results = []
    for claim in claims:
        if not claim.strip():
            continue
        cited = [i for i in used_citation_ids(claim)]
        if cited:
            src = sources[cited[0] - 1] if cited[0] - 1 < len(sources) else None
            if src is None:
                results.append({"claim": claim, "supported": False, "reason": "citation out of range"})
            elif not src.inspected:
                results.append({"claim": claim, "supported": False,
                                "reason": "cited source was never opened (snippet only)"})
            else:
                ok, ratio = claim_supported(claim, src.extracted_text)
                results.append({"claim": claim, "supported": ok, "support_ratio": round(ratio, 2)})
        else:
            results.append({"claim": claim, "supported": None,
                            "reason": "no citation attached; treat as model knowledge or assumption"})
    citations = validate_citations(answer, sources)
    quotes = re.findall(r'"([^"]{10,})"', answer)
    quote_checks = []
    for q in quotes:
        src_texts = [s.extracted_text for s in sources if s.inspected]
        quote_checks.append({
            "quote": q[:80],
            "exact_match": any(exact_quote_in_source(q, t) for t in src_texts),
        })
    unsupported = [r for r in results if r["supported"] is False]
    return {
        "claims": results,
        "citations": citations,
        "quotes": quote_checks,
        "grounded": citations["valid"] and not unsupported,
        "instruction": (
            "Claims marked unsupported must be revised, removed, or stated as "
            "uncertain. Exact quotations must match source text."
        ),
    }


def compare_sources(sources: list[SourceRecord], keyword: str) -> dict:
    """Compare what multiple inspected sources say about a keyword."""
    hits = []
    for s in sources:
        if s.inspected and keyword.lower() in s.extracted_text.lower():
            idx = s.extracted_text.lower().find(keyword.lower())
            hits.append({"url": s.url, "context": s.extracted_text[max(0, idx - 80): idx + 160]})
    return {
        "keyword": keyword,
        "sources_mentioning": len(hits),
        "contexts": hits,
        "note": (
            "If sources disagree, explain the disagreement; do not merge "
            "contradictory claims."
        ),
    }
