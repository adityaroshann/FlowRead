"""Accessible PDF export (Typst, PDF/UA-1)."""

import base64
import re

import fitz
import pytest
from fastapi.testclient import TestClient

from access.common import build_doc
from access.pdf import extract_pdf
from export.typst_render import THEME_COLORS, render_pdf, resolve_style, runs, slug
from fixtures import make_course_pdf, make_png

# Mirrors PROFILES in packages/core/src/profiles.js (only the settings the exporter reads).
PROFILES = {
    "standard": {"theme": "light", "font": "system", "textScale": 1, "letterSpacing": 0, "wordSpacing": 0,
                 "lineHeight": 1.6, "measure": 70, "boldStarts": False},
    "dyslexia": {"theme": "cream", "font": "atkinson", "textScale": 1.1, "letterSpacing": 0.12, "wordSpacing": 0.16,
                 "lineHeight": 1.8, "measure": 65, "boldStarts": False},
    "focus": {"theme": "light", "font": "system", "textScale": 1, "letterSpacing": 0, "wordSpacing": 0,
              "lineHeight": 1.7, "measure": 65, "boldStarts": False, "focusMode": True, "summaries": True},
    "screenreader": {"theme": "light", "font": "system", "textScale": 1, "letterSpacing": 0, "wordSpacing": 0,
                     "lineHeight": 1.6, "measure": 70, "boldStarts": False, "minimalChrome": True},
    "lowvision": {"theme": "high-contrast", "font": "atkinson", "textScale": 1.5, "letterSpacing": 0,
                  "wordSpacing": 0, "lineHeight": 1.6, "measure": 60, "boldStarts": False, "thickFocus": True},
}
BODY_FONT = {"standard": "AtkinsonHyperlegibleNext", "dyslexia": "AtkinsonHyperlegibleNext",
             "focus": "AtkinsonHyperlegibleNext", "screenreader": "AtkinsonHyperlegibleNext",
             "lowvision": "AtkinsonHyperlegibleNext"}
BUNDLED_PS = ("AtkinsonHyperlegibleNext", "Fraunces", "Lexend", "Literata", "OpenDyslexic",
              # Typst's own embedded fallbacks (maths and missing glyphs)
              "NewCM", "NewComputerModern", "Libertinus", "DejaVuSansMono")


def _src(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


def study_doc() -> dict:
    """A realistic synthetic study document exercising every block type."""
    title, raw, lang = extract_pdf(make_course_pdf())
    doc = build_doc(title, raw, "week3.pdf", "en-US")
    s1 = doc["sections"][0]
    s1["summary"] = "Cells are the units of life; this section introduces key organelles."
    for b in s1["blocks"]:
        if b["type"] == "paragraph":
            b["plain"] = "Cells are tiny parts that make up living things."
            b["marks"] = [{"start": 0, "end": 5, "type": "bold"},
                          {"start": 14, "end": 19, "type": "link", "href": "https://example.org/cells"}]
            break
    for s in doc["sections"]:
        for b in s["blocks"]:
            if b["type"] == "image":
                b["alt"], b["altStatus"] = "Diagram of an animal cell with a nucleus in the centre.", "approved"
    doc["sections"][-1]["blocks"] += [
        {"id": "n1", "type": "paragraph", "text": "Remind students about the quiz.", "role": "notes", "plain": None},
        {"id": "d1", "type": "image", "src": _src(make_png(100, 60)), "alt": "", "altStatus": "decorative",
         "caption": None, "plain": None},
    ]
    return doc


@pytest.fixture(scope="module")
def doc():
    return study_doc()


def _headings(doc):
    out = [doc["title"]]
    for s in doc["sections"]:
        if s["heading"]:
            out.append(s["heading"])
        out += [b["text"] for b in s["blocks"] if b["type"] == "heading"]
    return out


def _struct_tags(pdf: fitz.Document) -> list[tuple[str, str | None]]:
    tags = []
    for x in range(1, pdf.xref_length()):
        try:
            kind, val = pdf.xref_get_key(x, "S")
        except Exception:
            continue
        if kind == "name":
            alt = pdf.xref_get_key(x, "Alt")
            tags.append((val, alt[1] if alt[0] == "string" else None))
    return tags


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("⁠", "")).strip()


