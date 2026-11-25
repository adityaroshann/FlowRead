"""Readability pass: split walls of text and inline lists without changing words."""
from access.common import build_doc, utf16_len
from access.readability import (
    LONG_PARAGRAPH_WORDS, readable_blocks, sentence_spans, split_inline_list, split_long_paragraph, structure_hint,
)

SENT = [
    "Photosynthesis converts light energy into chemical energy stored in glucose.",
    "It takes place in the chloroplasts, which are found mostly in the cells of leaves.",
    "The process has two main stages, often called the light-dependent reactions and the Calvin cycle.",
    "In the first stage, water is split and oxygen is released as a by-product, e.g. from the leaf surface.",
    "Dr. Smith's lab measured the rate at different light levels in 2024.",
    "The second stage uses carbon dioxide from the air to build sugars step by step.",
    "These sugars feed the plant and, through food chains, almost every other living thing.",
    "Without photosynthesis there would be very little free oxygen in the atmosphere.",
    "Scientists still study how to make artificial versions of the process for clean fuel.",
    "Some crops are being engineered to photosynthesise more efficiently in hot climates.",
    "That work could raise yields where droughts are becoming more common each year.",
]
LONG = " ".join(SENT)


def test_long_paragraph_is_split_and_text_is_unchanged():
    assert len(LONG.split()) > LONG_PARAGRAPH_WORDS
    parts = split_long_paragraph({"type": "paragraph", "text": LONG})
    assert len(parts) >= 2
    assert " ".join(p["text"] for p in parts) == LONG
    assert all(p["type"] == "paragraph" for p in parts)
    for p in parts:  # every chunk ends at a sentence end
        assert p["text"].rstrip()[-1] in ".!?"


def test_abbreviations_do_not_split_sentences():
    spans = sentence_spans(LONG)
    texts = [LONG[s:e] for s, e in spans]
    assert texts == SENT


def test_short_paragraphs_and_notes_are_left_alone():
    short = {"type": "paragraph", "text": SENT[0]}
    assert split_long_paragraph(short) == [short]
    notes = {"type": "paragraph", "text": LONG, "role": "notes"}
    assert split_long_paragraph(notes) == [notes]


def test_marks_follow_their_chunk():
    word = "chloroplasts"
    i = LONG.index(word)
    j = LONG.index("Calvin cycle")
    marks = [
        {"start": utf16_len(LONG[:i]), "end": utf16_len(LONG[:i + len(word)]), "type": "bold"},
        {"start": utf16_len(LONG[:j]), "end": utf16_len(LONG[:j + 12]), "type": "italic"},
    ]
    parts = split_long_paragraph({"type": "paragraph", "text": LONG, "marks": marks})
    found = {}
    for p in parts:
        for m in p.get("marks", []):
            found[m["type"]] = p["text"][m["start"]:m["end"]]
    assert found == {"bold": "chloroplasts", "italic": "Calvin cycle"}


def test_inline_numbered_list_becomes_a_list():
    b = {"type": "paragraph", "text": "There are three stages: (1) light absorption by chlorophyll; (2) splitting of water; (3) building of sugars."}
    out = split_inline_list(b)
    assert out[0] == {"type": "paragraph", "text": "There are three stages:"}
    assert out[1] == {"type": "list", "ordered": True, "items": [
        "light absorption by chlorophyll", "splitting of water", "building of sugars."]}


def test_inline_bullets_become_a_list():
    b = {"type": "paragraph", "text": "Organelles • nucleus holds DNA • mitochondria release energy • ribosomes build proteins"}
    out = split_inline_list(b)
    assert out[1]["items"] == ["nucleus holds DNA", "mitochondria release energy", "ribosomes build proteins"]


def test_not_a_list_when_numbers_are_not_sequential_or_too_few():
    for t in ["Results (1) were fine and (3) were not.", "Values a) and b) only.", "See (2) and (3) and (4) here."]:
        b = {"type": "paragraph", "text": t}
        assert split_inline_list(b) == [b]


def test_build_doc_applies_the_pass_and_flags_few_headings():
    raw = [{"type": "paragraph", "text": LONG}] * 4
    doc = build_doc("T", [dict(r) for r in raw], "x.pdf")
    paras = [b for s in doc["sections"] for b in s["blocks"]]
    assert len(paras) > 4
    assert doc.get("structureHint") == "few-headings"
    raw2 = [{"type": "heading", "level": 2, "text": "A"}, {"type": "paragraph", "text": SENT[0]}]
    assert "structureHint" not in build_doc("T", raw2, "x.pdf")


def test_structure_hint_resets_at_headings():
    sec = lambda h, n: {"heading": h, "blocks": [{"type": "paragraph", "text": "word " * n}]}
    assert structure_hint([sec("A", 400), sec("B", 400)]) is None
    assert structure_hint([sec("A", 700)]) == "few-headings"


def test_readable_blocks_keeps_other_blocks():
    raw = [{"type": "heading", "level": 2, "text": "H"}, {"type": "table", "headers": [], "rows": []}]
    assert readable_blocks(raw) == raw
