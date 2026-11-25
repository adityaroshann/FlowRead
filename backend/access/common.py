"""Helpers shared by the PDF and DOCX converters.

Converters produce a flat, ordered list of "raw blocks" (dicts with a ``type``
and the AccessDoc fields, plus optional private keys that start with ``_``).
``build_doc`` groups them into sections, assigns ids and strips private keys.
"""

from __future__ import annotations

import base64
import io
import re
import uuid
from datetime import datetime, timezone

MAX_IMAGE_SIDE = 1200
MIN_IMAGE_SIDE = 40

# ---------------------------------------------------------------------------
# Text heuristics
# ---------------------------------------------------------------------------

BULLET_CHARS = "•●▪◦‣∙·○■□➢➤►-*–"
_BULLET_RE = re.compile(r"^\s*[" + re.escape(BULLET_CHARS) + r"]\s+(?P<body>.+)$")
_ORDERED_RE = re.compile(
    r"^\s*(?:\(?(?:\d{1,3}|[a-zA-Z]|[ivxlcdm]{1,6})[.)])\s+(?P<body>.+)$"
)


def match_list_item(text: str):
    """Return (ordered, body) if ``text`` starts with a list marker, else None."""
    m = _BULLET_RE.match(text)
    if m:
        return False, m.group("body").strip()
    m = _ORDERED_RE.match(text)
    if m:
        return True, m.group("body").strip()
    return None


_MATH_STRONG = set("=∑∫√^≤≥≠≈∞∂∏±÷×∆Δ∇→⇒∈∉⊂⊆∀∃")
_MATH_ANY = _MATH_STRONG | set("+−-*/()[]{}<>|πθλμσαβγδεωΩφ²³¹⁰⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉0123456789.,")
_WORD_RE = re.compile(r"[A-Za-z]{3,}")


def looks_like_math(text: str) -> bool:
    """Heuristic: a short line dominated by maths symbols."""
    t = text.strip()
    if len(t) < 3 or len(t) > 160:
        return False
    strong = sum(1 for ch in t if ch in _MATH_STRONG)
    if strong == 0:
        return False
    # Ordinary prose that happens to contain "=" has many long words.
    words = _WORD_RE.findall(t)
    if len(words) > 6:
        return False
    chars = [ch for ch in t if not ch.isspace()]
    symbolic = sum(1 for ch in chars if ch in _MATH_ANY or (ch.isalpha() and len(ch) == 1))
    # Single letters (variables) count; long words do not.
    letters_in_words = sum(len(w) for w in words)
    ratio = (symbolic - letters_in_words) / max(1, len(chars))
    if t.endswith((".", "?", "!")) and len(words) > 2:
        return False
    return strong >= 2 or ratio > 0.35 or (strong >= 1 and len(words) <= 2)


_SPOKEN = [
    ("≤", " is less than or equal to "),
    ("≥", " is greater than or equal to "),
    ("≠", " is not equal to "),
    ("≈", " is approximately "),
    ("=", " equals "),
    ("<", " is less than "),
    (">", " is greater than "),
    ("±", " plus or minus "),
    ("+", " plus "),
    ("−", " minus "),
    ("×", " times "),
    ("÷", " divided by "),
    ("/", " over "),
    ("∑", " the sum of "),
    ("∏", " the product of "),
    ("∫", " the integral of "),
    ("√", " the square root of "),
    ("∞", " infinity "),
    ("∂", " partial "),
    ("Δ", " delta "),
    ("∆", " delta "),
    ("π", " pi "),
    ("θ", " theta "),
    ("λ", " lambda "),
    ("μ", " mu "),
    ("σ", " sigma "),
    ("α", " alpha "),
    ("β", " beta "),
    ("γ", " gamma "),
    ("→", " goes to "),
    ("%", " percent "),
    ("²", " squared "),
    ("³", " cubed "),
]


