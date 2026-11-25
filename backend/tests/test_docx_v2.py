"""DOCX conversion on mammoth: structure that python-docx alone used to miss."""

import pytest

from access.common import build_doc
from access.docx import extract_docx
from fixtures import make_rich_docx


@pytest.fixture(scope="module")
def rich():
    return extract_docx(make_rich_docx())


def _types(raw, t):
    return [b for b in raw if b["type"] == t]


def test_title_and_custom_heading_style(rich):
    title, raw, lang = rich
    assert title == "Unit 2: Ecology"
    assert lang == "en-US"
    # "Chapter Heading" is based on Heading 1, so it is a top-level heading.
    assert [(b["text"], b["level"]) for b in _types(raw, "heading")] == [("Food webs", 2), ("Energy pyramids", 3)]


def test_marks_and_link(rich):
    p = next(b for b in _types(rich[1], "paragraph") if b["text"].startswith("Energy flows"))
    text = p["text"]
    got = [(m["type"], text[m["start"]:m["end"]], m.get("href")) for m in p["marks"]]
    assert got == [
        ("bold", "producers", None),
        ("italic", "consumers", None),
        ("link", "the field guide", "https://example.org/guide"),
    ]


def test_nested_list_becomes_consecutive_lists(rich):
    lists = _types(rich[1], "list")
    assert [b["items"] for b in lists] == [["Producers"], ["Plants", "Algae"], ["Consumers"]]
    raw = rich[1]
    i = raw.index(lists[0])
    assert raw[i + 1] is lists[1] and raw[i + 2] is lists[2]  # in reading order, nothing in between


def test_content_control_and_text_box(rich):
    texts = [b["text"] for b in _types(rich[1], "paragraph")]
    assert "Text inside a content control." in texts
    assert "Text inside a text box." in texts


def test_table_header_and_image_after_table(rich):
    raw = rich[1]
    table = _types(raw, "table")[0]
    assert table["headers"] == ["Organism", "Role"]
    assert table["rows"] == [["Oak", "Producer"], ["Fox", "Consumer"]]
    i = raw.index(table)
    assert raw[i + 1]["type"] == "image" and raw[i + 1]["src"].startswith("data:image/png;base64,")


def test_page_break_and_math(rich):
    raw = rich[1]
    assert [b["n"] for b in _types(raw, "pageMarker")] == [1, 2]
    marker2 = next(b for b in raw if b["type"] == "pageMarker" and b["n"] == 2)
    assert raw[raw.index(marker2) + 1]["text"] == "Energy pyramids"
    math = _types(raw, "math")[0]
    assert math["text"] == "E=mc2" and math["spoken"]


def test_builds_doc(rich):
    title, raw, lang = rich
    doc = build_doc(title, raw, "unit2.docx", lang)
    assert [s["heading"] for s in doc["sections"]] == ["Food webs"]
    para = next(b for s in doc["sections"] for b in s["blocks"] if b["type"] == "paragraph")
    assert para["marks"][0]["type"] == "bold"
