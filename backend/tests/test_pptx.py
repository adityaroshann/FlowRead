from access.common import build_doc
from access.pipeline import sniff_kind
from access.pptx import extract_pptx
from fixtures import make_course_docx, make_course_pptx


def test_sniff_kind_uses_zip_directory():
    assert sniff_kind(make_course_pptx(), "deck.pptx") == "pptx"
    assert sniff_kind(make_course_pptx(), "misnamed.docx") == "pptx"
    assert sniff_kind(make_course_docx(), "notes.docx") == "docx"
    assert sniff_kind(b"PK\x03\x04garbage", "x.pptx") is None


def test_pptx_slides_become_sections():
    title, raw, _ = extract_pptx(make_course_pptx())
    assert title == "Climate Systems"
    doc = build_doc(title, raw, "deck.pptx", "en")
    secs = doc["sections"]
    assert [s["heading"] for s in secs] == ["Climate Systems", "The greenhouse effect", "Gas concentrations", "Slide 4"]
    assert all(s["level"] == 2 for s in secs)
    for n, s in enumerate(secs, start=1):
        assert s["blocks"][0]["type"] == "pageMarker" and s["blocks"][0]["n"] == n

    # Slide 1: subtitle paragraph.
    assert secs[0]["blocks"][1]["text"] == "Lecture 5 overview"

    # Slide 2: bullets by level (sub-level is its own list block), then speaker notes.
    b2 = secs[1]["blocks"]
    lists = [b["items"] for b in b2 if b["type"] == "list"]
    assert lists == [
        ["Sunlight warms the surface", "Infrared leaves the surface"],
        ["Some is absorbed by gases", "Carbon dioxide"],
        ["The air warms"],
    ]
    notes = b2[-1]
    assert notes["type"] == "paragraph" and notes["role"] == "notes"
    assert notes["text"] == "Ask the class which gases they already know."

    # Slide 3: table, picture, italic text box.
    b3 = secs[2]["blocks"]
    table = next(b for b in b3 if b["type"] == "table")
    assert table["headers"] == ["Gas", "Share"]
    assert table["rows"] == [["Nitrogen", "78%"], ["Oxygen", "21%"]]
    img = next(b for b in b3 if b["type"] == "image")
    assert img["src"].startswith("data:image/") and img["altStatus"] == "missing"
    src = next(b for b in b3 if b["type"] == "paragraph")
    assert src["text"] == "Source: synthetic data"
    assert src["marks"] == [{"start": 0, "end": 22, "type": "italic"}]

    # Slide 4 has no title placeholder.
    assert secs[3]["blocks"][1]["text"] == "Questions?"
