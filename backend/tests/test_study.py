"""Flashcards, heading suggestions and the 'what AI did' summary."""
from fastapi.testclient import TestClient

import main
from access.pipeline import finish_document

client = TestClient(main.app)
SECTIONS = [{"id": "s1", "heading": "Light", "text": "Chloroplasts carry out photosynthesis."},
            {"id": "s2", "heading": "Stroma", "text": "The stroma is the fluid inside a chloroplast."}]


def test_flashcards_need_a_key():
    r = client.post("/api/access/flashcards", json={"title": "T", "sections": SECTIONS})
    assert r.status_code == 503


def test_flashcards_are_validated(fake_ai):
    r = client.post("/api/access/flashcards", json={"title": 'Week "5"', "sections": SECTIONS})
    assert r.status_code == 200
    cards = r.json()["cards"]
    assert [c["front"] for c in cards] == ["What do chloroplasts do?", "Plants store energy as ____.", "Define stroma"]
    assert cards[1]["sectionId"] is None  # unknown section id dropped
    assert cards[2]["kind"] == "concept"  # unknown kind normalised
    sent = fake_ai.calls[-1]["messages"][0]["content"]
    assert "<section id=\"s1\"" in sent and "Week '5'" in sent


def test_flashcards_reject_empty_docs(fake_ai):
    r = client.post("/api/access/flashcards", json={"title": "T", "sections": [{"id": "s1", "text": "  "}]})
    assert r.status_code == 400


def test_structure_returns_only_valid_headings_in_order(fake_ai):
    paras = [{"id": f"b{i}", "text": f"Paragraph {i} about plants."} for i in range(1, 11)]
    r = client.post("/api/access/structure", json={"paragraphs": paras})
    assert r.status_code == 200
    assert r.json()["headings"] == [
        {"beforeBlockId": "b4", "text": "The Calvin cycle"},
        {"beforeBlockId": "b9", "text": "Later topic"},
    ]


def test_structure_needs_enough_text(fake_ai):
    r = client.post("/api/access/structure", json={"paragraphs": [{"id": "b1", "text": "One."}]})
    assert r.status_code == 400


def test_doc_records_what_ai_did_without_a_key():
    import asyncio

    raw = [{"type": "paragraph", "text": "Hello there."}]
    doc = asyncio.run(finish_document("T", raw, "en", "x.txt", {"kind": "text"}, True, lambda *a: None))
    assert doc["ai"] == {"available": False, "imagesDescribed": 0, "imagesNeedingAlt": 0, "pagesRead": 0, "mathSpoken": 0}
