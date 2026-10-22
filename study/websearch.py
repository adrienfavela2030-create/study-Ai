"""Web search and webpage extraction.

Search is a retrieval system, not an AI model. It queries a permitted
search index (Brave's ordinary web-search endpoint), opens the actual
webpages when allowed, extracts the main text, and returns structured
source records that keep each fact attached to its URL.

No third-party generative AI is involved in any step.

Security note: all webpage content is treated as untrusted data. Extracted
text is never executed and never treated as instructions to the system.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from urllib import robotparser
from urllib.parse import urlparse

try:  # requests is preferred; urllib is the fallback
    import requests  # type: ignore
except ImportError:  # pragma: no cover
    requests = None
import urllib.request

USER_AGENT = "StudyAI/1.0 (educational research; from-scratch model)"
DEFAULT_TIMEOUT = 10


@dataclass
class SourceRecord:
    url: str
    title: str
    publisher: str
    snippet: str
    extracted_text: str = ""
    inspected: bool = False  # True only if the actual page was opened and read
    publication_date: str | None = None
    blocked_reason: str | None = None

    def to_dict(self) -> dict:
        return vars(self)


class RateLimiter:
    def __init__(self, min_seconds: float = 1.0):
        self.min_seconds = min_seconds
        self._last = 0.0

    def wait(self):
        now = time.time()
        elapsed = now - self._last
        if elapsed < self.min_seconds:
            time.sleep(self.min_seconds - elapsed)
        self._last = time.time()


_limiter = RateLimiter()


def robots_allows(url: str) -> bool:
    """Check robots.txt for the page before fetching it."""
    try:
        parsed = urlparse(url)
        rp = robotparser.RobotFileParser()
        rp.set_url(f"{parsed.scheme}://{parsed.netloc}/robots.txt")
        rp.read()
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        # if robots.txt cannot be read, do not guess — treat as not allowed
        return False


def _http_get(url: str, headers: dict | None = None):
    _limiter.wait()
    if requests is not None:
        return requests.get(url, headers=headers or {"User-Agent": USER_AGENT}, timeout=DEFAULT_TIMEOUT)
    req = urllib.request.Request(url, headers=headers or {"User-Agent": USER_AGENT})
    return urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT)


def brave_web_search(query: str, count: int = 5, api_key: str | None = None) -> list[SourceRecord]:
    """Query the Brave Search ordinary web-search endpoint.

    Requires a BRAVE_SEARCH_API_KEY (a plain search index, not an AI
    answer service). Results not yet opened are labeled snippets only.
    """
    import os

    key = api_key or os.environ.get("BRAVE_SEARCH_API_KEY")
    if not key:
        raise RuntimeError(
            "BRAVE_SEARCH_API_KEY is not set. Create a free key at "
            "https://api-dashboard.search.brave.com and export it as an "
            "environment variable on the backend."
        )
    from urllib.parse import quote_plus

    # Brave expects GET with query params and an API-key header
    url = (
        "https://api.search.brave.com/res/v1/web/search"
        f"?q={quote_plus(query)}&count={count}"
    )
    if requests is not None:
        r = requests.get(
            url, headers={"X-Subscription-Token": key, "Accept": "application/json"},
            timeout=DEFAULT_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
    else:
        req = urllib.request.Request(
            url, headers={"X-Subscription-Token": key, "Accept": "application/json",
                          "User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            import json

            data = json.loads(resp.read().decode())
    records: list[SourceRecord] = []
    for item in data.get("web", {}).get("results", [])[:count]:
        records.append(
            SourceRecord(
                url=item.get("url", ""),
                title=item.get("title", ""),
                publisher=urlparse(item.get("url", "")).netloc,
                snippet=item.get("description", ""),
                inspected=False,
            )
        )
    return records


_STRIP_TAGS = re.compile(r"<[^>]+>")


def extract_main_text(html: str) -> str:
    """Extract readable text from HTML, removing navigation/ads/scripts.

    Deliberately simple and transparent: strips script/style/nav/aside/
    footer/header blocks, then tags, then collapses whitespace. It is not
    a perfect readability algorithm; text it produces is clearly marked
    as machine-extracted and is treated as untrusted data.
    """
    html = re.sub(r"(?is)<(script|style|nav|aside|footer|header|form)[^>]*>.*?</\1>", " ", html)
    text = _STRIP_TAGS.sub(" ", html)
    text = re.sub(r"&[a-z#0-9]+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def open_and_read(record: SourceRecord, max_chars: int = 6000) -> SourceRecord:
    """Open the actual webpage and extract its text (marks inspected=True).

    Respects robots.txt and never bypasses paywalls or auth. If the page
    cannot be opened, the record stays a snippet-only result.
    """
    if not record.url.startswith("http"):
        record.blocked_reason = "not an http(s) URL"
        return record
    try:
        if not robots_allows(record.url):
            record.blocked_reason = "robots.txt disallows fetching"
            return record
        resp = _http_get(record.url)
        if requests is not None and hasattr(resp, "text"):
            html = resp.text
            date = resp.headers.get("date") or resp.headers.get("last-modified")
        else:
            html = resp.read().decode("utf-8", errors="replace")
            date = resp.headers.get("Last-Modified")
        record.extracted_text = extract_main_text(html)[:max_chars]
        record.inspected = bool(record.extracted_text)
        if date:
            record.publication_date = date
    except Exception as e:
        record.blocked_reason = f"could not open page: {e}"
    return record


def research(query: str, count: int = 5, api_key: str | None = None) -> dict:
    """Full pipeline: search -> open pages -> structured source records.

    Returns a research summary that only counts pages actually opened.
    """
    records = brave_web_search(query, count=count, api_key=api_key)
    for r in records:
        open_and_read(r)
    inspected = sum(r.inspected for r in records)
    return {
        "query": query,
        "sources": [r.to_dict() for r in records],
        "research_summary": {
            "inspected_webpages": inspected,
            "snippet_only_results": len(records) - inspected,
            "note": (
                f"Reviewed {inspected} webpages (actually opened and read). "
                "Remaining results are search-result snippets only."
            ),
        },
    }
