"""Semantic HTML -> AccessDoc raw blocks.

Shared by the DOCX converter (mammoth produces the HTML) and the web-article
converter. Only structure is kept: h1-h6, p, ul/ol, table, img (+ alt),
figure/figcaption, blockquote, pre, dl. Inline ``strong/b``, ``em/i`` and
``a[href]`` become ``paragraph.marks``.

Nested lists: the contract's ``list.items`` is a flat string array, so a
nested list is emitted as its own ``list`` block straight after the parent
item that contains it, and the parent's remaining items continue in a new
``list`` block. Reading order is preserved and nothing is flattened into the
item text; an ordered parent that is split this way restarts its numbering
in renderers (a known limitation of the flat contract).

Placeholders (DOCX only, inserted before mammoth runs):
- ``MATH_OPEN + n + MATH_CLOSE``: OMML equation ``n``. A paragraph that holds
  only equations becomes ``math`` blocks; an equation inside running text is
  replaced by its plain text.
- ``PAGE_BREAK``: a page break. A ``pageMarker`` for the next page is
  emitted after the block that contains it (same placement rule as PDF
  paragraphs that continue across pages).
"""

from __future__ import annotations

import re
from typing import Callable

from .common import (
    clean_text,
    looks_like_header,
    looks_like_math,
    math_block,
    paragraph_block,
    rich_from_segments,
)

MATH_OPEN, MATH_CLOSE, PAGE_BREAK = "", "", ""
_MATH_RE = re.compile(MATH_OPEN + r"(\d+)" + MATH_CLOSE)

SKIP_TAGS = {
    "script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed",
    "form", "button", "input", "select", "textarea", "nav", "video", "audio", "map", "head",
}
INLINE_TAGS = {
    "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s",
    "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "br", "del", "ins",
    "label", "font", "big", "tt", "strike",
}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
_FIG_CAPTION_RE = re.compile(r"^(?:figure|fig\.|image|diagram|chart)\s*\d*", re.IGNORECASE)
_TABLE_CAPTION_RE = re.compile(r"^(?:table|tab\.)\s*\d+", re.IGNORECASE)

# resolver(img_tag) -> raw image block or None
ImageResolver = Callable[[object], "dict | None"]


