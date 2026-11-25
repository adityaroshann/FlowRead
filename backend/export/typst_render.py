"""AccessDoc + reading Settings -> tagged PDF/UA-1, using Typst.

No user text is ever written into Typst markup. The template (``TEMPLATE``)
is a fixed file; the document goes in as ``data.json``, which the template
reads with ``json()`` and turns into content with function calls. A string
inserted that way is always literal text, so characters such as ``# * _ $ @
< > [ ] { } ~ ` = \\`` or a line starting with ``-``/``+``/``1.`` can never
become markup (see tests/test_export.py's injection test). Text is still
sanitised: control characters and lone surrogates become spaces, and all
whitespace is collapsed.

Settings mapping (schema = DEFAULT_SETTINGS in packages/core/src/profiles.js,
colours = THEME_COLORS in packages/core/src/readingCss.js):
- theme: page fill + text colour (+ muted for page refs/footers, accent for links)
- font: system/atkinson -> Atkinson Hyperlegible Next, lexend -> Lexend,
  dyslexic -> OpenDyslexic, serif -> Literata. Headings use Fraunces, except
  with OpenDyslexic, the high-contrast theme or text at 140%+, where headings
  use the body font so they stay as readable as the body.
- textScale: base size 11pt x scale (clamped 0.8-2 like the reader)
- letterSpacing (em) -> text tracking; wordSpacing (em) -> 100% + n em spacing
- lineHeight (CSS multiple) -> par leading. Typst leading is the gap between
  one line's baseline and the next line's cap height, so leading = lh - 0.7em
  gives the same baseline-to-baseline distance as CSS line-height.
- measure (ch) -> horizontal margins so a line holds about that many
  characters (1ch ~ 0.5em + letter spacing), never below 15 mm.
- boldStarts -> bold word starts from ``bold_starts.py``. These are drawn with
  ``text(weight: 700)``, not ``strong``: they are visual only, so they must not
  be tagged as Strong (screen readers could announce emphasis on every word).
Fonts are bundled in backend/fonts (OFL; static instances made from the
upstream variable fonts with fontTools, family names unchanged) and system
fonts are ignored, so output is identical on Windows and Linux. Typst's own
embedded fonts (New Computer Modern, Libertinus, DejaVu Sans Mono) stay
available as fallbacks for maths and missing glyphs.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import math
import os
import re
import tempfile
import threading
from importlib import metadata

from .bold_starts import bold_ranges, ratio_of

log = logging.getLogger("flowread.export")

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(BACKEND, "fonts")

THEME_COLORS = {
    "light": {"bg": "#FAF7F0", "text": "#1F1B16", "muted": "#5C554B", "accent": "#0F6B6B", "mark": "#FFE58A"},
    "cream": {"bg": "#F4ECD8", "text": "#2B2418", "muted": "#5A4E3B", "accent": "#0F5F5F", "mark": "#FFE08A"},
    "dark": {"bg": "#1C1A17", "text": "#E8E2D6", "muted": "#B5AC9C", "accent": "#6FCFC4", "mark": "#5C4A12"},
    "high-contrast": {"bg": "#000000", "text": "#FFFFFF", "muted": "#E6E6E6", "accent": "#FFE600", "mark": "#00468C"},
}
FONT_FAMILIES = {
    "system": "Atkinson Hyperlegible Next",
    "atkinson": "Atkinson Hyperlegible Next",
    "lexend": "Lexend",
    "dyslexic": "OpenDyslexic",
    "serif": "Literata",
}
HEADING_FAMILY = "Fraunces"
FALLBACK_FAMILIES = ["Atkinson Hyperlegible Next", "Literata", "Libertinus Serif", "New Computer Modern Math", "DejaVu Sans Mono"]
BUNDLED_FAMILIES = ["Atkinson Hyperlegible Next", "Fraunces", "Lexend", "Literata", "OpenDyslexic"]

DEFAULT_SETTINGS = {
    "theme": "light", "font": "atkinson", "textScale": 1, "letterSpacing": 0, "wordSpacing": 0,
    "lineHeight": 1.6, "measure": 66, "boldStarts": True, "boldIntensity": 0.45,
}
DEFAULT_OPTIONS = {"pageSize": "A4", "includeSummaries": False, "includePlain": False,
                   "includePageRefs": True, "includeToc": False}
PAPER = {"A4": ("a4", 595.28, 841.89), "Letter": ("us-letter", 612.0, 792.0)}
MM = 72 / 25.4
BASE_SIZE = 11.0
NO_ALT = "Image without a description"

_CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f  \ud800-\udfff￾￿]")
_WS_RE = re.compile(r"\s+")
_LANG_RE = re.compile(r"^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{2}|\d{3}))?(?:[-_].*)?$")


class ExportError(Exception):
    """The document could not be rendered (details are logged)."""


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


def _num(v, lo, hi, d):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return d
    if not math.isfinite(f):
        return d
    return min(hi, max(lo, f))


def resolve_style(settings: dict | None, options: dict | None) -> dict:
    s = {**DEFAULT_SETTINGS, **(settings if isinstance(settings, dict) else {})}
    o = {**DEFAULT_OPTIONS, **(options if isinstance(options, dict) else {})}
    theme = s["theme"] if s.get("theme") in THEME_COLORS else "light"
    colors = THEME_COLORS[theme]
    font_id = s["font"] if s.get("font") in FONT_FAMILIES else "system"
    body = FONT_FAMILIES[font_id]
    scale = _num(s.get("textScale"), 0.8, 2, 1)
    ls = _num(s.get("letterSpacing"), 0, 0.35, 0)
    ws = _num(s.get("wordSpacing"), 0, 0.5, 0)
    lh = _num(s.get("lineHeight"), 1.2, 2.4, 1.6)
    measure = _num(s.get("measure"), 40, 100, 70)
    paper_id, pw, ph = PAPER.get(o.get("pageSize"), PAPER["A4"])
    size = BASE_SIZE * scale
    plain_headings = font_id == "dyslexic" or theme == "high-contrast" or scale >= 1.4
    width = measure * (0.5 + ls) * size
    mx = max(15 * MM, (pw - width) / 2)
    gap_wide = ls >= 0.1 or lh >= 1.8
    fonts = [body] + [f for f in FALLBACK_FAMILIES if f != body]
    return {
        "paper": paper_id,
        "pw": pw,
        "ph": ph,
        "bg": colors["bg"],
        "text": colors["text"],
        "muted": colors["muted"],
        "accent": colors["accent"],
        "fonts": fonts,
        "hfonts": fonts if plain_headings else [HEADING_FAMILY] + fonts,
        "size": round(size, 3),
        "tracking": round(ls, 4),
        "spacing": round(ws, 4),
        "leading": round(max(0.3, lh - 0.7), 4),
        "parspacing": round(max(0.3, lh - 0.7) + (1.0 if gap_wide else 0.6), 4),
        "mx": round(mx, 2),
        "mt": round(20 * MM, 2),
        "mb": round(22 * MM, 2),
        "textwidth": pw - 2 * mx,
        "boldStarts": s.get("boldStarts") is not False,
        "boldRatio": ratio_of(s.get("boldIntensity")),
        "options": {
            "pageSize": "Letter" if o.get("pageSize") == "Letter" else "A4",
            "includeSummaries": o.get("includeSummaries") is True,
            "includePlain": o.get("includePlain") is True,
            "includePageRefs": o.get("includePageRefs") is not False,
            "includeToc": o.get("includeToc") is True,
        },
    }


def split_lang(lang) -> tuple[str, str | None]:
    m = _LANG_RE.match(str(lang or "").strip())
    if not m:
        return "en", None
    region = m.group(2)
    return m.group(1).lower(), (region.upper() if region and region.isalpha() else None)


# ---------------------------------------------------------------------------
# Text -> runs
# ---------------------------------------------------------------------------


def clean(s) -> str:
    """Sanitise and collapse whitespace (for strings without marks)."""
    if s is None:
        return ""
    return _WS_RE.sub(" ", _CTRL_RE.sub(" ", str(s))).strip()


def _utf16_to_cp(text: str) -> list[int]:
    """Map every UTF-16 offset 0..len16 to a code-point offset."""
    out = []
    for i, ch in enumerate(text):
        out.append(i)
        if ord(ch) > 0xFFFF:
            out.append(i)  # the low surrogate maps into the same character
    out.append(len(text))
    return out


def runs(text, marks=None, bold_starts=False) -> list[dict]:
    """Split text into styled runs: {t, b?, i?, h?, w?}. Marks use UTF-16 offsets."""
    if text is None:
        return []
    t = _CTRL_RE.sub(" ", str(text)).replace("\t", " ")
    t = re.sub(r"[\n\r\v\f]", " ", t)
    if not t.strip():
        return []
    to_cp = _utf16_to_cp(t)
    n16 = len(to_cp) - 1
    spans = []  # (start_cp, end_cp, key, value)
    for m in marks if isinstance(marks, list) else []:
        if not isinstance(m, dict) or m.get("type") not in ("bold", "italic", "link"):
            continue
        try:
            s16, e16 = int(m.get("start")), int(m.get("end"))
        except (TypeError, ValueError):
            continue
        if not (0 <= s16 < e16 <= n16):
            continue
        if m["type"] == "link":
            href = _safe_href(m.get("href"))
            if not href:
                continue
            spans.append((to_cp[s16], to_cp[e16], "h", href))
        else:
            spans.append((to_cp[s16], to_cp[e16], "b" if m["type"] == "bold" else "i", True))
    if bold_starts:
        # bold_starts is the bold ratio (True means the default ratio).
        ratio = bold_starts if isinstance(bold_starts, float) else None
        for r in (bold_ranges(t, ratio) if ratio else bold_ranges(t)):
            spans.append((r["start"], r["end"], "w", True))
    cuts = {0, len(t)}
    for s, e, _, _ in spans:
        cuts.update((s, e))
    points = sorted(cuts)
    out: list[dict] = []
    for a, b in zip(points, points[1:]):
        if a >= b:
            continue
        run = {"t": t[a:b]}
        for s, e, k, v in spans:
            if s <= a and b <= e:
                run[k] = v
        out.append(run)
    # Collapse whitespace across the run sequence without changing styled text.
    prev_space = True
    final = []
    for r in out:
        s = _WS_RE.sub(" ", r["t"])
        if prev_space:
            s = s.lstrip(" ")
        if not s:
            continue
        prev_space = s.endswith(" ")
        final.append({**r, "t": s})
    while final and final[-1]["t"].endswith(" "):
        final[-1]["t"] = final[-1]["t"].rstrip(" ")
        if not final[-1]["t"]:
            final.pop()
    return final


def _safe_href(h) -> str | None:
    if not isinstance(h, str):
        return None
    h = h.strip()
    if not re.match(r"^(https?:|mailto:)", h, re.IGNORECASE) or len(h) > 2000 or _CTRL_RE.search(h) or " " in h:
        return None
    return h


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

_DATA_URL_RE = re.compile(r"^data:image/(png|jpe?g|gif|webp|bmp);base64,(.+)$", re.DOTALL | re.IGNORECASE)


def _write_image(src, workdir: str, n: int) -> tuple[str, int, int] | None:
    """Decode a data URL, validate it with Pillow and write PNG/JPEG. Returns (name, w, h)."""
    from PIL import Image

    m = _DATA_URL_RE.match(src or "") if isinstance(src, str) else None
    if not m:
        return None
    try:
        data = base64.b64decode(m.group(2), validate=False)
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        return None
    w, h = im.size
    if w < 1 or h < 1 or w * h > 40_000_000:
        return None
    fmt = (im.format or "").upper()
    if fmt == "JPEG" and im.mode in ("RGB", "L"):
        name = f"img{n}.jpg"
        with open(os.path.join(workdir, name), "wb") as f:
            f.write(data)
    else:
        name = f"img{n}.png"
        if im.mode not in ("RGB", "RGBA", "L", "LA"):
            im = im.convert("RGBA")
        im.save(os.path.join(workdir, name), "PNG")
    return name, w, h


# ---------------------------------------------------------------------------
# Doc -> render model
# ---------------------------------------------------------------------------


def build_model(doc: dict, style: dict, workdir: str) -> dict:
    opts = style["options"]
    bs = style["boldRatio"] if style["boldStarts"] else False
    title = clean(doc.get("title")) or "Untitled document"
    lang, region = split_lang(doc.get("lang"))
    items: list[dict] = [{"k": "title", "t": title}]
    if opts["includeToc"]:
        items.append({"k": "toc"})
    prev = 1
    n_img = 0
    content_h = style["ph"] - style["mt"] - style["mb"]

    def heading(level, text):
        nonlocal prev
        r = runs(text)
        if not r:
            return
        try:
            lvl = int(level)
        except (TypeError, ValueError):
            lvl = 2
        lvl = max(2, min(6, lvl, prev + 1))  # PDF/UA-1 forbids skipped levels
        prev = lvl
        items.append({"k": "h", "level": lvl, "runs": r})

    for sec in doc.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        heading(sec.get("level") or 2, sec.get("heading"))
        if opts["includeSummaries"] and clean(sec.get("summary")):
            items.append({"k": "summary", "t": clean(sec.get("summary"))})
        for b in sec.get("blocks") or []:
            if not isinstance(b, dict):
                continue
            t = b.get("type")
            if t == "heading":
                heading(b.get("level"), b.get("text"))
            elif t == "paragraph":
                r = runs(b.get("text"), b.get("marks"), bs)
                if r:
                    role = b.get("role") if b.get("role") in ("notes", "caption") else None
                    items.append({"k": "p", "runs": r, "role": role})
            elif t == "list":
                li = [runs(x, None, bs) for x in (b.get("items") or []) if isinstance(x, (str, int, float))]
                li = [x for x in li if x]
                if li:
                    items.append({"k": "list", "ordered": b.get("ordered") is True, "items": li})
            elif t == "table":
                headers = [runs(h, None, bs) for h in (b.get("headers") or [])][:50]
                rows = [[runs(c, None, bs) for c in r][:50] for r in (b.get("rows") or []) if isinstance(r, list)]
                rows = [r for r in rows if any(r)]
                if any(headers) is False:
                    headers = []
                cols = max([len(r) for r in rows] + [len(headers), 1])
                if not rows and not headers:
                    continue
                rows = [r + [[]] * (cols - len(r)) for r in rows]
                if headers:
                    headers = headers + [[]] * (cols - len(headers))
                cap = clean(b.get("caption")) or None
                items.append({"k": "table", "cols": cols, "headers": headers, "rows": rows, "caption": cap})
            elif t == "image":
                n_img += 1
                written = _write_image(b.get("src"), workdir, n_img)
                caption = clean(b.get("caption")) or None
                decorative = b.get("altStatus") == "decorative"
                if not written:
                    if caption:
                        items.append({"k": "p", "runs": runs(caption), "role": "caption"})
                    continue
                name, w, h = written
                width = min(style["textwidth"], w * 0.6)
                height = width * h / w
                if height > content_h * 0.8:
                    width = width * content_h * 0.8 / height
                alt = clean(b.get("alt")) or caption or NO_ALT
                if b.get("origin") == "page" and not clean(b.get("alt")):
                    alt = "Scanned page image. Its text has not been converted."
                items.append({"k": "img", "path": name, "alt": alt[:2000], "decorative": decorative,
                              "caption": caption, "w": round(width, 2)})
            elif t == "math":
                text = clean(b.get("text")) or clean(b.get("latex"))
                spoken = clean(b.get("spoken")) or text
                if text:
                    items.append({"k": "math", "t": text, "spoken": spoken[:2000]})
            elif t == "pageMarker":
                if opts["includePageRefs"]:
                    try:
                        items.append({"k": "page", "n": str(int(b.get("n")))})
                    except (TypeError, ValueError):
                        pass
            if opts["includePlain"] and t in ("paragraph", "list", "table") and clean(b.get("plain")):
                items.append({"k": "plain", "t": clean(b.get("plain"))})

    return {
        "title": title,
        "lang": lang,
        "region": region,
        "style": {k: style[k] for k in ("paper", "bg", "text", "muted", "accent", "fonts", "hfonts", "size",
                                         "tracking", "spacing", "leading", "parspacing", "mx", "mt", "mb")},
        "blocks": items,
    }


TEMPLATE = r"""
#let D = json("data.json")
#let S = D.style
#set document(title: D.title)
#set page(
  paper: S.paper,
  fill: rgb(S.bg),
  margin: (left: S.mx * 1pt, right: S.mx * 1pt, top: S.mt * 1pt, bottom: S.mb * 1pt),
  footer: context align(center, text(size: 0.8em, fill: rgb(S.muted), counter(page).display("1"))),
)
#set text(
  font: S.fonts, size: S.size * 1pt, fill: rgb(S.text), lang: D.lang,
  tracking: S.tracking * 1em, spacing: 100% + S.spacing * 1em, hyphenate: false,
)
#set text(region: D.region) if D.region != none
#set par(leading: S.leading * 1em, spacing: S.parspacing * 1em, justify: false)
#set list(spacing: S.leading * 1em + 0.25em, indent: 0.3em)
#set enum(spacing: S.leading * 1em + 0.25em, indent: 0.3em)
#set table(stroke: 0.6pt + rgb(S.muted), inset: 0.45em)
#set figure(numbering: none)
#show figure.caption: set text(size: 0.9em)
#show heading: set text(font: S.hfonts, weight: 700, fill: rgb(S.text))
// Large type needs far less letter spacing than body text: cap heading
// tracking at a third of the body's absolute spacing so wide-spacing profiles
// don't pull headings apart letter by letter.
#show heading: set text(tracking: S.tracking * S.size * 0.33pt)
#show heading: set block(above: 1.5em, below: 0.75em)
#show heading.where(level: 1): set text(size: 1.9em)
#show heading.where(level: 2): set text(size: 1.45em)
#show heading.where(level: 3): set text(size: 1.2em)
#show heading.where(level: 4): set text(size: 1.05em)
#show link: it => underline(text(fill: rgb(S.accent), it))

