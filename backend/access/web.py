"""Web article HTML -> AccessDoc raw blocks, keeping structure.

The main content container is chosen the way ``routers/scrape.py`` does it
(``article``, then ``main``), extended with ``[role=main]`` and a text-density
fallback; the same navigation/footer noise is removed and the same noise
patterns filter short boilerplate paragraphs. Unlike the old scraper,
headings, lists, tables, figures and images are kept as blocks
(``html_blocks.HtmlConverter``). When fewer than two text blocks come out,
newspaper3k's article text is used as a paragraph-only fallback.

Images are returned as placeholders carrying ``_remote_src``; the router
downloads them through the SSRF-safe fetcher and drops the ones that fail.
HTML ``alt=""`` marks an image decorative; a missing alt leaves it for AI
description; a non-empty alt is kept as author alt text (for review).
"""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlsplit

from .common import clean_text, image_block, meaningful_alt, safe_href
from .html_blocks import HtmlConverter

_NOISE_ATTR = re.compile(
    r"(^|[\s_-])(comment|comments|share|sharing|social|related|promo|newsletter|cookie|consent|sidebar|"
    r"advert|ads|subscribe|breadcrumb|byline-share|popup|modal|paywall|footer|masthead|skip-link)([\s_-]|$)",
    re.IGNORECASE,
)
MAX_IMAGES = 15


def _noise_patterns():
    try:
        from routers.scrape import _NOISE_PATTERNS

        return _NOISE_PATTERNS
    except Exception:  # pragma: no cover
        return re.compile(r"^(share|subscribe|advertisement|cookie policy|privacy policy)", re.IGNORECASE)


def _title(soup) -> str:
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        return clean_text(og["content"])
    if soup.title and soup.title.get_text(strip=True):
        t = clean_text(soup.title.get_text(" "))
        return re.split(r"\s[\|\-–—]\s", t)[0].strip()
    h1 = soup.find("h1")
    return clean_text(h1.get_text(" ")) if h1 else ""


def _container(soup):
    articles = soup.find_all("article")
    if articles:
        return max(articles, key=lambda a: len(a.get_text(" ", strip=True)))
    for sel in ("main", '[role="main"]', "#content", ".content", "#main"):
        el = soup.select_one(sel)
        if el is not None and len(el.get_text(" ", strip=True)) > 200:
            return el
    best, best_len = None, 0
    for div in soup.find_all(["div", "section"]):
        n = sum(len(p.get_text(" ", strip=True)) for p in div.find_all("p", recursive=False))
        if n > best_len:
            best, best_len = div, n
    if best is not None and best_len > 300:
        return best
    return soup.body or soup


def _strip_noise(root):
    for tag in root.find_all(["script", "style", "noscript", "nav", "header", "footer", "aside", "form",
                              "button", "iframe", "svg", "template"]):
        tag.decompose()
    for tag in root.find_all(attrs={"role": ["navigation", "banner", "contentinfo", "complementary", "search"]}):
        tag.decompose()
    for tag in root.find_all(attrs={"aria-hidden": "true"}):
        tag.decompose()
    for tag in list(root.find_all(True)):
        if getattr(tag, "decomposed", False):
            continue
        attrs = getattr(tag, "attrs", None) or {}
        ident = " ".join([attrs.get("id") or ""] + list(attrs.get("class") or []))
        if ident and _NOISE_ATTR.search(ident) and tag.name not in ("body", "html", "article", "main"):
            tag.decompose()


