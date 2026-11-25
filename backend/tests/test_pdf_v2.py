"""Conversion-engine rules added in v2 (one synthetic fixture per rule)."""

import asyncio

import pytest

import fixtures
from access import ai
from access.check import check_doc
from access.common import build_doc, finalize_marks, rich_join, utf16_len
from access.pdf import extract_pdf
from access.pipeline import convert_document


def _types(raw, t):
    return [b for b in raw if b["type"] == t]


def _texts(raw):
    out = []
    for b in raw:
        if b.get("text"):
            out.append(b["text"])
        out.extend(b.get("items", []))
    return " ".join(out)


def test_background_image_does_not_hide_text():
    title, raw, _ = extract_pdf(fixtures.make_background_pdf())
    assert title == "Photosynthesis Basics"
    assert [b["text"] for b in _types(raw, "heading")] == ["Light reactions"]
    assert "thylakoid membranes" in _texts(raw)
    imgs = _types(raw, "image")
    assert len(imgs) == 1
    assert imgs[0]["altStatus"] == "decorative" and imgs[0]["_skip_ai"]


def test_background_image_not_sent_to_ai(fake_ai):
    _, raw, _ = extract_pdf(fixtures.make_background_pdf())
    asyncio.run(ai.enrich_blocks(raw))
    assert not [c for c in fake_ai.calls if "alt text" in c["system"]]
    assert _types(raw, "image")[0]["altStatus"] == "decorative"


def test_paragraph_continues_across_pages():
    _, raw, _ = extract_pdf(fixtures.make_crosspage_pdf())
    seq = [(b["type"], b.get("text", b.get("n"))) for b in raw if b["type"] in ("paragraph", "pageMarker")]
    merged = (
        "The plasma membrane is a thin layer that surrounds the cell. It is built from a double layer of "
        "phospholipids, and the proteins that sit inside it move substances across the membrane in both directions."
    )
    # Merged paragraph first, then the page-2 marker (documented placement), then the rest.
    assert seq == [
        ("pageMarker", 1),
        ("paragraph", merged),
        ("pageMarker", 2),
        ("paragraph", "This second paragraph ends the page cleanly."),
        ("pageMarker", 3),
        ("paragraph", "Transport proteins come in two broad kinds."),
    ]


def test_bold_line_in_flow_is_not_a_heading():
    _, raw, _ = extract_pdf(fixtures.make_bold_heading_pdf())
    heads = [b["text"] for b in _types(raw, "heading")]
    assert heads == ["Worked example", "2.1 Active transport"]
    first = _types(raw, "paragraph")[0]
    assert "and water potential matters here because it predicts" in first["text"]
    bold = [m for m in first["marks"] if m["type"] == "bold"]
    assert len(bold) == 1
    s = first["text"]
    assert s[bold[0]["start"]:bold[0]["end"]] == "water potential matters here"


def test_vector_diagram_becomes_image():
    _, raw, _ = extract_pdf(fixtures.make_vector_pdf())
    imgs = _types(raw, "image")
    assert len(imgs) == 1  # the underline and the horizontal rule are not diagrams
    img = imgs[0]
    assert img["origin"] == "vector" and img["src"].startswith("data:image/png;base64,")
    # Short labels belong to the picture; the paragraphs stay as text, in order.
    paras = [b["text"] for b in _types(raw, "paragraph")]
    assert paras[0].startswith("The cycle below") and paras[1].startswith("Each stage prepares")
    assert not any(lbl in _texts(raw).split() for lbl in ("G1", "G2", "S", "M"))
    order = [b["type"] for b in raw if b["type"] != "pageMarker"]
    assert order == ["paragraph", "image", "paragraph"]


def test_ruled_table_fixture_has_no_vector_image(course_pdf):
    _, raw, _ = extract_pdf(course_pdf)
    assert not [b for b in _types(raw, "image") if b.get("origin") == "vector"]


def test_borderless_table_and_no_false_positive_on_prose():
    _, raw, _ = extract_pdf(fixtures.make_borderless_table_pdf())
    tables = _types(raw, "table")
    assert len(tables) == 1  # page 2 prose is not a table
    t = tables[0]
    assert t["headers"] == ["Enzyme", "Optimum pH", "Site"]
    assert t["rows"][2] == ["Trypsin", "8", "Small intestine"]
    assert len(t["rows"]) == 4
    paras = [b["text"] for b in _types(raw, "paragraph")]
    assert paras[0] == "Enzymes and their optimum conditions are listed below."
    assert any(p.startswith("Enzymes are biological catalysts") for p in paras)


def test_inline_marks_bold_italic_link():
    _, raw, _ = extract_pdf(fixtures.make_marks_pdf())
    p = _types(raw, "paragraph")[0]
    text = p["text"]
    assert text == "Read the safety rules before the lab and see Lab Manual online."
    got = {(m["type"], text[m["start"]:m["end"]], m.get("href")) for m in p["marks"]}
    assert got == {
        ("bold", "safety rules", None),
        ("italic", "Lab Manual", None),
        ("link", "Lab Manual", "https://example.org/manual"),
    }


