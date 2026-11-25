"""DOCX to AccessDoc raw blocks.

mammoth converts the document body to semantic HTML (it understands
numbering, content controls, text boxes, hyperlinks, tables and images), and
``html_blocks.HtmlConverter`` turns that HTML into blocks. python-docx is
still used for what mammoth does not expose: core properties (title), the
default language, which paragraph styles are headings (custom styles based on
a heading style, or with an outline level), and the plain text of OMML
equations.

Before mammoth runs, the document XML is rewritten in memory:
- every OMML equation (``m:oMathPara`` / ``m:oMath``) becomes a placeholder
  run, so its position survives and we can emit a ``math`` block there;
- every explicit page break (``w:br w:type="page"``) and every
  ``w:lastRenderedPageBreak`` (where Word last paginated) becomes a
  page-break placeholder, used for ``pageMarker`` blocks.
"""

from __future__ import annotations

import io
import re
import zipfile

from .common import MIN_IMAGE_SIDE, clean_text, image_block, image_to_data_url
from .html_blocks import MATH_CLOSE, MATH_OPEN, PAGE_BREAK, HtmlConverter

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"

_HEADING_STYLE = re.compile(r"^heading\s*(\d)$", re.IGNORECASE)


def _w(tag: str) -> str:
    return f"{{{W_NS}}}{tag}"


def _m(tag: str) -> str:
    return f"{{{M_NS}}}{tag}"


# ---------------------------------------------------------------------------
# python-docx: metadata and style analysis
# ---------------------------------------------------------------------------


def _style_heading_level(style, depth: int = 0) -> int | None:
    """Heading level of a paragraph style: Heading N, an outline level, or based on one."""
    if style is None or depth > 10:
        return None
    m = _HEADING_STYLE.match(style.name or "")
    if m:
        return int(m.group(1))
    try:
        ppr = style.element.pPr
        if ppr is not None:
            ol = ppr.find(_w("outlineLvl"))
            if ol is not None:
                lvl = int(ol.get(_w("val")))
                if 0 <= lvl <= 5:
                    return lvl + 1
    except Exception:
        pass
    try:
        return _style_heading_level(style.base_style, depth + 1)
    except Exception:
        return None


def _style_map(doc) -> str:
    lines = [
        "p[style-name='Title'] => h1.doc-title:fresh",
        "p[style-name='Subtitle'] => p.subtitle:fresh",
        "p[style-name='Caption'] => p.caption:fresh",
        "r[style-name='Strong'] => strong",
        "r[style-name='Emphasis'] => em",
    ]
    try:
        from docx.enum.style import WD_STYLE_TYPE

        for st in doc.styles:
            if st.type != WD_STYLE_TYPE.PARAGRAPH or not st.name or "'" in st.name:
                continue
            if st.name.lower() in ("title", "subtitle", "caption"):
                continue
            lvl = _style_heading_level(st)
            if lvl:
                lines.append(f"p[style-name='{st.name}'] => h{min(6, lvl)}:fresh")
    except Exception:
        pass
    return "\n".join(lines)


def _default_lang(doc) -> str:
    try:
        lang_el = doc.styles.element.find(f".//{_w('rPrDefault')}//{_w('lang')}")
        if lang_el is not None:
            return lang_el.get(_w("val")) or ""
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------------------
# XML preprocessing (placeholders for equations and page breaks)
# ---------------------------------------------------------------------------


def _placeholder_run(text: str):
    from lxml import etree

    r = etree.Element(_w("r"))
    t = etree.SubElement(r, _w("t"))
    t.text = text
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    return r


