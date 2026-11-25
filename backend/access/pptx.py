"""PPTX to AccessDoc raw blocks (python-pptx).

Each slide becomes one section: a level-2 heading (the title placeholder's
text, or "Slide N" when the slide has no title), then a ``pageMarker`` whose
``n`` is the slide number, then the slide content in visual order (top to
bottom, then left to right):

- text frames: bulleted paragraphs become ``list`` blocks (ordered for
  auto-numbered bullets); a change of indent level starts a new list block,
  the same flat-contract rule as nested DOCX/HTML lists. Other paragraphs
  become ``paragraph`` blocks with bold/italic/link marks.
- tables become ``table`` blocks (first row is the header when PowerPoint's
  "header row" option is on, or when it looks like one).
- pictures become ``image`` blocks; the author's alt text (``descr``) is kept
  for staff review, like DOCX.
- speaker notes become a ``paragraph`` with ``role: "notes"`` at the end.
Group shapes are walked recursively. Slide numbers, dates and footers are
skipped.
"""

from __future__ import annotations

import io

from .common import (
    MIN_IMAGE_SIDE,
    clean_text,
    image_block,
    image_to_data_url,
    looks_like_header,
    meaningful_alt,
    paragraph_block,
    rich_from_segments,
)

A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def _a(tag: str) -> str:
    return f"{{{A_NS}}}{tag}"


def _ph_type(shape):
    try:
        if shape.is_placeholder:
            return shape.placeholder_format.type
    except Exception:
        pass
    return None


def _bullet_kind(paragraph, in_body: bool) -> str | None:
    """'bullet', 'number' or None for a text paragraph."""
    ppr = paragraph._p.pPr
    if ppr is not None:
        if ppr.find(_a("buNone")) is not None:
            return None
        if ppr.find(_a("buAutoNum")) is not None:
            return "number"
        if ppr.find(_a("buChar")) is not None or ppr.find(_a("buBlip")) is not None:
            return "bullet"
    return "bullet" if in_body else None


def _paragraph_rich(paragraph) -> tuple[str, list[dict]]:
    segs = []
    for r in paragraph.runs:
        attrs = []
        try:
            if r.font.bold:
                attrs.append({"type": "bold"})
            if r.font.italic:
                attrs.append({"type": "italic"})
            href = r.hyperlink.address if r.hyperlink is not None else None
            if href:
                attrs.append({"type": "link", "href": href})
        except Exception:
            pass
        segs.append((r.text, attrs))
    if not segs:
        segs = [(paragraph.text, [])]
    return rich_from_segments(segs)


def _text_frame_blocks(shape, in_body: bool) -> list[dict]:
    out: list[dict] = []
    lst = None

    def close():
        nonlocal lst
        if lst and lst["items"]:
            out.append({"type": "list", "ordered": lst["ordered"], "items": lst["items"]})
        lst = None

    paragraphs = [p for p in shape.text_frame.paragraphs if clean_text(p.text)]
    for p in paragraphs:
        text, marks = _paragraph_rich(p)
        if not text:
            continue
        kind = _bullet_kind(p, in_body and len(paragraphs) > 1)
        if kind:
            ordered = kind == "number"
            level = p.level or 0
            if lst is None or lst["ordered"] != ordered or lst["level"] != level:
                close()
                lst = {"ordered": ordered, "level": level, "items": []}
            lst["items"].append(text)
        else:
            close()
            out.append(paragraph_block(text, marks))
    close()
    return out


def _table_block(shape) -> dict | None:
    table = shape.table
    rows = [[clean_text(c.text.replace("\n", " ")) for c in r.cells] for r in table.rows]
    rows = [r for r in rows if any(r)]
    if not rows:
        return None
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    try:
        first_row_flag = bool(table.first_row)
    except Exception:
        first_row_flag = False
    is_header = first_row_flag or looks_like_header(rows[0], rows[1:], False)
    return {"type": "table", "caption": None, "headers": rows[0] if is_header else [], "rows": rows[1:] if is_header else rows}


