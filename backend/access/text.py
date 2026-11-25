"""Pasted text -> AccessDoc raw blocks.

Blank lines separate paragraphs; lines inside a paragraph are joined.
Markdown-style structure is recognised:
- ``#`` .. ``######`` headings (the first ``#`` heading is the title when no
  title is given; other levels are rank-compressed so the shallowest is h2),
- ``-``, ``*``, ``+`` and ``•`` bullets, ``1.`` / ``1)`` numbered items
  (an indented item starts a nested list block, as for DOCX),
- inline ``**bold**``, ``__bold__``, ``*italic*``, ``_italic_`` and
  ``[text](https://…)`` links, which become ``paragraph.marks``.
Lines that look like maths become ``math`` blocks.
"""

from __future__ import annotations

import re

from .common import clean_text, looks_like_math, math_block, paragraph_block, rich_from_segments, safe_href

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_BULLET = re.compile(r"^(\s*)[-*+•]\s+(.+)$")
_NUMBER = re.compile(r"^(\s*)\d{1,3}[.)]\s+(.+)$")
_INLINE = re.compile(
    r"\*\*(?P<b1>.+?)\*\*"
    r"|__(?P<b2>.+?)__"
    r"|\[(?P<lt>[^\]\n]+)\]\((?P<lh>[^)\s]+)\)"
    r"|(?<![\w*])\*(?!\s)(?P<i1>[^*\n]+?)(?<!\s)\*(?![\w*])"
    r"|(?<![\w_])_(?!\s)(?P<i2>[^_\n]+?)(?<!\s)_(?![\w_])"
)
DEFAULT_TITLE = "Pasted text"


def parse_inline(s: str) -> tuple[str, list[dict]]:
    segs = []
    at = 0
    for m in _INLINE.finditer(s):
        if m.start() > at:
            segs.append((s[at:m.start()], []))
        if m.group("b1") or m.group("b2"):
            segs.append((m.group("b1") or m.group("b2"), [{"type": "bold"}]))
        elif m.group("lt"):
            href = safe_href(m.group("lh"))
            segs.append((m.group("lt"), [{"type": "link", "href": href}] if href else []))
        else:
            segs.append((m.group("i1") or m.group("i2"), [{"type": "italic"}]))
        at = m.end()
    if at < len(s):
        segs.append((s[at:], []))
    return rich_from_segments(segs)


def _plain(s: str) -> str:
    return parse_inline(s)[0]


def text_to_raw(text: str, title: str | None = None) -> tuple[str, list[dict]]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    raw: list[dict] = []
    para: list[str] = []
    lst: dict | None = None
    title = clean_text(title or "")

    def close_para():
        nonlocal para
        if para:
            joined = " ".join(x.strip() for x in para)
            if len(para) == 1 and looks_like_math(joined):
                raw.append(math_block(clean_text(joined)))
            else:
                t, marks = parse_inline(joined)
                if t:
                    raw.append(paragraph_block(t, marks))
        para = []

    def close_list():
        nonlocal lst
        if lst and lst["items"]:
            raw.append({"type": "list", "ordered": lst["ordered"], "items": lst["items"]})
        lst = None

    for line in lines:
        if not line.strip():
            close_para()
            close_list()
            continue
        h = _HEADING.match(line.strip())
        if h:
            close_para()
            close_list()
            raw.append({"type": "heading", "text": _plain(h.group(2)), "_src_level": len(h.group(1))})
            continue
        m = _BULLET.match(line) or _NUMBER.match(line)
        if m:
            close_para()
            ordered = m.re is _NUMBER
            indent = len(m.group(1).expandtabs(4))
            level = indent // 2
            if lst is None or lst["ordered"] != ordered or lst["level"] != level:
                close_list()
                lst = {"ordered": ordered, "level": level, "items": []}
            lst["items"].append(_plain(m.group(2)))
            continue
        if lst is not None and line.startswith((" ", "\t")) and lst["items"]:
            lst["items"][-1] = clean_text(lst["items"][-1] + " " + _plain(line))
            continue
        close_list()
        para.append(line)
    close_para()
    close_list()

    headings = [b for b in raw if b["type"] == "heading"]
    if not title and headings and headings[0]["_src_level"] == 1 and raw[0] is headings[0]:
        title = headings[0]["text"]
        raw.remove(headings[0])
        headings = headings[1:]
    if not title and raw and raw[0]["type"] == "paragraph":
        first = raw[0]["text"]
        if len(first) <= 80 and not first.endswith((".", "?", "!", ":", ";", ",")) and len(raw) > 1:
            title = first
            raw.pop(0)
    used = sorted({b["_src_level"] for b in headings})
    rank = {lvl: min(6, i + 2) for i, lvl in enumerate(used)}
    for b in headings:
        b["level"] = rank[b.pop("_src_level")]
    return title or DEFAULT_TITLE, raw