def _preprocess(data: bytes) -> tuple[bytes, list[str], bool]:
    """Returns (docx bytes for mammoth, equation texts, has_page_breaks)."""
    from lxml import etree

    zin = zipfile.ZipFile(io.BytesIO(data))
    xml = zin.read("word/document.xml")
    root = etree.fromstring(xml)
    maths: list[str] = []

    # Outermost equations only (oMathPara contains oMath).
    targets = []
    for el in root.iter(_m("oMathPara"), _m("oMath")):
        if any(a.tag in (_m("oMathPara"), _m("oMath")) for a in el.iterancestors()):
            continue
        targets.append(el)
    for el in targets:
        text = clean_text("".join(t.text or "" for t in el.iter(_m("t"))))
        idx = len(maths)
        maths.append(text)
        run = _placeholder_run(f"{MATH_OPEN}{idx}{MATH_CLOSE}")
        parent = el.getparent()
        if el.tag == _m("oMathPara") and parent is not None and parent.tag == _w("body"):
            p = etree.Element(_w("p"))
            p.append(run)
            parent.replace(el, p)
        elif parent is not None:
            parent.replace(el, run)

    breaks = 0
    for br in list(root.iter(_w("br"))):
        if br.get(_w("type")) == "page":
            parent = br.getparent()
            parent.replace(br, _placeholder_run(PAGE_BREAK)[0])  # the w:t inside a run
            breaks += 1
    for lr in list(root.iter(_w("lastRenderedPageBreak"))):
        parent = lr.getparent()
        parent.replace(lr, _placeholder_run(PAGE_BREAK)[0])
        breaks += 1

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == "word/document.xml":
                zout.writestr(item, etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True))
            else:
                zout.writestr(item, zin.read(item.filename))
    return out.getvalue(), maths, breaks > 0


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------


def extract_docx(data: bytes, progress=None) -> tuple[str, list[dict], str]:
    """Returns (title, raw_blocks, lang)."""
    import mammoth
    from bs4 import BeautifulSoup
    from docx import Document

    progress = progress or (lambda *a: None)
    doc = Document(io.BytesIO(data))
    progress("layout", "Reading document structure…", 10)
    title = clean_text(doc.core_properties.title or "")
    lang = _default_lang(doc)
    style_map = _style_map(doc)

    prepared, maths, has_breaks = _preprocess(data)

    images: dict[str, dict] = {}

    def convert_image(image):
        try:
            with image.open() as f:
                blob = f.read()
        except Exception:
            return []
        enc = image_to_data_url(blob)
        if not enc or enc[1] < MIN_IMAGE_SIDE or enc[2] < MIN_IMAGE_SIDE:
            return []  # undecodable (e.g. EMF) or an icon-sized picture
        key = f"img{len(images)}"
        blk = image_block(enc[0])
        alt = clean_text(image.alt_text or "")
        if alt:
            # Author-supplied alt text: keep it, but staff must still review it.
            blk["alt"], blk["altStatus"], blk["_author_alt"] = alt, "ai", True
        images[key] = blk
        return [mammoth.html.element("img", {"src": "", "data-ref": key})]

    result = mammoth.convert_to_html(
        io.BytesIO(prepared), style_map=style_map, convert_image=convert_image, include_default_style_map=True
    )
    progress("layout", "Rebuilding structure…", 30)
    soup = BeautifulSoup(f"<body>{result.value}</body>", "lxml")

    def resolve(tag):
        blk = images.get(tag.get("data-ref") or "")
        return dict(blk) if blk else None

    conv = HtmlConverter(image_resolver=resolve, math_texts=maths, page_breaks=has_breaks)
    raw = conv.convert(soup.body)
    if has_breaks:
        raw.insert(0, {"type": "pageMarker", "n": 1})
    while raw and raw[-1]["type"] == "pageMarker":
        raw.pop()
    # Collapse consecutive markers (several breaks with nothing between them).
    compact: list[dict] = []
    for b in raw:
        if b["type"] == "pageMarker" and compact and compact[-1]["type"] == "pageMarker":
            compact[-1] = b
        else:
            compact.append(b)
    raw = compact

    # Title: core property, else the Title style, else the first Heading 1.
    headings = [b for b in raw if b["type"] == "heading"]
    style_titles = [b for b in headings if b.get("_doc_title")]
    if style_titles:
        first = style_titles[0]
        if not title:
            title = first["text"]
        raw.remove(first)
        headings.remove(first)
        for b in style_titles[1:]:
            b["_src_level"] = 1
    if not title and headings and headings[0]["_src_level"] == 1:
        title = headings[0]["text"]
        raw.remove(headings[0])
        headings = headings[1:]

    # Rank-compress heading levels so the shallowest becomes h2 (title is h1).
    used = sorted({b["_src_level"] for b in headings})
    rank = {lvl: min(6, i + 2) for i, lvl in enumerate(used)}
    for b in headings:
        b["level"] = rank[b.pop("_src_level")]
        b.pop("_doc_title", None)

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