@pytest.mark.parametrize("profile", list(PROFILES))
def test_profiles_compile_tagged_pdf(doc, profile):
    data = render_pdf(doc, PROFILES[profile], {"includeToc": True, "includeSummaries": True})
    pdf = fitz.open(stream=data, filetype="pdf")
    # Squash spaces: wide letter spacing makes text extraction insert spaces inside words.
    text = re.sub(r"\s+", "", " ".join(p.get_text() for p in pdf))
    for word in ("Week 3: Cell Biology", "Introduction", "Organelle", "Mitochondrion", "selectively permeable",
                 "ALPHA Left column", "Figure 1: A simplified animal cell"):
        assert word.replace(" ", "") in text, (profile, word)
    # Bookmarks = headings, in order.
    assert [t for _, t, _ in pdf.get_toc()] == _headings(doc)
    cat = pdf.pdf_catalog()
    assert pdf.xref_get_key(cat, "StructTreeRoot")[0] == "xref"
    assert "Marked true" in pdf.xref_get_key(cat, "MarkInfo")[1]
    assert pdf.xref_get_key(cat, "Lang") == ("string", "en-US")
    assert pdf.metadata["title"] == "Week 3: Cell Biology"
    fonts = {f[3].split("+", 1)[-1] for p in pdf for f in p.get_fonts()}
    assert all(f.startswith(BUNDLED_PS) for f in fonts), fonts
    assert any(f.startswith(BODY_FONT[profile]) for f in fonts)
    tags = _struct_tags(pdf)
    names = {t for t, _ in tags}
    assert {"/H1", "/H2", "/H3", "/Table", "/TH", "/L", "/Figure", "/Formula", "/Link"} <= names
    assert ("/Figure", "Diagram of an animal cell with a nucleus in the centre.") in tags
    assert any(t == "/Formula" and alt and "equals" in alt for t, alt in tags)


def test_cream_theme_page_fill(doc):
    data = render_pdf(doc, PROFILES["dyslexia"])
    pix = fitz.open(stream=data)[0].get_pixmap(clip=fitz.Rect(2, 2, 4, 4))
    want = tuple(int(THEME_COLORS["cream"]["bg"][i:i + 2], 16) for i in (1, 3, 5))
    assert all(abs(a - b) <= 3 for a, b in zip(pix.pixel(0, 0), want)), pix.pixel(0, 0)


def test_lowvision_uses_body_font_for_headings_and_large_text(doc):
    style = resolve_style(PROFILES["lowvision"], None)
    assert style["hfonts"][0] == "Atkinson Hyperlegible Next" and style["size"] == 16.5
    data = render_pdf(doc, PROFILES["lowvision"])
    fonts = {f[3].split("+", 1)[-1] for p in fitz.open(stream=data) for f in p.get_fonts()}
    assert not any(f.startswith("Fraunces") for f in fonts)


def test_standard_uses_fraunces_headings(doc):
    fonts = {f[3].split("+", 1)[-1] for p in fitz.open(stream=render_pdf(doc)) for f in p.get_fonts()}
    assert any(f.startswith("Fraunces") for f in fonts)


def test_dyslexic_font():
    d = {"title": "T", "lang": "en", "sections": [{"heading": "H", "level": 2, "blocks": [
        {"type": "paragraph", "text": "Some readable text."}]}]}
    fonts = {f[3] for p in fitz.open(stream=render_pdf(d, {"font": "dyslexic"})) for f in p.get_fonts()}
    assert any("OpenDyslexic" in f for f in fonts) and not any("Fraunces" in f for f in fonts)


def test_options(doc):
    plain = _norm(" ".join(p.get_text() for p in fitz.open(stream=render_pdf(doc, None, {
        "includeSummaries": True, "includePlain": True, "includePageRefs": True, "pageSize": "Letter"}))))
    assert "In this section" in plain and "this section introduces key organelles" in plain
    assert "Plain language" in plain and "tiny parts that make up living things" in plain
    assert "p. 2" in plain
    assert "Speaker notes" in plain and "Remind students about the quiz." in plain
    off = fitz.open(stream=render_pdf(doc, None, {"includePageRefs": False}))
    off_text = _norm(" ".join(p.get_text() for p in off))
    assert "p. 2" not in off_text and "In this section" not in off_text and "Plain language" not in off_text
    assert "Contents" not in off_text
    letter = fitz.open(stream=render_pdf(doc, None, {"pageSize": "Letter"}))[0].rect
    assert (round(letter.width), round(letter.height)) == (612, 792)