def spoken_fallback(text: str) -> str:
    """Rule-based English reading of a maths line (used when AI is unavailable)."""
    s = text.strip()
    s = re.sub(r"\^\s*2\b", " squared ", s)
    s = re.sub(r"\^\s*3\b", " cubed ", s)
    s = re.sub(r"\^\s*\(?([^\s)]+)\)?", r" to the power of \1 ", s)
    # A hyphen between spaces is a minus sign.
    s = re.sub(r"(?<=\s)-(?=\s)", " minus ", s)
    s = s.replace("*", " times ")
    for sym, words in _SPOKEN:
        s = s.replace(sym, words)
    s = s.replace("(", " open bracket ").replace(")", " close bracket ")
    return re.sub(r"\s+", " ", s).strip()


def fix_join(acc: str, nxt: str) -> str:
    """Join two wrapped lines, repairing end-of-line hyphenation."""
    nxt = nxt.strip()
    if not acc:
        return nxt
    if not nxt:
        return acc
    if acc.endswith("­"):
        return acc[:-1] + nxt
    if re.search(r"[A-Za-z]-$", acc) and nxt[:1].islower():
        return acc[:-1] + nxt
    return acc + " " + nxt


def clean_text(text: str) -> str:
    text = text.replace("­", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    return re.sub(r"[ \t ]+", " ", text).strip()


_NUMERIC_CELL = re.compile(r"^[\s$€£%+\-−.,\d()/:]+$")


def looks_like_header(first_row: list[str], data_rows: list[list[str]], first_row_bold: bool) -> bool:
    """Decide whether a table's first row is a header row."""
    if not first_row or not any(c.strip() for c in first_row):
        return False
    if not data_rows:
        return first_row_bold
    if first_row_bold:
        return True
    # Header cells are text; data cells in at least one column are numeric.
    first_numeric = sum(1 for c in first_row if c.strip() and _NUMERIC_CELL.match(c))
    if first_numeric:
        return False
    cols = len(first_row)
    for ci in range(cols):
        vals = [r[ci] for r in data_rows if ci < len(r) and r[ci].strip()]
        if vals and all(_NUMERIC_CELL.match(v) for v in vals):
            return True
    return False


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------


def image_to_data_url(data: bytes, ext: str | None = None) -> tuple[str, int, int] | None:
    """Downscale to MAX_IMAGE_SIDE and encode as a PNG/JPEG data URL.

    Returns (data_url, width, height) or None if the image can't be decoded.
    """
    from PIL import Image

    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        return None
    w, h = im.size
    if max(w, h) > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / max(w, h)
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    fmt = (ext or im.format or "png").lower()
    has_alpha = im.mode in ("RGBA", "LA", "P") and ("transparency" in im.info or im.mode != "P")
    out = io.BytesIO()
    if fmt in ("jpg", "jpeg") and not has_alpha:
        if im.mode != "RGB":
            im = im.convert("RGB")
        im.save(out, "JPEG", quality=85, optimize=True)
        mime = "image/jpeg"
    else:
        if im.mode not in ("RGB", "RGBA", "L", "LA", "P"):
            im = im.convert("RGBA" if has_alpha else "RGB")
        im.save(out, "PNG", optimize=True)
        mime = "image/png"
    url = f"data:{mime};base64," + base64.b64encode(out.getvalue()).decode("ascii")
    return url, im.size[0], im.size[1]


def image_block(
    src: str, context: str = "", caption: str | None = None, alt: str = "", origin: str = "raster"
) -> dict:
    return {
        "type": "image",
        "src": src,
        "alt": alt,
        "altStatus": "ai" if alt else "missing",
        "caption": caption,
        "origin": origin,
        "_context": context,
    }


def decorative_image_block(src: str, origin: str = "raster") -> dict:
    """An image that carries no information (page background, flourish). Never sent to AI."""
    b = image_block(src, origin=origin)
    b["altStatus"] = "decorative"
    b["_skip_ai"] = True
    return b


def math_block(text: str) -> dict:
    return {"type": "math", "latex": None, "spoken": spoken_fallback(text), "text": text}


# ---------------------------------------------------------------------------
# Document assembly
# ---------------------------------------------------------------------------


def new_doc_id() -> str:
    return "doc_" + uuid.uuid4().hex


def build_doc(title: str, raw_blocks: list[dict], source_file: str, lang: str = "en") -> dict:
    """Group raw blocks into sections by the top heading level.

    Raw heading blocks carry ``level`` 2..6. The smallest level present becomes
    the section level; deeper headings stay inside the section as blocks.
    Trailing page markers move into the next section so a section never ends
    with a dangling marker for the page on which the next section starts.
    """
    from .readability import readable_blocks, structure_hint  # local import: readability imports common

    raw_blocks = readable_blocks(raw_blocks)
    heading_levels = [b["level"] for b in raw_blocks if b["type"] == "heading"]
    top = min(heading_levels) if heading_levels else 2

    sections: list[dict] = []
    cur = {"heading": "", "level": top, "blocks": []}
    for b in raw_blocks:
        if b["type"] == "heading" and b["level"] == top:
            carried = []
            while cur["blocks"] and cur["blocks"][-1]["type"] == "pageMarker":
                carried.insert(0, cur["blocks"].pop())
            sections.append(cur)
            cur = {"heading": b["text"], "level": top, "blocks": carried}
        else:
            cur["blocks"].append(b)
    sections.append(cur)

    # Drop an untitled leading section that holds nothing but page markers.
    out_sections = []
    for i, s in enumerate(sections):
        if not s["heading"] and all(b["type"] == "pageMarker" for b in s["blocks"]):
            if i + 1 < len(sections):
                sections[i + 1]["blocks"][0:0] = s["blocks"]
                continue
            if not s["blocks"]:
                continue
        out_sections.append(s)

    bid = 0
    final = []
    for si, s in enumerate(out_sections, start=1):
        blocks = []
        for b in s["blocks"]:
            bid += 1
            clean = {k: v for k, v in b.items() if not k.startswith("_")}
            clean = {"id": f"b{bid}", **clean}
            if clean["type"] != "pageMarker":
                clean.setdefault("plain", None)
            blocks.append(clean)
        final.append(
            {"id": f"s{si}", "heading": s["heading"], "level": s["level"], "summary": None, "blocks": blocks}
        )

    doc = {
        "id": new_doc_id(),
        "title": title,
        "lang": lang or "en",
        "sourceFile": source_file,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sections": final,
        "report": {"score": 100, "issues": []},
    }
    hint = structure_hint(final)
    if hint:
        doc["structureHint"] = hint
    return doc


def iter_blocks(doc: dict):
    for s in doc.get("sections", []):
        for b in s.get("blocks", []):
            yield s, b


# ---------------------------------------------------------------------------
# Inline marks (bold / italic / link)
# ---------------------------------------------------------------------------
#
# Internally converters keep marks as ``{"start", "end", "type", "href"?}``
# with *code-point* offsets (Python string indices) in a private ``_marks``
# list. ``finalize_marks`` converts them to the UTF-16 offsets the contract
# requires (JavaScript string indices) when a paragraph is emitted. The two
# differ only for characters outside the Basic Multilingual Plane (emoji,
# maths alphanumerics such as U+1D465), which take two UTF-16 code units.

SAFE_HREF_RE = re.compile(r"^(https?:|mailto:)", re.IGNORECASE)
_INLINE_WS = re.compile(r"[ \t\u00a0\r\n]+")


def utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def safe_href(href) -> str | None:
    """Return the href if it is http(s) or mailto, else None."""
    if not isinstance(href, str):
        return None
    h = href.strip()
    if not h or len(h) > 2000 or not SAFE_HREF_RE.match(h):
        return None
    if any(ord(c) < 32 for c in h):
        return None
    return h


def _clean_inline(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\ufb01", "fi").replace("\ufb02", "fl")
    return _INLINE_WS.sub(" ", text)


def _mark_key(m: dict):
    return (m["type"], m.get("href"))


def merge_marks(text: str, marks: list[dict]) -> list[dict]:
    """Sort, trim whitespace off each range, and merge touching ranges of the same kind.

    Two ranges of the same kind are merged when only whitespace separates them,
    so a bold phrase that wraps onto the next line stays one mark.
    """
    out: list[dict] = []
    for m in sorted(marks, key=lambda m: (m["type"], m.get("href") or "", m["start"])):
        s, e = max(0, m["start"]), min(len(text), m["end"])
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e <= s:
            continue
        nm = {**m, "start": s, "end": e}
        if out and _mark_key(out[-1]) == _mark_key(nm) and not text[out[-1]["end"]:s].strip():
            out[-1]["end"] = max(out[-1]["end"], e)
        else:
            out.append(nm)
    out.sort(key=lambda m: (m["start"], m["end"], m["type"]))
    return out


def rich_from_segments(segs) -> tuple[str, list[dict]]:
    """Build (text, marks) from ``[(raw_text, attrs)]``.

    ``attrs`` is an iterable of mark dicts without offsets, e.g.
    ``[{"type": "bold"}, {"type": "link", "href": "https://…"}]``.
    Whitespace is collapsed exactly like ``clean_text``.
    """
    text = ""
    marks: list[dict] = []
    for raw, attrs in segs:
        t = _clean_inline(raw or "")
        if (not text or text.endswith(" ")) and t.startswith(" "):
            t = t[1:]
        if not t:
            continue
        start = len(text)
        text += t
        for a in attrs or ():
            marks.append({**a, "start": start, "end": len(text)})
    stripped = text.rstrip(" ")
    return stripped, merge_marks(stripped, marks)


def rich_join(acc: str, acc_marks: list[dict], nxt: str, nxt_marks: list[dict]) -> tuple[str, list[dict]]:
    """``fix_join`` for text that carries marks."""
    lead = len(nxt) - len(nxt.lstrip())
    nxt_s = nxt.strip()
    result = fix_join(acc, nxt)
    if not nxt_s:
        return result, list(acc_marks)
    off = len(result) - len(nxt_s)
    marks = [{**m, "end": min(m["end"], off)} for m in acc_marks if m["start"] < off]
    marks += [
        {**m, "start": m["start"] - lead + off, "end": min(len(nxt_s), m["end"] - lead) + off}
        for m in nxt_marks
        if m["end"] - lead > 0
    ]
    return result, merge_marks(result, marks)


def finalize_marks(text: str, marks: list[dict] | None) -> list[dict]:
    """Code-point offsets -> UTF-16 offsets, href sanitised, empty marks dropped."""
    out = []
    for m in merge_marks(text, marks or []):
        if m["type"] not in ("bold", "italic", "link"):
            continue
        item = {"start": utf16_len(text[: m["start"]]), "end": utf16_len(text[: m["end"]]), "type": m["type"]}
        if m["type"] == "link":
            href = safe_href(m.get("href"))
            if not href:
                continue
            item["href"] = href
        out.append(item)
    return out


def paragraph_block(text: str, marks: list[dict] | None = None, role: str | None = None) -> dict:
    """A raw paragraph block; ``marks`` use code-point offsets (converted here)."""
    b: dict = {"type": "paragraph", "text": text}
    fm = finalize_marks(text, marks)
    if fm:
        b["marks"] = fm
    if role in ("notes", "caption"):
        b["role"] = role
    return b


_NON_ALT_RE = re.compile(
    r"^(?:[\w\-. ()]+\.(?:png|jpe?g|gif|bmp|tiff?|emf|wmf|svg|webp)|(?:picture|image|graphic|grafik|bild)\s*\d*"
    r"|a picture containing.*|description automatically generated.*)$",
    re.IGNORECASE,
)


def meaningful_alt(alt: str | None) -> str:
    """Author alt text, or "" when it is only a file name or an auto-generated label."""
    a = clean_text(alt or "")
    return "" if not a or _NON_ALT_RE.match(a) else a