#let run(r) = {
  let c = [#r.t]
  if r.at("w", default: false) { c = text(weight: 700, c) }
  if r.at("b", default: false) { c = strong(c) }
  if r.at("i", default: false) { c = emph(c) }
  if r.at("h", default: none) != none { c = link(r.h, c) }
  c
}
#let runs(rs) = rs.map(run).join()
#let aside(label, body) = block(
  width: 100%, inset: (left: 0.8em, y: 0.45em), stroke: (left: 2.5pt + rgb(S.accent)),
)[#strong(label) #linebreak() #body]

#for b in D.blocks {
  if b.k == "title" {
    heading(level: 1, outlined: false, bookmarked: true, b.t)
  } else if b.k == "toc" {
    outline(title: [Contents], depth: 3)
  } else if b.k == "h" {
    heading(level: b.level, runs(b.runs))
  } else if b.k == "p" {
    if b.role == "notes" {
      aside("Speaker notes", runs(b.runs))
    } else if b.role == "caption" {
      par(text(size: 0.9em, emph(runs(b.runs))))
    } else {
      par(runs(b.runs))
    }
  } else if b.k == "summary" {
    block(width: 100%, inset: 0.7em, radius: 3pt, stroke: 0.75pt + rgb(S.muted))[
      #strong("In this section") #linebreak() #b.t
    ]
  } else if b.k == "plain" {
    aside("Plain language", b.t)
  } else if b.k == "list" {
    if b.ordered { enum(..b.items.map(runs)) } else { list(..b.items.map(runs)) }
  } else if b.k == "table" {
    let body = ()
    for row in b.rows { for cell in row { body.push(runs(cell)) } }
    let t = if b.headers.len() > 0 {
      table(columns: b.cols, table.header(..b.headers.map(h => strong(runs(h)))), ..body)
    } else {
      table(columns: b.cols, ..body)
    }
    if b.caption != none {
      figure(t, kind: table, supplement: none, caption: figure.caption(position: top, [#b.caption]))
    } else { t }
  } else if b.k == "img" {
    let im = image(b.path, alt: b.alt, width: b.w * 1pt)
    if b.decorative {
      pdf.artifact(im)
      if b.caption != none { par(text(size: 0.9em, emph(b.caption))) }
    } else if b.caption != none {
      figure(im, caption: [#b.caption])
    } else {
      figure(im)
    }
  } else if b.k == "math" {
    block(width: 100%, inset: 0.6em, radius: 3pt, stroke: 0.6pt + rgb(S.muted))[
      #math.equation(block: true, alt: b.spoken, text(font: S.fonts, b.t))
      #pdf.artifact(text(size: 0.85em, fill: rgb(S.muted), "Read as: " + b.spoken))
    ]
  } else if b.k == "page" {
    block(above: 0.9em, below: 0.9em, text(size: 0.8em, fill: rgb(S.muted), "p. " + b.n))
  }
}
"""

# ---------------------------------------------------------------------------
# Compile
# ---------------------------------------------------------------------------

_fonts = None
_fonts_lock = threading.Lock()


def _font_set():
    global _fonts
    with _fonts_lock:
        if _fonts is None:
            import typst

            _fonts = typst.Fonts(include_system_fonts=False, include_embedded_fonts=True, font_paths=[FONT_DIR])
        return _fonts


def typst_version() -> str:
    try:
        return metadata.version("typst")
    except Exception:  # pragma: no cover
        return "unknown"


def font_families() -> list[str]:
    return [f for f in BUNDLED_FAMILIES if f in set(_font_set().families())]


_MISSING_GLYPH_RE = re.compile(r'the text `"(.*?)"` could not be displayed', re.DOTALL)
MAX_NAMED_GLYPHS = 20
_coverage: set[int] | None = None


def _bundled_coverage() -> set[int]:
    """Code points that at least one bundled font file can draw."""
    global _coverage
    if _coverage is None:
        import fitz

        cps: set[int] = set()
        for root, _, files in os.walk(FONT_DIR):
            for name in files:
                if name.lower().endswith((".ttf", ".otf")) and "Regular" in name:
                    try:
                        cps.update(fitz.Font(fontfile=os.path.join(root, name)).valid_codepoints())
                    except Exception:
                        pass
        _coverage = cps
    return _coverage


def _glyph_label(ch: str) -> str:
    import unicodedata

    name = unicodedata.name(ch, "")
    return f"[{name.lower()}]" if name else "[symbol]"


def _replace_strings(obj, table: dict[str, str]):
    if isinstance(obj, str):
        return "".join(table.get(c, c) for c in obj) if any(c in table for c in obj) else obj
    if isinstance(obj, list):
        return [_replace_strings(x, table) for x in obj]
    if isinstance(obj, dict):
        return {k: (v if k in ("k", "path", "h") else _replace_strings(v, table)) for k, v in obj.items()}
    return obj


def render_pdf_with_info(doc: dict, settings: dict | None = None, options: dict | None = None) -> tuple[bytes, dict]:
    """Render an AccessDoc to PDF bytes. Returns (pdf, info). Raises ExportError (details logged).

    PDF/UA-1 forbids text that no font can draw, so when Typst reports such
    characters they are replaced by their Unicode names (e.g. "[grinning
    face]") and the document is compiled again. If a document has more than
    ``MAX_NAMED_GLYPHS`` such characters (for example a CJK document, which
    the bundled Latin fonts cannot draw), it is compiled as a tagged PDF
    without the PDF/UA-1 claim instead; ``info["standard"]`` says which.
    """
    import typst

    style = resolve_style(settings, options)
    info = {"standard": "ua-1", "replaced": []}
    with tempfile.TemporaryDirectory(prefix="flowread-export-") as workdir:
        model = build_model(doc, style, workdir)
        main = os.path.join(workdir, "main.typ")
        with open(main, "w", encoding="utf-8") as f:
            f.write(TEMPLATE)
        replaced: dict[str, str] = {}
        standards: list[str] = ["ua-1"]
        for _attempt in range(4):
            with open(os.path.join(workdir, "data.json"), "w", encoding="utf-8") as f:
                json.dump(model, f, ensure_ascii=False)
            try:
                pdf = typst.compile(
                    main, root=workdir, font_paths=_font_set(), ignore_system_fonts=True, pdf_standards=standards
                )
                info["replaced"] = sorted(replaced)
                info["standard"] = "ua-1" if standards else "tagged"
                return pdf, info
            except Exception as e:
                diag = getattr(e, "diagnostic", "") or str(e)
                missing = _MISSING_GLYPH_RE.findall(diag)
                if not missing or not standards:
                    log.error("Typst compile failed: %s", diag)
                    raise ExportError("Could not build the PDF.") from e
                cover = _bundled_coverage()
                chars = {c for s in missing for c in s if not c.isspace() and ord(c) not in cover}
                if not chars:
                    chars = {c for s in missing for c in s if ord(c) > 127 and not c.isspace()}
                if not chars or len(replaced) + len(chars) > MAX_NAMED_GLYPHS:
                    standards = []  # too many: drop the UA-1 claim, keep tags
                    continue
                for c in chars:
                    replaced[c] = _glyph_label(c)
                model = _replace_strings(model, {c: replaced[c] for c in chars})
    log.error("Typst compile failed after glyph replacement")
    raise ExportError("Could not build the PDF.")


def render_pdf(doc: dict, settings: dict | None = None, options: dict | None = None) -> bytes:
    return render_pdf_with_info(doc, settings, options)[0]


def slug(title) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", clean(title).lower()).strip("-")
    return (s[:60].rstrip("-") or "document")