def test_marks_and_link_annotation(doc):
    pdf = fitz.open(stream=render_pdf(doc))
    uris = [l.get("uri") for p in pdf for l in p.get_links()]
    assert "https://example.org/cells" in uris


def test_bold_starts_are_visual_not_strong():
    d = {"title": "T", "lang": "en", "sections": [{"heading": "", "level": 2, "blocks": [
        {"type": "paragraph", "text": "Reading accessibility matters."}]}]}
    pdf = fitz.open(stream=render_pdf(d, {"boldStarts": True}))
    spans = [s for b in pdf[0].get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]]
    bold = [s["text"] for s in spans if s["flags"] & 16]
    assert "Rea" in bold and "access" in bold
    assert "/Strong" not in {t for t, _ in _struct_tags(pdf)}
    assert "Reading accessibility matters." in _norm(pdf[0].get_text())


def test_heading_levels_are_normalised_for_ua1():
    d = {"title": "T", "lang": "fr", "sections": [
        {"heading": "A", "level": 2, "blocks": [{"type": "heading", "text": "Deep", "level": 6},
                                               {"type": "heading", "text": "", "level": 3}]},
        {"heading": "B", "level": 4, "blocks": []}]}
    pdf = fitz.open(stream=render_pdf(d))
    assert pdf.get_toc() == [[1, "T", 1], [1, "A", 1], [2, "Deep", 1], [1, "B", 1]] or \
        [t for _, t, _ in pdf.get_toc()] == ["T", "A", "Deep", "B"]
    assert pdf.xref_get_key(pdf.pdf_catalog(), "Lang") == ("string", "fr")


NASTY = [
    "#set page(fill: red) #panic(\"x\")",
    "*bold* _em_ `raw` $x^2$ @label <lbl> \\ ~ = == ---",
    "- list? + enum? / term: 1. number",
    "]) #{ panic() } [",
    "\"quotes\" 'single' “smart”",
    "#import \"/etc/passwd\" #read(\"data.json\")",
    "= Heading? // comment /* block */",
    "emoji \U0001F600 and math \U0001D465 and RTL שלום",
    "control\x00chars\x07here\ud800lone",
    "line\nbreak\r\nand\ttab",
]


def test_no_markup_injection():
    blocks = []
    for i, s in enumerate(NASTY):
        blocks += [
            {"type": "heading", "text": s, "level": 3},
            {"type": "paragraph", "text": s, "marks": [{"start": 0, "end": 3, "type": "bold"},
                                                       {"start": 1, "end": 4, "type": "link", "href": s}],
             "plain": s},
            {"type": "list", "ordered": i % 2 == 0, "items": [s, s]},
            {"type": "table", "caption": s, "headers": [s, "h"], "rows": [[s, s], [s]]},
            {"type": "math", "text": s, "spoken": s, "latex": s},
            {"type": "image", "src": _src(make_png(80, 50)), "alt": s, "altStatus": "approved", "caption": s},
            {"type": "pageMarker", "n": i + 1},
        ]
    d = {"title": NASTY[0], "lang": "#en", "sections": [
        {"heading": NASTY[1], "level": 2, "summary": NASTY[2], "blocks": blocks}]}
    data = render_pdf(d, {"boldStarts": True}, {"includeSummaries": True, "includePlain": True, "includeToc": True})
    pdf = fitz.open(stream=data)
    assert pdf.page_count >= 1 and pdf[0].rect.width < 600  # page settings were not overridden
    text = _norm(" ".join(p.get_text() for p in pdf))
    for s in NASTY[:7]:
        assert _norm(s) in text, s
    assert pdf.metadata["title"] == NASTY[0]
    assert not [l for p in pdf for l in p.get_links() if l.get("uri", "").startswith("#")]


def test_runs_utf16_marks():
    r = runs("\U0001F600 bold text", [{"start": 3, "end": 7, "type": "bold"}])
    assert r == [{"t": "\U0001F600 "}, {"t": "bold", "b": True}, {"t": " text"}]
    assert runs("x", [{"start": 0, "end": 99, "type": "bold"}]) == [{"t": "x"}]  # out of range: ignored


