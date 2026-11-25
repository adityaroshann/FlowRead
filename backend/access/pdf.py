"""Structured PDF extraction with PyMuPDF.

``extract_pdf(data)`` returns ``(title, raw_blocks, lang)``. Raw blocks are
ordered AccessDoc blocks (without ids); ``common.build_doc`` turns them into
sections.

Pipeline per document:
1. Collect every horizontal text line with its dominant font size, boldness
   and its styled segments (bold / italic / link) for ``paragraph.marks``.
2. Find the body font size (most common size weighted by character count).
3. Drop running headers/footers (lines repeated in the top/bottom 8% of most
   pages) and bare page numbers.
4. Per page:
   - scanned page (under ~40 characters of text and an image covering more
     than 60% of the page): the page is rendered to PNG and becomes an
     ``image`` block with ``origin: "page"``; with an API key the AI step
     transcribes it into blocks (``ai.page_to_blocks``), capped per document.
   - tables (``find_tables``; when none are ruled, a guarded text-alignment
     pass finds borderless tables), raster images, and vector diagrams
     (clusters of drawing paths rendered to PNG, ``origin: "vector"``).
     Text inside tables and images is excluded. A page-sized background image
     (over 80% of the page) never hides text; it is kept as a decorative image.
   - elements are ordered by column, then y.
5. Classify lines (heading / list item / maths / body) and merge body lines
   into paragraphs, repairing hyphenation.
6. Paragraphs that continue across a page break are merged (see
   ``_merge_across_pages``).
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Callable

from .common import (
    MIN_IMAGE_SIDE,
    clean_text,
    decorative_image_block,
    finalize_marks,
    fix_join,
    image_block,
    image_to_data_url,
    looks_like_header,
    looks_like_math,
    match_list_item,
    math_block,
    rich_from_segments,
    rich_join,
)

ProgressFn = Callable[[str, str, int], None]

MARGIN_FRAC = 0.08
SCAN_MAX_CHARS = 40  # a page with less text than this ...
SCAN_IMAGE_FRAC = 0.60  # ... and an image covering more than this is a scan
BACKGROUND_IMAGE_FRAC = 0.80  # images covering more than this never hide text
MAX_OCR_PAGES = 15  # scanned pages sent to the vision model per document
MAX_MATH_PAGES = 10  # maths-heavy pages sent to the vision model per document
MATH_PAGE_MIN_GLYPHS = 15
RENDER_DPI = 150
VISION_MAX_SIDE = 1600
VECTOR_MIN_PATHS = 4
VECTOR_MIN_SIDE = 30.0
VECTOR_MIN_AREA = 3600.0  # pt², about 2 x 2 cm

_PAGE_NUM_RE = re.compile(
    r"^(?:page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:of|/)\s*\d{1,4})?$", re.IGNORECASE
)
_FIG_CAPTION_RE = re.compile(r"^(?:figure|fig\.|image|diagram|chart|photo|illustration)\s*\d*", re.IGNORECASE)
_TABLE_CAPTION_RE = re.compile(r"^(?:table|tab\.)\s*\d+", re.IGNORECASE)
_BAD_META_TITLE = re.compile(r"(\.(docx?|pdf|pptx?|txt|tex)$)|^(microsoft\s|untitled)", re.IGNORECASE)
_BOLD_FONT_RE = re.compile(r"bold|black|heavy|semibold|demi", re.IGNORECASE)
_ITALIC_FONT_RE = re.compile(r"italic|oblique", re.IGNORECASE)
_MATH_FONT_RE = re.compile(r"CMMI|CMSY|CMEX|MSAM|MSBM|Symbol|Math|STIX|MTPro|MT\s?Extra|Euclid|rsfs", re.IGNORECASE)
# "1.2 Title", "2.3.1 Methods", "Chapter 3", "Section II: ..."
_NUMBERED_HEADING_RE = re.compile(
    r"^(?:\d{1,2}(?:\.\d{1,2}){1,3}\.?\s+\S"
    r"|(?:chapter|section|part|unit|lesson|module|topic|appendix)\s+(?:\d{1,3}|[ivxlc]{1,6}|[A-Z])\b)",
    re.IGNORECASE,
)
_SENTENCE_END_RE = re.compile(r"[.!?…:][\"'”’)\]]*$")


def _noop(step: str, message: str, pct: int) -> None:  # pragma: no cover
    pass


def _norm_key(text: str) -> str:
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", text.lower())).strip()


def _similar(a: str, b: str) -> bool:
    na = re.sub(r"[^a-z0-9]", "", a.lower())
    nb = re.sub(r"[^a-z0-9]", "", b.lower())
    return bool(na and nb) and (na == nb or na in nb or nb in na)


def _center_in(bbox, rect, pad: float = 1.0) -> bool:
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    return rect[0] - pad <= cx <= rect[2] + pad and rect[1] - pad <= cy <= rect[3] + pad


def _area(r) -> float:
    return max(0.0, r[2] - r[0]) * max(0.0, r[3] - r[1])


def _coverage(rect, page_rect) -> float:
    """Fraction of the page covered by ``rect`` (clipped to the page)."""
    x0, y0 = max(rect[0], page_rect[0]), max(rect[1], page_rect[1])
    x1, y1 = min(rect[2], page_rect[2]), min(rect[3], page_rect[3])
    return _area((x0, y0, x1, y1)) / max(1.0, _area(page_rect))


def _is_math_char(ch: str) -> bool:
    o = ord(ch)
    return (
        0x2200 <= o <= 0x22FF  # mathematical operators
        or 0x2A00 <= o <= 0x2AFF  # supplemental operators
        or 0x27C0 <= o <= 0x27EF
        or 0x2980 <= o <= 0x29FF
        or 0x1D400 <= o <= 0x1D7FF  # mathematical alphanumerics
        or 0x2070 <= o <= 0x209F  # super/subscripts
        or 0x0391 <= o <= 0x03C9  # Greek
        or 0x2190 <= o <= 0x21FF  # arrows
    )


def _render_png(page, clip=None, dpi: int = RENDER_DPI, max_side: int = VISION_MAX_SIDE) -> bytes:
    import fitz

    rect = clip or page.rect
    zoom = dpi / 72
    longest = max(rect.width, rect.height) * zoom
    if longest > max_side:
        zoom = max_side / max(rect.width, rect.height)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    return pix.tobytes("png")


# ---------------------------------------------------------------------------
# Line collection
# ---------------------------------------------------------------------------


def _collect_lines(page, page_no: int) -> tuple[list[dict], int]:
    """Text lines on the page, plus the count of maths glyphs (for maths-page detection)."""
    import fitz

    flags = fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES
    d = page.get_text("dict", flags=flags)
    links = []
    try:
        for ln in page.get_links():
            if ln.get("kind") == fitz.LINK_URI and ln.get("uri"):
                links.append((tuple(ln["from"]), ln["uri"]))
    except Exception:
        links = []

    lines = []
    math_glyphs = 0
    for block in d.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            dx, dy = line.get("dir", (1, 0))
            if abs(dy) > 0.1 or dx < 0:
                continue  # rotated/vertical text (often margin labels)
            all_spans = line.get("spans", [])
            spans = [s for s in all_spans if s.get("text", "").strip()]
            if not spans:
                continue
            size_weight: Counter = Counter()
            bold_chars = 0
            total = 0
            segs = []
            for s in all_spans:
                txt = s.get("text", "")
                font = s.get("font", "")
                n = len(txt.strip())
                is_bold = bool((s.get("flags", 0) & 16) or _BOLD_FONT_RE.search(font))
                is_italic = bool((s.get("flags", 0) & 2) or _ITALIC_FONT_RE.search(font))
                if n:
                    size_weight[round(s["size"] * 2) / 2] += n
                    total += n
                    if is_bold:
                        bold_chars += n
                    if _MATH_FONT_RE.search(font):
                        math_glyphs += n
                    else:
                        math_glyphs += sum(1 for ch in txt if _is_math_char(ch))
                attrs = []
                if is_bold:
                    attrs.append({"type": "bold"})
                if is_italic:
                    attrs.append({"type": "italic"})
                for rect, uri in links:
                    if _center_in(s["bbox"], rect, pad=2):
                        attrs.append({"type": "link", "href": uri})
                        break
                segs.append((txt, attrs))
            text, marks = rich_from_segments(segs)
            text_c = clean_text(text)
            if not text_c:
                continue
            if text_c != text:  # defensive: keep text and marks consistent
                marks = []
                text = text_c
            size = size_weight.most_common(1)[0][0]
            bold = total > 0 and bold_chars / total >= 0.6
            lines.append(
                {
                    "kind": "line",
                    "page": page_no,
                    "block": block.get("number", 0),
                    "bbox": tuple(line["bbox"]),
                    "text": text,
                    "marks": marks,
                    "size": size,
                    "bold": bold,
                    "chars": total,
                }
            )
    return lines, math_glyphs


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------


def _table_from_rows(rows, bbox, row0, lines) -> dict:
    in_tab = [ln for ln in lines if _center_in(ln["bbox"], bbox)]
    first = [ln for ln in in_tab if _center_in(ln["bbox"], row0)]
    rest = [ln for ln in in_tab if ln not in first]
    first_bold = bool(first) and all(ln["bold"] for ln in first)
    rest_bold = bool(rest) and all(ln["bold"] for ln in rest)
    is_header = looks_like_header(rows[0], rows[1:], first_bold and not rest_bold)
    headers = rows[0] if is_header else []
    body = rows[1:] if is_header else rows
    return {
        "kind": "table",
        "bbox": bbox,
        "block": {"type": "table", "caption": None, "headers": headers, "rows": body},
    }


def _clean_rows(raw) -> list[list[str]]:
    return [[clean_text((c or "").replace("\n", " ")) for c in r] for r in raw]


def _ruled_tables(page, lines: list[dict]) -> list[dict]:
    try:
        found = page.find_tables()
    except Exception:
        return []
    tables = []
    for tab in getattr(found, "tables", []):
        try:
            rows = _clean_rows(tab.extract())
        except Exception:
            continue
        rows = [r for r in rows if any(c for c in r)]
        if len(rows) < 2 or max(len(r) for r in rows) < 2:
            continue
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        bbox = tuple(tab.bbox)
        try:
            row0 = tuple(tab.rows[0].bbox)
        except Exception:
            row0 = (bbox[0], bbox[1], bbox[2], bbox[1] + (bbox[3] - bbox[1]) / len(rows))
        tables.append(_table_from_rows(rows, bbox, row0, lines))
    return tables


def _plausible_text_table(rows: list[list[str]]) -> bool:
    """Guards for borderless tables found by text alignment (prose must not pass)."""
    if len(rows) < 3:
        return False
    width = len(rows[0])
    if width < 2 or width > 12 or any(len(r) != width for r in rows):
        return False
    filled = [sum(1 for c in r if c) for r in rows]
    # Consistent column count: every row fills (nearly) every column.
    if min(filled) < max(2, width - 1):
        return False
    for ci in range(width):
        if sum(1 for r in rows if r[ci]) < math.ceil(len(rows) * 2 / 3):
            return False
    cells = [c for r in rows for c in r if c]
    if max(len(c) for c in cells) > 60 or sum(len(c) for c in cells) / len(cells) > 30:
        return False
    # Prose split into "columns" leaves sentences running across cells.
    sentence_cells = sum(1 for c in cells if len(c.split()) >= 5)
    if sentence_cells > len(cells) * 0.25:
        return False
    return True


def _text_tables(page, lines: list[dict]) -> list[dict]:
    """Borderless tables: column positions from PyMuPDF's text strategy, cells rebuilt from words.

    A row is "clean" when no word straddles a column boundary. Prose that the
    text strategy splits into columns always cuts through words, so rows of
    prose above or below a table are trimmed and a table with an unclean row
    inside it is rejected. Cell text is rebuilt from the page's words so
    nothing is cut off at the table's right edge.
    """
    try:
        found = page.find_tables(strategy="text")
    except Exception:
        return []
    tables_found = getattr(found, "tables", [])
    if not tables_found:
        return []
    words = page.get_text("words")
    tables = []
    for tab in tables_found:
        try:
            row_objs = list(tab.rows)
            bounds = sorted({round(c[0], 1) for r in row_objs for c in r.cells[1:] if c})
        except Exception:
            continue
        if not bounds:
            continue
        x_left = tab.bbox[0]

        def row_words(rb):
            return [w for w in words if rb[1] - 1 <= (w[1] + w[3]) / 2 <= rb[3] + 1 and w[2] > x_left - 1]

        def cells_of(rb):
            ws = row_words(rb)
            clean = not any(w[0] < b - 0.5 and w[2] > b + 0.5 for w in ws for b in bounds)
            cols = [[] for _ in range(len(bounds) + 1)]
            for w in sorted(ws, key=lambda w: w[0]):
                ci = sum(1 for b in bounds if w[0] >= b - 0.5)
                cols[ci].append(w[4])
            return [clean_text(" ".join(c)) for c in cols], clean

        rows_info = []
        for r in row_objs:
            rb = tuple(r.bbox)
            cells, clean = cells_of(rb)
            if any(cells):
                rows_info.append((cells, clean, rb))
        while rows_info and (not rows_info[0][1] or sum(1 for c in rows_info[0][0] if c) <= 1):
            rows_info.pop(0)
        while rows_info and (not rows_info[-1][1] or sum(1 for c in rows_info[-1][0] if c) <= 1):
            rows_info.pop()
        if not rows_info or not all(clean for _, clean, _ in rows_info):
            continue
        rows = [cells for cells, _, _ in rows_info]
        keep = [ci for ci in range(len(rows[0])) if any(r[ci] for r in rows)]
        rows = [[r[ci] for ci in keep] for r in rows]
        if not _plausible_text_table(rows):
            continue
        boxes = [rb for _, _, rb in rows_info]
        x1 = max([b[2] for b in boxes] + [w[2] for b in boxes for w in row_words(b)])
        bbox = (min(b[0] for b in boxes), min(b[1] for b in boxes), x1, max(b[3] for b in boxes))
        tables.append(_table_from_rows(rows, bbox, boxes[0], lines))
    return tables


def _find_tables(page, lines: list[dict]) -> list[dict]:
    tables = _ruled_tables(page, lines)
    if not tables:
        tables = _text_tables(page, lines)
    return tables


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------


def _image_bytes(doc, xref: int, info: dict) -> tuple[bytes, str]:
    import fitz

    smask = info.get("smask") or 0
    ext = info.get("ext", "png")
    if smask or ext not in ("png", "jpeg", "jpg", "bmp", "gif", "tiff"):
        pix = fitz.Pixmap(doc, xref)
        if smask:
            try:
                pix = fitz.Pixmap(pix, fitz.Pixmap(doc, smask))
            except Exception:
                pass
        if pix.n - pix.alpha >= 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        return pix.tobytes("png"), "png"
    return info["image"], ext


def _image_rects(page) -> list[tuple[int, tuple]]:
    out = []
    for img in page.get_images(full=True):
        try:
            for r in page.get_image_rects(img[0]):
                out.append((img[0], tuple(r)))
        except Exception:
            continue
    return out


def _find_images(doc, page, repeated_xrefs: set[int]) -> list[dict]:
    """Raster images. Each element has ``background`` True when it covers most of the page."""
    images = []
    seen = set()
    for img in page.get_images(full=True):
        xref = img[0]
        if xref in seen or xref in repeated_xrefs:
            continue
        seen.add(xref)
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        if not rects:
            continue
        rect = rects[0]
        if rect.width < MIN_IMAGE_SIDE / 2 or rect.height < MIN_IMAGE_SIDE / 2:
            continue  # drawn tiny on the page: an icon or bullet
        try:
            info = doc.extract_image(xref)
        except Exception:
            continue
        if not info or info.get("width", 0) < MIN_IMAGE_SIDE or info.get("height", 0) < MIN_IMAGE_SIDE:
            continue
        try:
            data, ext = _image_bytes(doc, xref, info)
        except Exception:
            continue
        enc = image_to_data_url(data, ext)
        if not enc:
            continue
        background = _coverage(tuple(rect), tuple(page.rect)) > BACKGROUND_IMAGE_FRAC
        block = decorative_image_block(enc[0]) if background else image_block(enc[0])
        images.append({"kind": "image", "bbox": tuple(rect), "block": block, "background": background})
    return images


def _cluster(rects: list[tuple], gap: float = 8.0) -> list[dict]:
    """Union rectangles that touch (after growing by ``gap``). Returns [{bbox, n}]."""
    clusters: list[dict] = []
    for r in sorted(rects, key=lambda r: (r[1], r[0])):
        g = (r[0] - gap, r[1] - gap, r[2] + gap, r[3] + gap)
        hits = [c for c in clusters if not (g[2] < c["bbox"][0] or g[0] > c["bbox"][2] or g[3] < c["bbox"][1] or g[1] > c["bbox"][3])]
        box = list(r)
        n = 1
        for c in hits:
            b = c["bbox"]
            box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
            n += c["n"]
            clusters.remove(c)
        clusters.append({"bbox": tuple(box), "n": n})
    # One more pass: merging can make previously separate clusters overlap.
    changed = True
    while changed:
        changed = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                a, b = clusters[i]["bbox"], clusters[j]["bbox"]
                if not (a[2] + gap < b[0] or b[2] + gap < a[0] or a[3] + gap < b[1] or b[3] + gap < a[1]):
                    clusters[i] = {
                        "bbox": (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])),
                        "n": clusters[i]["n"] + clusters[j]["n"],
                    }
                    del clusters[j]
                    changed = True
                    break
            if changed:
                break
    return clusters


def _find_vector_figures(page, lines: list[dict], blocked: list[tuple]) -> list[dict]:
    """Drawing-dense regions (charts, diagrams) rendered to PNG.

    Ignores page borders/backgrounds, table rulings (anything inside a table),
    isolated rules and underlines (a cluster needs several paths and a real
    2-D extent) and shaded text boxes (regions whose text is mostly sentences).
    Returns elements; each has ``labels``: the text lines inside it that are
    short labels and so are part of the picture.
    """
    import fitz

    try:
        paths = page.get_drawings()
    except Exception:
        return []
    pr = tuple(page.rect)
    rects = []
    for p in paths[:5000]:
        r = p.get("rect")
        if r is None:
            continue
        r = (r.x0, r.y0, r.x1, r.y1)
        if _coverage(r, pr) > 0.5:
            continue  # page border or background fill
        if any(_center_in(r, b, pad=3) for b in blocked):
            continue  # table rulings, image frames
        rects.append(r)
    if len(rects) < VECTOR_MIN_PATHS:
        return []
    out = []
    for c in _cluster(rects):
        x0, y0, x1, y1 = c["bbox"]
        w, h = x1 - x0, y1 - y0
        if c["n"] < VECTOR_MIN_PATHS or w < VECTOR_MIN_SIDE or h < VECTOR_MIN_SIDE or w * h < VECTOR_MIN_AREA:
            continue
        inside = [ln for ln in lines if _center_in(ln["bbox"], c["bbox"], pad=2)]
        long_chars = sum(len(ln["text"]) for ln in inside if len(ln["text"]) >= 40 or len(ln["text"].split()) > 6)
        all_chars = sum(len(ln["text"]) for ln in inside)
        if all_chars and long_chars / all_chars > 0.6:
            continue  # a shaded/boxed passage of text, not a diagram
        clip = fitz.Rect(x0 - 4, y0 - 4, x1 + 4, y1 + 4) & page.rect
        try:
            png = _render_png(page, clip=clip, max_side=1200)
        except Exception:
            continue
        enc = image_to_data_url(png, "png")
        if not enc:
            continue
        labels = inside if long_chars == 0 else []
        out.append({"kind": "image", "bbox": tuple(clip), "block": image_block(enc[0], origin="vector"), "labels": labels})
    return out


# ---------------------------------------------------------------------------
# Reading order
# ---------------------------------------------------------------------------


def _order_elements(elements: list[dict], page_width: float) -> list[dict]:
    """Sort elements in reading order, handling two-column layouts.

    Each element is Left, Right or Full width relative to the page midline.
    A page is two-column when it has at least three left and three right text
    lines. Then, walking down the page, full-width elements act as band
    separators: within a band the whole left column is read before the right.
    """
    mid = page_width / 2
    tol = page_width * 0.02

    def side(e):
        x0, _, x1, _ = e["bbox"]
        if x1 <= mid + tol:
            return "L"
        if x0 >= mid - tol:
            return "R"
        return "F"

    for e in elements:
        e["_side"] = side(e)
    n_left = sum(1 for e in elements if e["kind"] == "line" and e["_side"] == "L")
    n_right = sum(1 for e in elements if e["kind"] == "line" and e["_side"] == "R")
    by_y = sorted(elements, key=lambda e: (round(e["bbox"][1], 1), e["bbox"][0]))
    if n_left < 3 or n_right < 3:
        return by_y

    out: list[dict] = []
    left: list[dict] = []
    right: list[dict] = []

    def flush():
        out.extend(sorted(left, key=lambda e: e["bbox"][1]))
        out.extend(sorted(right, key=lambda e: e["bbox"][1]))
        left.clear()
        right.clear()

    for e in by_y:
        if e["_side"] == "F":
            flush()
            out.append(e)
        elif e["_side"] == "L":
            left.append(e)
        else:
            right.append(e)
    flush()
    return out


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------


def _merge_across_pages(raw: list[dict]) -> list[dict]:
    """Join a paragraph that a page break split in two.

    Pattern: ``paragraph P, pageMarker M, paragraph Q`` where P does not end in
    sentence punctuation and Q starts with a lowercase letter (or P ends with
    a comma, semicolon or hyphen). The merged paragraph takes P's place and
    the page marker moves after it: ``P+Q, M``. So the marker still sits
    between the two pages' content, and "page N" navigation lands just after
    the paragraph that started on page N-1.
    """
    out: list[dict] = []
    i = 0
    while i < len(raw):
        b = raw[i]
        if (
            b["type"] == "paragraph"
            and i + 2 < len(raw)
            and raw[i + 1]["type"] == "pageMarker"
            and raw[i + 2]["type"] == "paragraph"
        ):
            p, q = b, raw[i + 2]
            pt, qt = p["text"].rstrip(), q["text"].lstrip()
            first_alpha = next((ch for ch in qt if ch.isalpha()), "")
            continues = bool(first_alpha) and first_alpha.islower() and qt[:1] == first_alpha
            dangling = pt.endswith((",", ";", "-", "–"))
            if not _SENTENCE_END_RE.search(pt) and (continues or dangling):
                text, marks = rich_join(p["text"], p.get("_marks", []), q["text"], q.get("_marks", []))
                merged = {**p, "text": text, "_marks": marks}
                # Further continuation onto the following page is handled by re-checking.
                raw = raw[:i] + [merged, raw[i + 1]] + raw[i + 3 :]
                continue
        out.append(b)
        i += 1
    return out


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------


def _catalog_lang(doc) -> str:
    try:
        kind, val = doc.xref_get_key(doc.pdf_catalog(), "Lang")
        if kind == "string" and val.strip():
            return val.strip()
    except Exception:
        pass
    return ""


def extract_pdf(data: bytes, progress: ProgressFn | None = None) -> tuple[str, list[dict], str]:
    """Returns (title, raw_blocks, lang). ``lang`` is "" when the PDF has no /Lang."""
    import fitz

    from . import ai

    progress = progress or _noop
    use_vision = ai.has_api_key()
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        raise ValueError("This PDF is password protected.")
    n_pages = doc.page_count
    if n_pages == 0:
        raise ValueError("This PDF has no pages.")

    # ---- 1. lines for every page ------------------------------------------------
    pages = []
    for i, page in enumerate(doc):
        lines, math_glyphs = _collect_lines(page, i + 1)
        pages.append({"page": page, "no": i + 1, "lines": lines, "math": math_glyphs})
        progress("layout", f"Reading page layout ({i + 1} of {n_pages})…", 2 + int(28 * (i + 1) / n_pages))

    # Scanned pages: almost no text and an image over most of the page.
    for p in pages:
        chars = sum(ln["chars"] for ln in p["lines"])
        p["scanned"] = chars < SCAN_MAX_CHARS and any(
            _coverage(r, tuple(p["page"].rect)) > SCAN_IMAGE_FRAC for _, r in _image_rects(p["page"])
        )

    all_lines = [ln for p in pages if not p["scanned"] for ln in p["lines"]]
    if not all_lines and not any(p["scanned"] for p in pages):
        raise ValueError("No text or images found in this PDF. It may be blank.")

    # ---- 2. body size --------------------------------------------------------------
    weight: Counter = Counter()
    for ln in all_lines:
        weight[ln["size"]] += ln["chars"]
    body = weight.most_common(1)[0][0] if weight else 11.0

    # ---- 3. running headers / footers / page numbers ---------------------------
    key_pages: dict[str, set[int]] = defaultdict(set)
    for p in pages:
        h = p["page"].rect.height
        for ln in p["lines"]:
            if ln["bbox"][3] <= h * MARGIN_FRAC or ln["bbox"][1] >= h * (1 - MARGIN_FRAC):
                ln["_margin"] = True
                key_pages[_norm_key(ln["text"])].add(p["no"])
    threshold = max(2, math.ceil(n_pages * 0.5))
    repeated = {k for k, v in key_pages.items() if n_pages >= 2 and len(v) >= threshold}
    for p in pages:
        h = p["page"].rect.height
        kept = []
        for ln in p["lines"]:
            near_edge = ln["bbox"][3] <= h * 0.15 or ln["bbox"][1] >= h * 0.85
            if ln.get("_margin") and _norm_key(ln["text"]) in repeated:
                continue
            if near_edge and _PAGE_NUM_RE.match(ln["text"]):
                continue
            kept.append(ln)
        p["lines"] = kept

    # ---- title -------------------------------------------------------------------
    first_text = next((p for p in pages if not p["scanned"] and p["lines"]), None)
    first_lines = first_text["lines"] if first_text and first_text["no"] == 1 else []
    title_lines: list[dict] = []
    if first_lines:
        max_size = max(ln["size"] for ln in first_lines)
        if max_size >= body * 1.3:
            cand = [ln for ln in first_lines if ln["size"] == max_size]
            # Keep the first contiguous run (title may wrap over several lines).
            title_lines = [cand[0]]
            for ln in cand[1:]:
                prev = title_lines[-1]
                if ln["bbox"][1] - prev["bbox"][3] < ln["size"] * 1.2:
                    title_lines.append(ln)
                else:
                    break
    visual_title = " ".join(ln["text"] for ln in title_lines)
    meta_title = (doc.metadata or {}).get("title", "") or ""
    meta_title = clean_text(meta_title)
    if meta_title and not _BAD_META_TITLE.search(meta_title) and len(meta_title) >= 3:
        title = meta_title
        if visual_title and not _similar(visual_title, meta_title):
            title_lines = []  # keep the big text as content
    else:
        title = visual_title
    title_ids = {id(ln) for ln in title_lines}

    # ---- 4. tables, images, ordering ------------------------------------------
    img_pages: dict[int, set[int]] = defaultdict(set)
    for p in pages:
        for img in p["page"].get_images(full=True):
            img_pages[img[0]].add(p["no"])
    repeated_xrefs = (
        {x for x, v in img_pages.items() if len(v) >= max(3, math.ceil(n_pages * 0.5))} if n_pages >= 3 else set()
    )

    n_tables = 0
    n_ocr = 0
    n_math_pages = 0
    page_elements = []
    for p in pages:
        page = p["page"]
        if p["scanned"]:
            try:
                png = _render_png(page)
            except Exception:
                png = b""
            enc = image_to_data_url(png, "png") if png else None
            elems = []
            if enc:
                blk = image_block(enc[0], context=f"Document: {title}" if title else "", origin="page")
                if use_vision and n_ocr < MAX_OCR_PAGES:
                    blk["_scan_png"] = png
                    n_ocr += 1
                elems.append({"kind": "image", "bbox": tuple(page.rect), "block": blk})
            page_elements.append((p["no"], elems, page.rect.width, None))
            continue

        lines = [ln for ln in p["lines"] if id(ln) not in title_ids]
        tables = _find_tables(page, lines)
        images = _find_images(doc, page, repeated_xrefs)
        blocked = [t["bbox"] for t in tables] + [im["bbox"] for im in images if not im["background"]]
        vectors = _find_vector_figures(page, lines, blocked)
        n_tables += len(tables)
        # Text inside a table or a (non-background) image is part of it.
        regions = blocked
        label_ids = {id(ln) for v in vectors for ln in v["labels"]}
        lines = [
            ln for ln in lines if id(ln) not in label_ids and not any(_center_in(ln["bbox"], r) for r in regions)
        ]
        figures = [im for im in images if not im["background"]] + vectors
        backgrounds = [im for im in images if im["background"]]

        # Captions: a "Table N" line just above a table, a "Figure N" line just below an image.
        for t in tables:
            for ln in sorted(lines, key=lambda l: -l["bbox"][3]):
                gap = t["bbox"][1] - ln["bbox"][3]
                if 0 <= gap <= 30 and _TABLE_CAPTION_RE.match(ln["text"]):
                    t["block"]["caption"] = ln["text"]
                    lines.remove(ln)
                    break
        for im in figures:
            for ln in sorted(lines, key=lambda l: l["bbox"][1]):
                gap = ln["bbox"][1] - im["bbox"][3]
                if 0 <= gap <= 40 and _FIG_CAPTION_RE.match(ln["text"]):
                    im["block"]["caption"] = ln["text"]
                    lines.remove(ln)
                    break

        ordered = backgrounds + _order_elements(lines + tables + figures, page.rect.width)
        math_png = None
        if use_vision and p["math"] >= MATH_PAGE_MIN_GLYPHS and n_math_pages < MAX_MATH_PAGES:
            math_png = page  # rendered lazily below, only if the page has maths blocks
        page_elements.append((p["no"], ordered, page.rect.width, math_png))
        progress("tables", f"Detecting tables (page {p['no']} of {n_pages})…", 30 + int(15 * p["no"] / n_pages))

    progress("tables", f"Found {n_tables} table{'s' if n_tables != 1 else ''}.", 45)

    # ---- 5. heading tiers ----------------------------------------------------------
    def heading_key(ln, isolated: bool):
        t = ln["text"]
        if len(t) > 120:
            return None
        numbered = bool(_NUMBERED_HEADING_RE.match(t))
        if t.endswith(".") and not re.match(r"^\d+(\.\d+)*\.?\s", t):
            return None
        if match_list_item(t) and ln["size"] < body * 1.15:
            return None
        if ln["size"] >= body * 1.15:
            return (ln["size"], ln["bold"])
        short = len(t.split()) <= 12 and not t.endswith((".", ",", ";", ":", "!", "?"))
        if numbered and short and ln["size"] >= body * 0.95:
            return (ln["size"], True)
        # Bold at body size: only when it stands alone between gaps (not a bold
        # phrase that starts a paragraph or a bold label inside a list).
        if ln["bold"] and short and isolated and ln["size"] >= body * 0.95:
            return (ln["size"], True)
        return None

    def isolated_at(elems, i) -> bool:
        ln = elems[i]
        gap_need = ln["size"] * 0.5

        def gap(a, b):
            return b["bbox"][1] - a["bbox"][3]

        prev = elems[i - 1] if i > 0 else None
        nxt = elems[i + 1] if i + 1 < len(elems) else None
        above = prev is None or prev["kind"] != "line" or gap(prev, ln) > gap_need
        below = nxt is None or nxt["kind"] != "line" or gap(ln, nxt) > gap_need
        return above and below

    keys = set()
    for _, elems, _, _ in page_elements:
        for i, e in enumerate(elems):
            if e["kind"] == "line":
                e["_hkey"] = None if looks_like_math(e["text"]) else heading_key(e, isolated_at(elems, i))
                if e["_hkey"]:
                    keys.add(e["_hkey"])
    tiers: list[tuple[float, bool]] = []
    level_of: dict = {}
    for k in sorted(keys, key=lambda k: (-k[0], not k[1])):
        if tiers and abs(tiers[-1][0] - k[0]) < 0.75 and tiers[-1][1] == k[1]:
            level_of[k] = level_of[tiers[-1]]
            continue
        tiers.append(k)
        level_of[k] = min(4, len(tiers) + 1)

    # ---- 6. lines -> blocks --------------------------------------------------------
    raw: list[dict] = []
    for page_no, elems, width, math_page in page_elements:
        raw.append({"type": "pageMarker", "n": page_no})
        page_maths: list[dict] = []
        para: dict | None = None
        lst: dict | None = None
        prev_line: dict | None = None

        def close_para():
            nonlocal para
            if para and para["text"].strip():
                raw.append({"type": "paragraph", "text": para["text"].strip(), "_marks": para["marks"]})
            para = None

        def close_list():
            nonlocal lst
            if lst and lst["items"]:
                raw.append({"type": "list", "ordered": lst["ordered"], "items": lst["items"]})
            lst = None

        def gap_from(prev, ln):
            if prev is None:
                return 1e9
            return ln["bbox"][1] - prev["bbox"][3]

        for e in elems:
            if e["kind"] != "line":
                close_para()
                close_list()
                raw.append(e["block"])
                prev_line = None
                continue
            ln = e
            text = ln["text"]
            gap = gap_from(prev_line, ln)
            same_flow = (
                prev_line is not None
                and -2 < gap < ln["size"] * 0.6
                and abs(ln["bbox"][0] - prev_line["bbox"][0]) < width * 0.25
            )

            hk = ln.get("_hkey")
            if hk:
                close_para()
                close_list()
                level = level_of[hk]
                last = raw[-1] if raw else None
                if last is not None and last["type"] == "heading" and last.get("_hk") == hk and same_flow:
                    last["text"] = fix_join(last["text"], text)
                else:
                    raw.append({"type": "heading", "text": text, "level": level, "_hk": hk})
                prev_line = ln
                continue

            item = match_list_item(text)
            if item:
                close_para()
                ordered, body_text = item
                if lst is None or lst["ordered"] != ordered:
                    close_list()
                    lst = {"ordered": ordered, "items": [], "x0": ln["bbox"][0]}
                lst["items"].append(body_text)
                prev_line = ln
                continue

            if looks_like_math(text):
                close_para()
                close_list()
                mb = math_block(text)
                raw.append(mb)
                page_maths.append(mb)
                prev_line = ln
                continue

            # Continuation of a wrapped list item: indented past the marker.
            if lst is not None and same_flow and ln["bbox"][0] > lst["x0"] + ln["size"] * 0.5:
                lst["items"][-1] = fix_join(lst["items"][-1], text)
                prev_line = ln
                continue
            close_list()

            indented = prev_line is not None and ln["bbox"][0] > prev_line["bbox"][0] + ln["size"] * 1.5
            if para is not None and same_flow and not indented:
                para["text"], para["marks"] = rich_join(para["text"], para["marks"], text, ln["marks"])
            else:
                close_para()
                para = {"text": text, "marks": list(ln["marks"])}
            prev_line = ln
        close_para()
        close_list()

        if math_page is not None and page_maths:
            try:
                png = _render_png(math_page)
                n_math_pages += 1
                for mb in page_maths:
                    mb["_math_png"] = png  # one shared bytes object per page
            except Exception:
                pass

    lang = _catalog_lang(doc)
    doc.close()

    raw = _merge_across_pages(raw)
    for b in raw:
        if b["type"] == "paragraph":
            fm = finalize_marks(b["text"], b.pop("_marks", None))
            if fm:
                b["marks"] = fm

    # Image context: nearest heading + surrounding text (used for alt text).
    for i, b in enumerate(raw):
        if b["type"] != "image" or b.get("origin") == "page":
            continue
        heading = next((raw[j]["text"] for j in range(i - 1, -1, -1) if raw[j]["type"] == "heading"), title)
        before = next((raw[j]["text"] for j in range(i - 1, -1, -1) if raw[j]["type"] == "paragraph"), "")
        after = ""
        for j in range(i + 1, len(raw)):
            if raw[j]["type"] == "heading":
                break
            if raw[j]["type"] == "paragraph":
                after = raw[j]["text"]
                break
        parts = [f"Section: {heading}" if heading else "", before[-500:], after[:300]]
        if b.get("caption"):
            parts.append(f"Caption: {b['caption']}")
        b["_context"] = "\n".join(p for p in parts if p)

    for b in raw:
        b.pop("_hk", None)
    return title, raw, lang