def _picture_block(shape) -> dict | None:
    try:
        blob = shape.image.blob
    except Exception:
        return None
    enc = image_to_data_url(blob)
    if not enc or enc[1] < MIN_IMAGE_SIDE or enc[2] < MIN_IMAGE_SIDE:
        return None
    blk = image_block(enc[0])
    try:
        descr = meaningful_alt(shape._element.xpath("./*[1]/p:cNvPr")[0].get("descr"))
    except Exception:
        descr = ""
    if descr:
        blk["alt"], blk["altStatus"], blk["_author_alt"] = descr, "ai", True
    return blk


def _shape_key(shape):
    return (shape.top if shape.top is not None else 0, shape.left if shape.left is not None else 0)


def _shape_blocks(shapes, title_shape) -> list[dict]:
    from pptx.enum.shapes import MSO_SHAPE_TYPE
    from pptx.enum.shapes import PP_PLACEHOLDER as PH

    skip_ph = {PH.TITLE, PH.CENTER_TITLE, PH.VERTICAL_TITLE, PH.SLIDE_NUMBER, PH.DATE, PH.FOOTER, PH.HEADER}
    body_ph = {PH.BODY, PH.OBJECT, PH.VERTICAL_BODY, PH.VERTICAL_OBJECT}
    out: list[dict] = []
    for shape in sorted(shapes, key=_shape_key):
        if title_shape is not None and shape.shape_id == title_shape.shape_id:
            continue
        ph = _ph_type(shape)
        if ph in skip_ph:
            continue
        try:
            st = shape.shape_type
        except Exception:
            st = None
        if st == MSO_SHAPE_TYPE.GROUP:
            out.extend(_shape_blocks(shape.shapes, None))
        elif getattr(shape, "has_table", False) and shape.has_table:
            tb = _table_block(shape)
            if tb:
                out.append(tb)
        elif st == MSO_SHAPE_TYPE.PICTURE or hasattr(shape, "image"):
            blk = _picture_block(shape)
            if blk:
                out.append(blk)
        elif getattr(shape, "has_text_frame", False) and shape.has_text_frame:
            out.extend(_text_frame_blocks(shape, ph in body_ph))
    return out


def extract_pptx(data: bytes, progress=None) -> tuple[str, list[dict], str]:
    """Returns (title, raw_blocks, lang)."""
    from pptx import Presentation

    progress = progress or (lambda *a: None)
    prs = Presentation(io.BytesIO(data))
    title = clean_text(prs.core_properties.title or "")
    lang = clean_text(prs.core_properties.language or "")
    raw: list[dict] = []
    slides = list(prs.slides)
    for n, slide in enumerate(slides, start=1):
        title_shape = slide.shapes.title
        heading = clean_text(title_shape.text_frame.text.replace("\n", " ")) if title_shape is not None and title_shape.has_text_frame else ""
        if n == 1 and not title and heading:
            title = heading
        raw.append({"type": "heading", "text": heading or f"Slide {n}", "level": 2})
        raw.append({"type": "pageMarker", "n": n})
        content = _shape_blocks(slide.shapes, title_shape)
        for b in content:
            if b["type"] == "image":
                b["_context"] = f"Slide {n}: {heading}" if heading else f"Slide {n}"
        raw.extend(content)
        if slide.has_notes_slide:
            notes = clean_text(slide.notes_slide.notes_text_frame.text.replace("\n", " ")) if slide.notes_slide.notes_text_frame else ""
            if notes:
                raw.append(paragraph_block(notes, role="notes"))
        progress("layout", f"Reading slides ({n} of {len(slides)})…", 2 + int(40 * n / max(1, len(slides))))
    if not slides:
        raise ValueError("This presentation has no slides.")
    progress("tables", f"Found {sum(1 for b in raw if b['type'] == 'table')} tables.", 45)
    return title, raw, lang
