"""DOCX to AccessDoc raw blocks, using paragraph styles, tables and inline images."""

from __future__ import annotations

import io
import re

from .common import (
    MIN_IMAGE_SIDE,
    clean_text,
    image_block,
    image_to_data_url,
    looks_like_header,
    looks_like_math,
    match_list_item,
    math_block,
)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"


def _w(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


_HEADING_STYLE = re.compile(r"^heading\s*(\d)$", re.IGNORECASE)
_FIG_CAPTION_RE = re.compile(r"^(?:figure|fig\.|image|diagram|chart)\s*\d*", re.IGNORECASE)
_TABLE_CAPTION_RE = re.compile(r"^(?:table|tab\.)\s*\d+", re.IGNORECASE)


def _style_name(p) -> str:
    try:
        return p.style.name or ""
    except Exception:
        return ""


def _num_format(doc, p) -> str | None:
    """Return the numFmt (e.g. 'bullet', 'decimal') for a numbered paragraph, or None."""
    ppr = p._p.pPr
    if ppr is None or ppr.numPr is None:
        return None
    try:
        num_id = ppr.numPr.numId.val
        ilvl = ppr.numPr.ilvl.val if ppr.numPr.ilvl is not None else 0
        numbering = doc.part.numbering_part.element
        num = next(n for n in numbering.iter(_w("num")) if n.get(_w("numId")) == str(num_id))
        abs_id = num.find(_w("abstractNumId")).get(_w("val"))
        absn = next(a for a in numbering.iter(_w("abstractNum")) if a.get(_w("abstractNumId")) == abs_id)
        lvl = next(l for l in absn.iter(_w("lvl")) if l.get(_w("ilvl")) == str(ilvl))
        return lvl.find(_w("numFmt")).get(_w("val"))
    except Exception:
        return "bullet"


def _paragraph_images(doc, p) -> list[tuple[bytes, str]]:
    """(blob, author_alt) for each inline/anchored picture in the paragraph."""
    out = []
    for drawing in p._p.iter(_w("drawing")):
        descr = ""
        for dp in drawing.iter(f"{{{WP_NS}}}docPr"):
            descr = (dp.get("descr") or "").strip()
        for blip in drawing.iter(f"{{{A_NS}}}blip"):
            rid = blip.get(f"{{{R_NS}}}embed")
            if not rid:
                continue
            try:
                out.append((doc.part.related_parts[rid].blob, descr))
            except Exception:
                continue
    return out


def _math_text(p) -> str:
    parts = []
    for om in p._p.iter(f"{{{M_NS}}}oMath"):
        parts.append("".join(t.text or "" for t in om.iter(f"{{{M_NS}}}t")))
    return clean_text(" ".join(parts))


def _has_page_break(p) -> bool:
    for br in p._p.iter(_w("br")):
        if br.get(_w("type")) == "page":
            return True
    return any(True for _ in p._p.iter(_w("lastRenderedPageBreak")))


def _table_block(table) -> dict | None:
    rows: list[list[str]] = []
    first_bold = False
    first_marked_header = False
    for ri, row in enumerate(table.rows):
        cells = []
        seen = set()
        for cell in row.cells:
            if id(cell._tc) in seen:
                continue  # horizontally merged cell repeats
            seen.add(id(cell._tc))
            cells.append(clean_text(cell.text.replace("\n", " ")))
        if ri == 0:
            trpr = row._tr.trPr
            first_marked_header = trpr is not None and trpr.find(_w("tblHeader")) is not None
            runs = [r for c in row.cells for para in c.paragraphs for r in para.runs if r.text.strip()]
            first_bold = bool(runs) and all(r.bold for r in runs)
        if any(cells):
            rows.append(cells)
    if not rows:
        return None
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    is_header = first_marked_header or looks_like_header(rows[0], rows[1:], first_bold)
    return {
        "type": "table",
        "caption": None,
        "headers": rows[0] if is_header else [],
        "rows": rows[1:] if is_header else rows,
    }


def extract_docx(data: bytes, progress=None) -> tuple[str, list[dict], str]:
    """Returns (title, raw_blocks, lang)."""
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    progress = progress or (lambda *a: None)
    doc = Document(io.BytesIO(data))
    progress("layout", "Reading document structure…", 10)

    title = clean_text(doc.core_properties.title or "")
    lang = ""
    try:
        lang_el = doc.styles.element.find(f".//{_w('rPrDefault')}//{_w('lang')}")
        if lang_el is not None:
            lang = lang_el.get(_w("val")) or ""
    except Exception:
        pass

    raw: list[dict] = []
    title_from_style = False
    page = 1
    page_breaks = any(_has_page_break(p) for p in doc.paragraphs)
    if page_breaks:
        raw.append({"type": "pageMarker", "n": 1})

    lst: dict | None = None

    def close_list():
        nonlocal lst
        if lst and lst["items"]:
            raw.append({"type": "list", "ordered": lst["ordered"], "items": lst["items"]})
        lst = None

    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == _w("tbl"):
            close_list()
            tb = _table_block(Table(child, doc))
            if tb:
                prev = raw[-1] if raw else None
                if prev and prev["type"] == "paragraph" and _TABLE_CAPTION_RE.match(prev["text"]):
                    tb["caption"] = raw.pop()["text"]
                raw.append(tb)
            continue
        if child.tag != _w("p"):
            continue
        p = Paragraph(child, doc)
        style = _style_name(p)
        text = clean_text(p.text)

        for blob, descr in _paragraph_images(doc, p):
            enc = image_to_data_url(blob)
            if not enc or enc[1] < MIN_IMAGE_SIDE or enc[2] < MIN_IMAGE_SIDE:
                continue
            close_list()
            blk = image_block(enc[0])
            if descr:
                # Author-supplied alt text: keep it, but staff must still review it.
                blk["alt"] = descr
                blk["altStatus"] = "ai"
                blk["_author_alt"] = True
            raw.append(blk)

        math_text = _math_text(p)
        if math_text:
            close_list()
            raw.append(math_block(math_text))
            text = ""

        if text:
            sl = style.lower()
            m = _HEADING_STYLE.match(style)
            if sl == "title":
                close_list()
                if not title_from_style:
                    title = text
                    title_from_style = True
                else:
                    raw.append({"type": "heading", "text": text, "level": 1, "_docx_level": 1})
            elif sl == "subtitle":
                close_list()
                raw.append({"type": "paragraph", "text": text})
            elif m:
                close_list()
                raw.append({"type": "heading", "text": text, "_docx_level": int(m.group(1))})
            elif sl == "caption" or (_FIG_CAPTION_RE.match(text) and raw and raw[-1]["type"] == "image"):
                close_list()
                if raw and raw[-1]["type"] == "image" and not raw[-1].get("caption"):
                    raw[-1]["caption"] = text
                else:
                    raw.append({"type": "paragraph", "text": text})
            else:
                fmt = _num_format(doc, p)
                is_list = "list" in sl or fmt is not None
                ordered = ("number" in sl) or (fmt not in (None, "bullet", "none"))
                body_text = text
                if not is_list:
                    item = match_list_item(text)
                    if item:
                        is_list = True
                        ordered, body_text = item
                if is_list:
                    if lst is None or lst["ordered"] != ordered:
                        close_list()
                        lst = {"ordered": ordered, "items": []}
                    lst["items"].append(body_text)
                elif looks_like_math(text):
                    close_list()
                    raw.append(math_block(text))
                else:
                    close_list()
                    raw.append({"type": "paragraph", "text": text})

        if page_breaks and _has_page_break(p):
            close_list()
            page += 1
            raw.append({"type": "pageMarker", "n": page})

    close_list()
    if raw and raw[-1]["type"] == "pageMarker":
        raw.pop()

    # Title fallback: the first Heading 1 when there is no Title style/property.
    headings = [b for b in raw if b["type"] == "heading"]
    if not title and headings and headings[0]["_docx_level"] == 1:
        title = headings[0]["text"]
        raw.remove(headings[0])
        headings = headings[1:]

    # Rank-compress heading levels so the shallowest becomes h2 (title is h1).
    used = sorted({b["_docx_level"] for b in headings})
    rank = {lvl: min(6, i + 2) for i, lvl in enumerate(used)}
    for b in headings:
        b["level"] = rank[b.pop("_docx_level")]

    # Image context.
    for i, b in enumerate(raw):
        if b["type"] != "image":
            continue
        heading = next((raw[j]["text"] for j in range(i - 1, -1, -1) if raw[j]["type"] == "heading"), title)
        before = next((raw[j]["text"] for j in range(i - 1, -1, -1) if raw[j]["type"] == "paragraph"), "")
        parts = [f"Section: {heading}" if heading else "", before[-500:]]
        if b.get("caption"):
            parts.append(f"Caption: {b['caption']}")
        b["_context"] = "\n".join(x for x in parts if x)

    progress("tables", f"Found {sum(1 for b in raw if b['type'] == 'table')} tables.", 45)
    return title, raw, lang
