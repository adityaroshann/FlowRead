"""Structured PDF extraction with PyMuPDF.

``extract_pdf(data)`` returns ``(title, raw_blocks)``. Raw blocks are ordered
AccessDoc blocks (without ids); ``common.build_doc`` turns them into sections.

Pipeline per document:
1. Collect every horizontal text line with its dominant font size and boldness.
2. Find the body font size (most common size weighted by character count).
3. Drop running headers/footers (lines repeated in the top/bottom 8% of most
   pages) and bare page numbers.
4. Per page: detect tables (``find_tables``) and images (``get_images``),
   exclude the text inside them, and order all elements by column, then y.
5. Classify lines (heading / list item / maths / body) and merge body lines
   into paragraphs, repairing hyphenation.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Callable

from .common import (
    MIN_IMAGE_SIDE,
    clean_text,
    fix_join,
    image_block,
    image_to_data_url,
    looks_like_header,
    looks_like_math,
    match_list_item,
    math_block,
)

ProgressFn = Callable[[str, str, int], None]

MARGIN_FRAC = 0.08
_PAGE_NUM_RE = re.compile(
    r"^(?:page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:of|/)\s*\d{1,4})?$", re.IGNORECASE
)
_FIG_CAPTION_RE = re.compile(r"^(?:figure|fig\.|image|diagram|chart|photo|illustration)\s*\d*", re.IGNORECASE)
_TABLE_CAPTION_RE = re.compile(r"^(?:table|tab\.)\s*\d+", re.IGNORECASE)
_BAD_META_TITLE = re.compile(r"(\.(docx?|pdf|pptx?|txt|tex)$)|^(microsoft\s|untitled)", re.IGNORECASE)
_BOLD_FONT_RE = re.compile(r"bold|black|heavy|semibold|demi", re.IGNORECASE)


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


# ---------------------------------------------------------------------------
# Line collection
# ---------------------------------------------------------------------------


def _collect_lines(page, page_no: int) -> list[dict]:
    import fitz

    flags = fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES
    d = page.get_text("dict", flags=flags)
    lines = []
    for block in d.get("blocks", []):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", []):
            dx, dy = line.get("dir", (1, 0))
            if abs(dy) > 0.1 or dx < 0:
                continue  # rotated/vertical text (often margin labels)
            spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            text = clean_text("".join(s["text"] for s in line.get("spans", [])))
            if not text:
                continue
            size_weight: Counter = Counter()
            bold_chars = 0
            total = 0
            for s in spans:
                n = len(s["text"].strip())
                size_weight[round(s["size"] * 2) / 2] += n
                total += n
                if (s.get("flags", 0) & 16) or _BOLD_FONT_RE.search(s.get("font", "")):
                    bold_chars += n
            size = size_weight.most_common(1)[0][0]
            lines.append(
                {
                    "kind": "line",
                    "page": page_no,
                    "block": block.get("number", 0),
                    "bbox": tuple(line["bbox"]),
                    "text": text,
                    "size": size,
                    "bold": total > 0 and bold_chars / total >= 0.6,
                    "chars": total,
                }
            )
    return lines


# ---------------------------------------------------------------------------
# Tables and images
# ---------------------------------------------------------------------------


def _find_tables(page, lines: list[dict]) -> list[dict]:
    try:
        found = page.find_tables()
    except Exception:
        return []
    tables = []
    for tab in getattr(found, "tables", []):
        try:
            raw = tab.extract()
        except Exception:
            continue
        rows = [[clean_text((c or "").replace("\n", " ")) for c in r] for r in raw]
        rows = [r for r in rows if any(c for c in r)]
        if len(rows) < 2 or max(len(r) for r in rows) < 2:
            continue
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        bbox = tuple(tab.bbox)

        # Bold check: lines inside the first row's bbox versus the rest.
        try:
            row0 = tuple(tab.rows[0].bbox)
        except Exception:
            row0 = (bbox[0], bbox[1], bbox[2], bbox[1] + (bbox[3] - bbox[1]) / len(rows))
        in_tab = [ln for ln in lines if _center_in(ln["bbox"], bbox)]
        first = [ln for ln in in_tab if _center_in(ln["bbox"], row0)]
        rest = [ln for ln in in_tab if ln not in first]
        first_bold = bool(first) and all(ln["bold"] for ln in first)
        rest_bold = bool(rest) and all(ln["bold"] for ln in rest)
        is_header = looks_like_header(rows[0], rows[1:], first_bold and not rest_bold)
        headers = rows[0] if is_header else []
        body = rows[1:] if is_header else rows
        tables.append(
            {
                "kind": "table",
                "bbox": bbox,
                "block": {"type": "table", "caption": None, "headers": headers, "rows": body},
            }
        )
    return tables


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


def _find_images(doc, page, repeated_xrefs: set[int]) -> list[dict]:
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
        images.append({"kind": "image", "bbox": tuple(rect), "block": image_block(enc[0])})
    return images


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

    progress = progress or _noop
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        raise ValueError("This PDF is password protected.")
    n_pages = doc.page_count
    if n_pages == 0:
        raise ValueError("This PDF has no pages.")

    # ---- 1. lines for every page ------------------------------------------------
    pages = []
    for i, page in enumerate(doc):
        pages.append({"page": page, "no": i + 1, "lines": _collect_lines(page, i + 1)})
        progress("layout", f"Reading page layout ({i + 1} of {n_pages})…", 2 + int(28 * (i + 1) / n_pages))

    all_lines = [ln for p in pages for ln in p["lines"]]
    if not all_lines:
        raise ValueError("No selectable text found. This PDF may be a scan and needs OCR first.")

    # ---- 2. body size --------------------------------------------------------------
    weight: Counter = Counter()
    for ln in all_lines:
        weight[ln["size"]] += ln["chars"]
    body = weight.most_common(1)[0][0]

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
    first_lines = pages[0]["lines"]
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
    page_elements = []
    for p in pages:
        page = p["page"]
        lines = [ln for ln in p["lines"] if id(ln) not in title_ids]
        tables = _find_tables(page, lines)
        images = _find_images(doc, page, repeated_xrefs)
        n_tables += len(tables)
        regions = [t["bbox"] for t in tables] + [im["bbox"] for im in images]
        lines = [ln for ln in lines if not any(_center_in(ln["bbox"], r) for r in regions)]

        # Captions: a "Table N" line just above a table, a "Figure N" line just below an image.
        for t in tables:
            for ln in sorted(lines, key=lambda l: -l["bbox"][3]):
                gap = t["bbox"][1] - ln["bbox"][3]
                if 0 <= gap <= 30 and _TABLE_CAPTION_RE.match(ln["text"]):
                    t["block"]["caption"] = ln["text"]
                    lines.remove(ln)
                    break
        for im in images:
            for ln in sorted(lines, key=lambda l: l["bbox"][1]):
                gap = ln["bbox"][1] - im["bbox"][3]
                if 0 <= gap <= 40 and _FIG_CAPTION_RE.match(ln["text"]):
                    im["block"]["caption"] = ln["text"]
                    lines.remove(ln)
                    break

        ordered = _order_elements(lines + tables + images, page.rect.width)
        page_elements.append((p["no"], ordered, page.rect.width))
        progress("tables", f"Detecting tables (page {p['no']} of {n_pages})…", 30 + int(15 * p["no"] / n_pages))

    progress("tables", f"Found {n_tables} table{'s' if n_tables != 1 else ''}.", 45)

    # ---- 5. heading tiers ----------------------------------------------------------
    def heading_key(ln):
        t = ln["text"]
        if len(t) > 120 or (t.endswith(".") and not re.match(r"^\d+(\.\d+)*\.?\s", t)):
            return None
        if match_list_item(t) and ln["size"] < body * 1.15:
            return None
        if ln["size"] >= body * 1.15:
            return (ln["size"], ln["bold"])
        if ln["bold"] and ln["size"] >= body * 0.95 and len(t.split()) <= 12 and not t.endswith((",", ";")):
            return (ln["size"], True)
        return None

    keys = set()
    for _, elems, _ in page_elements:
        for e in elems:
            if e["kind"] == "line":
                e["_hkey"] = None if looks_like_math(e["text"]) else heading_key(e)
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
    for page_no, elems, width in page_elements:
        raw.append({"type": "pageMarker", "n": page_no})
        para: dict | None = None
        lst: dict | None = None
        prev_line: dict | None = None

        def close_para():
            nonlocal para
            if para and para["text"].strip():
                raw.append({"type": "paragraph", "text": para["text"].strip()})
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
                if (
                    last is not None
                    and last["type"] == "heading"
                    and last.get("_hk") == hk
                    and same_flow
                ):
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
                raw.append(math_block(text))
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
                para["text"] = fix_join(para["text"], text)
            else:
                close_para()
                para = {"text": text}
            prev_line = ln
        close_para()
        close_list()

    lang = _catalog_lang(doc)
    doc.close()

    # Image context: nearest heading + surrounding text (used for alt text).
    for i, b in enumerate(raw):
        if b["type"] != "image":
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
