import io

from access.common import build_doc
from access.docx import extract_docx


def test_docx_structure(course_docx):
    title, raw, lang = extract_docx(course_docx)
    assert title == "Week 4: Genetics"
    assert lang == "en-US"
    heads = [(b["text"], b["level"]) for b in raw if b["type"] == "heading"]
    assert heads == [("Introduction", 2), ("Inheritance patterns", 3), ("Punnett squares", 2)]

    lists = [b for b in raw if b["type"] == "list"]
    assert [b["ordered"] for b in lists] == [False, True]
    assert lists[0]["items"][0] == "Dominant alleles mask recessive alleles."
    assert lists[1]["items"] == ["Cross two pea plants.", "Count the offspring."]

    table = next(b for b in raw if b["type"] == "table")
    assert table["headers"] == ["Genotype", "Phenotype"]
    assert table["rows"] == [["AA", "Dominant"], ["aa", "Recessive"]]

    img = next(b for b in raw if b["type"] == "image")
    assert img["src"].startswith("data:image/png;base64,")
    assert img["caption"] == "Figure 1: A Punnett square"
    assert img["altStatus"] == "missing"

    math = next(b for b in raw if b["type"] == "math")
    assert math["text"].startswith("P(aa) = 1/4")

    doc = build_doc(title, raw, "week4.docx", lang)
    assert [s["heading"] for s in doc["sections"]] == ["Introduction", "Punnett squares"]


def test_docx_without_title_style_uses_first_heading1():
    from docx import Document

    d = Document()
    d.add_paragraph("Lab Safety", style="Heading 1")
    d.add_paragraph("Rules", style="Heading 2")
    d.add_paragraph("Wear goggles.")
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "a", "b"
    t.cell(1, 0).text, t.cell(1, 1).text = "c", "d"
    buf = io.BytesIO()
    d.save(buf)
    title, raw, _ = extract_docx(buf.getvalue())
    assert title == "Lab Safety"
    assert [(b["text"], b["level"]) for b in raw if b["type"] == "heading"] == [("Rules", 2)]
    table = next(b for b in raw if b["type"] == "table")
    assert table["headers"] == []  # nothing marks the first row as a header
    assert table["rows"] == [["a", "b"], ["c", "d"]]