def test_marks_use_utf16_offsets():
    text = "😀 bold"  # the emoji is 1 code point but 2 UTF-16 units
    marks = finalize_marks(text, [{"type": "bold", "start": 2, "end": 6}])
    assert marks == [{"start": 3, "end": 7, "type": "bold"}]
    assert utf16_len(text) == 7
    # Unsafe hrefs are dropped.
    assert finalize_marks("a link", [{"type": "link", "href": "javascript:alert(1)", "start": 2, "end": 6}]) == []


def test_rich_join_keeps_marks_across_hyphenation():
    text, marks = rich_join("a selec-", [{"type": "bold", "start": 2, "end": 8}], "tive barrier",
                            [{"type": "bold", "start": 0, "end": 4}])
    assert text == "a selective barrier"
    assert [(m["start"], m["end"]) for m in marks] == [(2, 11)]


def test_scanned_pdf_without_key_succeeds_with_ocr_issue():
    title, raw, _ = extract_pdf(fixtures.make_scanned_pdf())
    imgs = _types(raw, "image")
    assert len(imgs) == 2 and all(b["origin"] == "page" and b["altStatus"] == "missing" for b in imgs)
    assert not any("_scan_png" in b for b in imgs)  # no key: nothing queued for vision
    doc = build_doc(title or "Scan", raw, "scan.pdf")
    rules = [i["rule"] for i in check_doc(doc)["issues"]]
    assert rules == ["page-needs-ocr", "page-needs-ocr"]  # replaces the alt-text rules


def test_scanned_pdf_with_vision(fake_ai):
    events = []
    doc = asyncio.run(convert_document(fixtures.make_scanned_pdf(1), "scan.pdf", True, events.append))
    blocks = [b for s in doc["sections"] for b in s["blocks"]]
    types = [b["type"] for b in blocks]
    assert types == ["pageMarker", "paragraph", "list", "table", "math"]
    assert doc["sections"][0]["heading"] == "Scanned heading"  # level 9 clamped, became the section
    para = blocks[1]
    assert para["text"] == "Text read from the scan."
    assert blocks[2] == {"id": blocks[2]["id"], "type": "list", "ordered": False, "items": ["one", "2"], "plain": None}
    assert blocks[3]["headers"] == ["A", "B", ""] and blocks[3]["rows"] == [["1", "", ""], ["2", "3", "4"]]
    assert blocks[4]["latex"] == "x^{2}" and blocks[4]["spoken"] == "x squared"
    assert all(b["id"].startswith("b") for b in blocks)
    assert "page-needs-ocr" not in [i["rule"] for i in doc["report"]["issues"]]
    ocr_calls = [c for c in fake_ai.calls if "scanned page" in c["system"]]
    assert len(ocr_calls) == 1 and ocr_calls[0]["messages"][0]["content"][0]["type"] == "image"


def test_scanned_pages_capped(fake_ai, monkeypatch):
    import access.pdf as pdfmod

    monkeypatch.setattr(pdfmod, "MAX_OCR_PAGES", 1)
    _, raw, _ = extract_pdf(fixtures.make_scanned_pdf(3))
    assert sum(1 for b in raw if b.get("_scan_png")) == 1


def test_scanned_page_ai_failure_keeps_page_image(failing_ai, monkeypatch):
    async def boom(*a, **k):
        raise ai.AIError("nope")

    monkeypatch.setattr(ai, "page_to_blocks", boom)
    doc = asyncio.run(convert_document(fixtures.make_scanned_pdf(1), "scan.pdf", True, lambda e: None))
    assert [i["rule"] for i in doc["report"]["issues"]][-1] == "page-needs-ocr"


def test_math_page_with_vision(fake_ai):
    _, raw, _ = extract_pdf(fixtures.make_math_pdf())
    maths = _types(raw, "math")
    assert len(maths) == 3 and all(m.get("_math_png") for m in maths)
    asyncio.run(ai.enrich_blocks(raw))
    assert [m["spoken"] for m in maths] == ["vision reading 1", "vision reading 2", "vision reading 3"]
    assert maths[0]["latex"] == "\\alpha_1"
    vision = [c for c in fake_ai.calls if "mathematics on one page" in c["system"]]
    assert len(vision) == 1  # one call per page, not per formula
    assert not [c for c in fake_ai.calls if "maths expression" in c["system"]]


def test_math_page_without_key_uses_rules():
    _, raw, _ = extract_pdf(fixtures.make_math_pdf())
    maths = _types(raw, "math")
    assert maths and all(m["latex"] is None and m["spoken"] for m in maths)
    assert "the sum of" in maths[0]["spoken"]


def test_blank_pdf_still_rejected():
    import fitz

    d = fitz.open()
    d.new_page()
    with pytest.raises(ValueError):
        extract_pdf(d.tobytes())
