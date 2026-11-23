import pytest

from access.common import build_doc
from access.pdf import extract_pdf
from fixtures import HEADER, make_course_pdf


@pytest.fixture(scope="module")
def extracted(course_pdf):
    return extract_pdf(course_pdf)


@pytest.fixture(scope="module")
def blocks(extracted):
    return extracted[1]


def _types(blocks, t):
    return [b for b in blocks if b["type"] == t]


def _all_text(blocks):
    out = []
    for b in blocks:
        for k in ("text", "caption"):
            if b.get(k):
                out.append(b[k])
        out.extend(b.get("items", []))
        out.extend(b.get("headers", []))
        for r in b.get("rows", []):
            out.extend(r)
    return out


def test_title_from_largest_text_on_page_one(extracted):
    title, blocks, _ = extracted
    assert title == "Week 3: Cell Biology"
    assert all(b.get("text") != "Week 3: Cell Biology" for b in blocks)


def test_metadata_title_preferred():
    title, _, _ = extract_pdf(make_course_pdf(metadata_title="Cell Biology Notes"))
    assert title == "Cell Biology Notes"


def test_heading_levels(blocks):
    heads = [(b["text"], b["level"]) for b in _types(blocks, "heading")]
    assert heads == [
        ("Introduction", 2),
        ("Key terms", 3),
        ("Cell structures", 2),
        ("Steps in the lab", 3),
        ("Discussion", 2),
    ]


def test_running_header_and_page_numbers_removed(blocks):
    texts = _all_text(blocks)
    assert not any(HEADER in t or "BIOL 1001" in t for t in texts)
    flow = [b["text"] for b in blocks if b["type"] in ("paragraph", "heading")]
    assert not any(t.strip() in ("1", "2", "3") for t in flow)


def test_page_markers(blocks):
    assert [b["n"] for b in _types(blocks, "pageMarker")] == [1, 2, 3]


def test_paragraph_merge_and_hyphenation(blocks):
    paras = [b["text"] for b in _types(blocks, "paragraph")]
    assert (
        "Cells are the basic units of life. Every living organism is made of one or more cells, "
        "and each cell carries out the processes that keep the organism alive."
    ) in paras
    assert any("selectively permeable barrier" in p for p in paras)
    assert not any("selec-" in p for p in paras)


def test_bulleted_list(blocks):
    bullets = [b for b in _types(blocks, "list") if not b["ordered"]]
    assert len(bullets) == 1
    items = bullets[0]["items"]
    assert len(items) == 3
    assert items[0] == "Nucleus: stores the genetic material of the cell."
    # A wrapped continuation line joins its item.
    assert items[1] == "Mitochondria: produce energy for the cell through cellular respiration."


def test_numbered_list(blocks):
    ordered = [b for b in _types(blocks, "list") if b["ordered"]]
    assert len(ordered) == 1
    assert ordered[0]["items"] == [
        "Prepare the microscope slide.",
        "Add one drop of stain.",
        "Focus at low power first.",
    ]


def test_table_headers_rows_caption(blocks):
    tables = _types(blocks, "table")
    assert len(tables) == 1
    t = tables[0]
    assert t["headers"] == ["Organelle", "Function", "Count per cell"]
    assert t["rows"] == [
        ["Nucleus", "Stores DNA", "1"],
        ["Mitochondrion", "Makes ATP", "1000"],
        ["Ribosome", "Builds proteins", "10000"],
    ]
    assert t["caption"] == "Table 1: Organelles and their functions"
    # Table cell text is not duplicated as paragraphs.
    assert not any("Mitochondrion" in b.get("text", "") for b in _types(blocks, "paragraph"))


def test_image_block(blocks):
    images = _types(blocks, "image")
    assert len(images) == 1  # the 16px icon is skipped
    img = images[0]
    assert img["src"].startswith("data:image/png;base64,")
    assert img["alt"] == "" and img["altStatus"] == "missing"
    assert img["caption"] == "Figure 1: A simplified animal cell"
    assert "simplified animal cell" in img["_context"]
    assert "Cell structures" in img["_context"]


def test_math_block(blocks):
    maths = _types(blocks, "math")
    assert len(maths) == 1
    m = maths[0]
    assert m["text"] == "Magnification = image size ÷ actual size"
    assert m["latex"] is None
    assert "equals" in m["spoken"] and "divided by" in m["spoken"]


def test_two_column_reading_order(blocks):
    start = next(i for i, b in enumerate(blocks) if b.get("text") == "Discussion")
    paras = [b["text"] for b in blocks[start + 1 :] if b["type"] == "paragraph"]
    assert [p.split()[0] for p in paras] == ["ALPHA", "BETA", "GAMMA", "DELTA"]
    assert paras[0] == "ALPHA Left column starts here and talks about prokaryotic cells which lack a nucleus."
    assert paras[2] == "GAMMA Right column begins with eukaryotic cells which have a membrane-bound nucleus."


def test_sections(extracted):
    title, raw, lang = extracted
    doc = build_doc(title, [dict(b) for b in raw], "week3.pdf", lang or "en")
    assert doc["id"].startswith("doc_")
    assert [s["heading"] for s in doc["sections"]] == ["Introduction", "Cell structures", "Discussion"]
    assert all(s["level"] == 2 for s in doc["sections"])
    assert [s["id"] for s in doc["sections"]] == ["s1", "s2", "s3"]
    # The page-1 marker sits at the start of the first section.
    assert doc["sections"][0]["blocks"][0] == {"id": "b1", "type": "pageMarker", "n": 1}
    ids = [b["id"] for s in doc["sections"] for b in s["blocks"]]
    assert len(ids) == len(set(ids))
    for s in doc["sections"]:
        assert s["summary"] is None
        for b in s["blocks"]:
            assert not any(k.startswith("_") for k in b)
            if b["type"] != "pageMarker":
                assert b["plain"] is None
    # Section headings are not repeated as blocks.
    assert not any(b["type"] == "heading" and b["level"] == 2 for s in doc["sections"] for b in s["blocks"])


def test_rejects_textless_pdf():
    import fitz

    d = fitz.open()
    d.new_page()
    with pytest.raises(ValueError):
        extract_pdf(d.tobytes())