def test_bad_images_are_skipped():
    d = {"title": "T", "lang": "en", "sections": [{"heading": "H", "level": 2, "blocks": [
        {"type": "image", "src": "data:image/png;base64,AAAA", "alt": "x", "altStatus": "approved",
         "caption": "Figure 9: kept as text"},
        {"type": "image", "src": "https://example.org/x.png", "alt": "x", "altStatus": "approved", "caption": None},
        {"type": "image", "src": _src(make_png()), "alt": "", "altStatus": "missing", "caption": None,
         "origin": "page"},
    ]}]}
    pdf = fitz.open(stream=render_pdf(d))
    assert "Figure 9: kept as text" in pdf[0].get_text()
    assert any(t == "/Figure" and alt and "Scanned page" in alt for t, alt in _struct_tags(pdf))


def test_slug():
    assert slug("Week 3: Cell Biology!") == "week-3-cell-biology"
    assert slug("日本語") == "document"


def test_end_to_end_convert_then_export():
    import asyncio

    from access.pipeline import convert_document

    doc = asyncio.run(convert_document(make_course_pdf(), "week3.pdf", False, lambda e: None))
    pdf = fitz.open(stream=render_pdf(doc, PROFILES["focus"]))
    assert [t for _, t, _ in pdf.get_toc()] == [
        "Week 3: Cell Biology", "Introduction", "Key terms", "Cell structures", "Steps in the lab", "Discussion"]


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


def test_api_export_pdf(client, doc):
    r = client.post("/api/export/pdf", json={"doc": doc, "settings": PROFILES["dyslexia"],
                                             "options": {"pageSize": "A4", "includeToc": True}})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["x-flowread-pdf-standard"] == "ua-1"
    assert r.headers["content-disposition"] == 'attachment; filename="week-3-cell-biology-flowread.pdf"'
    assert r.content[:5] == b"%PDF-"


def test_api_export_invalid(client):
    assert client.post("/api/export/pdf", content=b"not json", headers={"content-type": "application/json"}).status_code == 422
    assert client.post("/api/export/pdf", json={"doc": {"title": "x"}}).status_code == 422
    assert client.post("/api/export/pdf", json={"doc": {"title": "x", "sections": "nope"}}).status_code == 422


def test_api_export_too_large(client, monkeypatch):
    import routers.export as routes

    monkeypatch.setattr(routes, "MAX_EXPORT_BYTES", 100)
    r = client.post("/api/export/pdf", json={"doc": {"title": "x" * 200, "sections": []}})
    assert r.status_code == 413


def test_api_export_compile_error_is_generic(client, monkeypatch):
    import routers.export as routes
    from export.typst_render import ExportError

    def boom(*a, **k):
        raise ExportError("secret internal detail")

    monkeypatch.setattr(routes, "render_pdf_with_info", boom)
    r = client.post("/api/export/pdf", json={"doc": {"title": "x", "sections": []}})
    assert r.status_code == 500 and "secret" not in r.text


def test_api_export_health(client):
    r = client.get("/api/export/health")
    assert r.status_code == 200
    body = r.json()
    assert body["typst"].startswith("0.")
    assert body["fonts"] == ["Atkinson Hyperlegible Next", "Fraunces", "Lexend", "Literata", "OpenDyslexic"]


def test_undrawable_glyphs_are_named():
    from export.typst_render import render_pdf_with_info

    d = {"title": "Emoji 😀", "lang": "en", "sections": [{"heading": "H", "level": 2, "blocks": [
        {"type": "paragraph", "text": "Great work 😀 everyone."}]}]}
    data, info = render_pdf_with_info(d)
    assert info["standard"] == "ua-1" and info["replaced"] == ["😀"]
    assert "Great work [grinning face] everyone." in _norm(fitz.open(stream=data)[0].get_text())


def test_many_undrawable_glyphs_fall_back_to_tagged_pdf():
    from export.typst_render import render_pdf_with_info

    cjk = "日本語の文書です。細胞は生命の基本単位である。核と膜"
    d = {"title": "Biology", "lang": "ja", "sections": [{"heading": "H", "level": 2, "blocks": [
        {"type": "paragraph", "text": cjk}]}]}
    data, info = render_pdf_with_info(d)
    assert info["standard"] == "tagged"
    pdf = fitz.open(stream=data)
    assert pdf.xref_get_key(pdf.pdf_catalog(), "StructTreeRoot")[0] == "xref"