class HtmlConverter:
    def __init__(
        self,
        image_resolver: ImageResolver | None = None,
        math_texts: list[str] | None = None,
        page_breaks: bool = False,
        base_href: Callable[[str], str | None] | None = None,
    ):
        self.resolve_image = image_resolver or (lambda tag: None)
        self.math_texts = math_texts or []
        self.page_breaks = page_breaks
        self.base_href = base_href or (lambda h: h)
        self.raw: list[dict] = []
        self.page = 1
        self._pending_breaks = 0
        self._buffer: list = []

    # ---- inline -----------------------------------------------------------------

    def _segments(self, node, attrs: tuple, out: list, images: list):
        from bs4 import NavigableString, Tag

        if isinstance(node, NavigableString):
            if type(node).__name__ in ("Comment", "Doctype", "ProcessingInstruction", "Declaration", "CData"):
                return
            out.append((str(node), [dict(a) for a in attrs]))
            return
        if not isinstance(node, Tag):
            return
        name = node.name
        if name in SKIP_TAGS:
            return
        if name == "img":
            images.append(node)
            return
        if name == "br":
            out.append((" ", []))
            return
        if name in ("ul", "ol", "table"):
            return  # handled as blocks by the caller
        a = attrs
        if name in ("strong", "b"):
            a = a + ((("type", "bold"),),)
        elif name in ("em", "i", "cite", "dfn"):
            a = a + ((("type", "italic"),),)
        elif name == "a" and node.get("href"):
            href = self.base_href(node.get("href"))
            if href:
                a = a + ((("type", "link"), ("href", href)),)
        for child in node.children:
            self._segments(child, a, out, images)

    def rich(self, nodes) -> tuple[str, list[dict], list]:
        segs: list = []
        images: list = []
        for n in nodes:
            self._segments(n, (), segs, images)
        text, marks = rich_from_segments(segs)
        return text, marks, images

    # ---- placeholders --------------------------------------------------------------

    def _take_breaks(self, text: str) -> str:
        n = text.count(PAGE_BREAK)
        if n:
            self._pending_breaks += n
            text = clean_text(text.replace(PAGE_BREAK, " "))
        return text

    def _flush_breaks(self):
        while self._pending_breaks:
            self._pending_breaks -= 1
            self.page += 1
            if self.page_breaks:
                self.raw.append({"type": "pageMarker", "n": self.page})

    def _math_text(self, m: re.Match) -> str:
        i = int(m.group(1))
        return self.math_texts[i] if i < len(self.math_texts) else ""

    # ---- blocks ----------------------------------------------------------------------

    def _emit_images(self, images):
        for tag in images:
            blk = self.resolve_image(tag)
            if blk:
                self.raw.append(blk)

    def _emit_text(self, text: str, marks: list[dict], role: str | None = None, kind: str = "p"):
        """Emit a paragraph (or math blocks for an equation-only paragraph)."""
        text = self._take_breaks(text)
        if _MATH_RE.search(text):
            rest = _MATH_RE.sub("", text).strip()
            if not rest:
                for m in _MATH_RE.finditer(text):
                    t = self._math_text(m)
                    if t:
                        self.raw.append(math_block(t))
                return
            # Equation inside running text: its plain text, marks dropped (offsets shift).
            text = clean_text(_MATH_RE.sub(lambda m: self._math_text(m), text))
            marks = []
        if not text:
            return
        if kind == "p" and looks_like_math(text):
            self.raw.append(math_block(text))
            return
        self.raw.append(paragraph_block(text, marks, role=role))

    def flush_inline(self):
        if not self._buffer:
            return
        nodes, self._buffer = self._buffer, []
        text, marks, images = self.rich(nodes)
        self._emit_images(images)
        self._emit_text(text, marks)
        self._flush_breaks()

    def heading(self, tag, level: int, doc_title: bool = False):
        text, _, images = self.rich(tag.children)
        text = self._take_breaks(text)
        text = clean_text(_MATH_RE.sub(lambda m: self._math_text(m), text))
        self._emit_images(images)
        if text:
            blk = {"type": "heading", "text": text, "_src_level": level}
            if doc_title:
                blk["_doc_title"] = True
            self.raw.append(blk)
        self._flush_breaks()

    def paragraph(self, tag):
        classes = tag.get("class") or []
        text, marks, images = self.rich(tag.children)
        self._emit_images(images)
        plain = clean_text(_MATH_RE.sub("", text.replace(PAGE_BREAK, " ")))
        is_caption = "caption" in classes or (
            plain and _FIG_CAPTION_RE.match(plain) and self.raw and self.raw[-1]["type"] == "image"
        )
        if is_caption and plain:
            last = self.raw[-1] if self.raw else None
            if last and last["type"] == "image" and not last.get("caption"):
                last["caption"] = plain
            elif last and last["type"] == "table" and not last.get("caption"):
                last["caption"] = plain
            else:
                self._emit_text(text, marks, role="caption")
            self._take_breaks(text)
        elif "subtitle" in classes:
            self._emit_text(text, marks)
        else:
            self._emit_text(text, marks)
        self._flush_breaks()

    def list_(self, tag):
        ordered = tag.name == "ol"
        items: list[str] = []

        def flush():
            nonlocal items
            if items:
                self.raw.append({"type": "list", "ordered": ordered, "items": items})
            items = []

        later_images = []
        for li in tag.find_all("li", recursive=False):
            inline = [c for c in li.children if getattr(c, "name", None) not in ("ul", "ol", "table")]
            text, _, images = self.rich(inline)
            later_images.extend(images)
            text = self._take_breaks(text)
            text = clean_text(_MATH_RE.sub(lambda m: self._math_text(m), text))
            if text:
                items.append(text)
            nested = [c for c in li.children if getattr(c, "name", None) in ("ul", "ol", "table")]
            if nested:
                flush()
                for n in nested:
                    if n.name == "table":
                        self.table(n)
                    else:
                        self.list_(n)
        flush()
        self._emit_images(later_images)
        self._flush_breaks()

    def table(self, tag):
        rows: list[list[str]] = []
        th_first = False
        bold_first = False
        cell_images = []
        trs = [tr for tr in tag.find_all("tr") if tr.find_parent("table") is tag]
        thead = tag.find("thead")
        for ri, tr in enumerate(trs):
            cells = [c for c in tr.find_all(["td", "th"], recursive=False)]
            row = []
            for c in cells:
                text, marks, images = self.rich(c.children)
                # Nested lists/tables in a cell: keep their text.
                for sub in c.find_all(["li", "td", "th"]):
                    t2 = clean_text(sub.get_text(" "))
                    if t2 and t2 not in text:
                        text = (text + " " + t2).strip()
                cell_images.extend(images)
                text = clean_text(_MATH_RE.sub(lambda m: self._math_text(m), self._take_breaks(text)))
                row.append(text)
                try:
                    span = max(1, min(20, int(c.get("colspan", 1))))
                except (TypeError, ValueError):
                    span = 1
                row.extend([""] * (span - 1))
            if ri == 0:
                th_first = bool(cells) and all(c.name == "th" for c in cells)
                filled = [c for c in cells if clean_text(c.get_text(" "))]
                bold_first = bool(filled) and all(self._cell_all_bold(c) for c in filled)
            if any(row):
                rows.append(row)
        if not rows:
            self._emit_images(cell_images)
            return
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        first_in_thead = thead is not None and trs and trs[0].find_parent("thead") is thead
        is_header = th_first or first_in_thead or looks_like_header(rows[0], rows[1:], bool(bold_first))
        caption = None
        cap = tag.find("caption")
        if cap is not None:
            caption = clean_text(cap.get_text(" ")) or None
        elif self.raw and self.raw[-1]["type"] == "paragraph" and _TABLE_CAPTION_RE.match(self.raw[-1]["text"]):
            caption = self.raw.pop()["text"]
        self.raw.append(
            {
                "type": "table",
                "caption": caption,
                "headers": rows[0] if is_header else [],
                "rows": rows[1:] if is_header else rows,
            }
        )
        # Images inside cells follow the table (a table cell can only hold text).
        self._emit_images(cell_images)
        self._flush_breaks()

    @staticmethod
    def _cell_all_bold(cell) -> bool:
        text = clean_text(cell.get_text(" "))
        bold = clean_text(" ".join(b.get_text(" ") for b in cell.find_all(["strong", "b"])))
        return bool(text) and bold == text

    def figure(self, tag):
        cap_tag = tag.find("figcaption")
        caption = clean_text(cap_tag.get_text(" ")) if cap_tag else ""
        start = len(self.raw)
        for child in tag.children:
            if child is cap_tag:
                continue
            self.node(child)
        self.flush_inline()
        if caption:
            target = next((b for b in self.raw[start:] if b["type"] in ("image", "table")), None)
            if target is not None and not target.get("caption"):
                target["caption"] = caption
            else:
                self.raw.append(paragraph_block(caption, role="caption"))

    # ---- dispatcher ------------------------------------------------------------------

    def node(self, node):
        from bs4 import NavigableString, Tag

        if isinstance(node, NavigableString):
            if type(node).__name__ in ("Comment", "Doctype", "ProcessingInstruction", "Declaration", "CData"):
                return
            if str(node).strip():
                self._buffer.append(node)
            elif self._buffer:
                self._buffer.append(node)
            return
        if not isinstance(node, Tag):
            return
        name = node.name
        if name in SKIP_TAGS:
            return
        if name in INLINE_TAGS:
            self._buffer.append(node)
            return
        if name == "img":
            self.flush_inline()
            self._emit_images([node])
            return
        self.flush_inline()
        if name in HEADING_TAGS:
            self.heading(node, int(name[1]), doc_title="doc-title" in (node.get("class") or []))
        elif name == "p":
            self.paragraph(node)
        elif name in ("ul", "ol"):
            self.list_(node)
        elif name == "table":
            self.table(node)
        elif name == "figure":
            self.figure(node)
        elif name == "hr":
            if "page-break" in (node.get("class") or []):
                self._pending_breaks += 1
                self._flush_breaks()
        elif name == "pre":
            text = clean_text(node.get_text(" "))
            if text:
                self.raw.append(paragraph_block(text))
        elif name in ("dt", "dd", "figcaption", "caption", "summary", "address"):
            text, marks, images = self.rich(node.children)
            self._emit_images(images)
            self._emit_text(text, marks)
        else:  # containers: div, section, article, main, blockquote, li outside lists, body…
            for child in node.children:
                self.node(child)
            self.flush_inline()

    def convert(self, root) -> list[dict]:
        for child in list(root.children):
            self.node(child)
        self.flush_inline()
        self._flush_breaks()
        return self.raw