def html_to_raw(html: str, base_url: str) -> tuple[str, list[dict], str]:
    """Returns (title, raw_blocks, lang). Image blocks carry ``_remote_src`` (or a data URL ``src``)."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    title = _title(soup)
    lang = ""
    if soup.html and soup.html.get("lang"):
        lang = clean_text(soup.html["lang"])[:20]
    container = _container(soup)
    _strip_noise(container)

    count = 0

    def href(h: str) -> str | None:
        return safe_href(urljoin(base_url, h.strip())) if h else None

    def resolve(tag):
        nonlocal count
        src = tag.get("src") or tag.get("data-src") or tag.get("data-original") or ""
        if not src and tag.get("srcset"):
            src = tag["srcset"].split(",")[0].strip().split(" ")[0]
        src = src.strip()
        if not src or count >= MAX_IMAGES:
            return None
        try:
            w = int(tag.get("width") or 0)
            h = int(tag.get("height") or 0)
        except ValueError:
            w = h = 0
        if (w and w < 40) or (h and h < 40):
            return None  # icons, tracking pixels
        if src.startswith("data:image/"):
            remote = None
        else:
            absolute = urljoin(base_url, src)
            if urlsplit(absolute).scheme not in ("http", "https"):
                return None
            remote = absolute
        count += 1
        blk = image_block("")  # src is filled by resolve_images()
        blk["_remote_src"] = remote
        if remote is None:
            blk["_inline_src"] = src
        alt = tag.get("alt")
        if alt is not None and not alt.strip():
            blk["altStatus"] = "decorative"
            blk["_skip_ai"] = True
        elif meaningful_alt(alt):
            blk["alt"], blk["altStatus"], blk["_author_alt"] = meaningful_alt(alt), "ai", True
        return blk

    raw = HtmlConverter(image_resolver=resolve, base_href=href).convert(container)

    noise = _noise_patterns()
    raw = [
        b for b in raw
        if not (b["type"] == "paragraph" and len(b["text"]) < 60 and noise.match(b["text"]))
    ]
    headings = [b for b in raw if b["type"] == "heading"]
    if headings and title and headings[0]["_src_level"] == 1 and (
        headings[0]["text"].lower() in title.lower() or title.lower() in headings[0]["text"].lower()
    ):
        title = headings[0]["text"] if len(headings[0]["text"]) > len(title) / 2 else title
        raw.remove(headings[0])
        headings = headings[1:]
    if not title and headings and headings[0]["_src_level"] == 1:
        title = headings[0]["text"]
        raw.remove(headings[0])
        headings = headings[1:]
    used = sorted({b["_src_level"] for b in headings})
    rank = {lvl: min(6, i + 2) for i, lvl in enumerate(used)}
    for b in headings:
        b["level"] = rank[b.pop("_src_level")]
        b.pop("_doc_title", None)

    if sum(1 for b in raw if b["type"] in ("paragraph", "list", "table")) < 2:
        fallback = _newspaper_paragraphs(html, base_url)
        if fallback:
            raw = [{"type": "paragraph", "text": t} for t in fallback]
    return title, raw, lang


def _newspaper_paragraphs(html: str, url: str) -> list[str]:
    try:
        from newspaper import Article

        art = Article(url)
        art.download(input_html=html)
        art.parse()
        return [clean_text(p) for p in art.text.split("\n") if len(clean_text(p)) >= 40]
    except Exception:
        return []


async def resolve_images(raw: list[dict], budget_s: float = 15.0) -> list[dict]:
    """Download remote images through the SSRF-safe fetcher; drop the ones that fail."""
    import asyncio
    import base64

    from .common import image_to_data_url
    from .fetch import safe_fetch

    sem = asyncio.Semaphore(4)

    async def one(b):
        if b.get("_inline_src"):
            try:
                data = base64.b64decode(b["_inline_src"].split(",", 1)[1], validate=False)
            except Exception:
                return
        else:
            async with sem:
                try:
                    res = await safe_fetch(b["_remote_src"], timeout=8.0)
                except Exception:
                    return
            data = res.body
        enc = image_to_data_url(data)
        if enc and enc[1] >= 40 and enc[2] >= 40:
            b["src"] = enc[0]

    targets = [b for b in raw if b["type"] == "image" and (b.get("_remote_src") or b.get("_inline_src"))]
    if targets:
        try:
            await asyncio.wait_for(asyncio.gather(*(one(b) for b in targets)), timeout=budget_s)
        except asyncio.TimeoutError:
            pass
    return [b for b in raw if b["type"] != "image" or b.get("src")]
