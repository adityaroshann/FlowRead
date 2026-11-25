"""Readability pass: make converted documents easier to read without changing a word.

Runs on raw blocks before they are grouped into sections (``common.build_doc``).

- Long paragraphs (over ``LONG_PARAGRAPH_WORDS``) are split at sentence ends
  into chunks of about ``CHUNK_TARGET_WORDS`` words. Joining the chunks with a
  single space gives back the original text exactly.
- Inline enumerations, "(1) … (2) … (3) …" or "a) … b) … c) …" or
  "• … • … • …" run together in one paragraph, become a lead-in paragraph plus
  a list. Only the markers themselves are dropped (the list renders its own).
- ``structure_hint`` flags documents with long stretches of text and no
  headings, so the reader can offer the AI "Add headings" assist.

Deterministic, no AI. Paragraph marks (UTF-16 offsets) are carried into the
chunk they fall in; a mark that crosses a split is clipped at the split.
"""

from __future__ import annotations

import re

from .common import utf16_len

LONG_PARAGRAPH_WORDS = 110
CHUNK_TARGET_WORDS = 70
CHUNK_MAX_SENTENCES = 4
FEW_HEADINGS_WORDS = 600

# A sentence ends with . ! or ? (optionally followed by closing quotes or
# brackets), then whitespace, then something that starts a sentence.
_SENTENCE_END = re.compile(r"(?<=[.!?])([\"'”’)\]]*)\s+(?=[\"'“‘(\[]?[A-Z0-9])")
# Words before a full stop that do not end a sentence.
_ABBREV = re.compile(
    r"(?:\b(?:e\.g|i\.e|etc|vs|cf|al|approx|Fig|fig|Figs|Eq|eq|No|no|Vol|vol|pp|p|ch|Ch|Sec|sec|"
    r"Dr|Mr|Mrs|Ms|Prof|St|Jr|Sr|Inc|Ltd|Co|U\.S|U\.K|a\.m|p\.m)|\b[A-Z])\.$"
)

_WORDS = re.compile(r"\S+")


def _word_count(s: str) -> int:
    return len(_WORDS.findall(s))


def sentence_spans(text: str) -> list[tuple[int, int]]:
    """Code-point spans of sentences; the whitespace between them is excluded."""
    spans = []
    start = 0
    for m in _SENTENCE_END.finditer(text):
        end = m.start(1) + len(m.group(1))  # include closing quotes/brackets
        if _ABBREV.search(text[start:m.start(1)]):
            continue
        spans.append((start, end))
        start = m.end()
    if start < len(text):
        spans.append((start, len(text)))
    return [(s, e) for s, e in spans if text[s:e].strip()]


def _chunk_spans(text: str) -> list[tuple[int, int]]:
    sents = sentence_spans(text)
    if len(sents) < 2:
        return [(0, len(text))]
    chunks: list[tuple[int, int]] = []
    cur_start, cur_end, words, count = sents[0][0], sents[0][1], _word_count(text[sents[0][0]:sents[0][1]]), 1
    for s, e in sents[1:]:
        w = _word_count(text[s:e])
        if words >= CHUNK_TARGET_WORDS or count >= CHUNK_MAX_SENTENCES or (words + w > CHUNK_TARGET_WORDS * 1.5 and words >= 30):
            chunks.append((cur_start, cur_end))
            cur_start, cur_end, words, count = s, e, w, 1
        else:
            cur_end, words, count = e, words + w, count + 1
    chunks.append((cur_start, cur_end))
    # Never leave a tiny last chunk on its own.
    if len(chunks) > 1 and _word_count(text[chunks[-1][0]:chunks[-1][1]]) < 15:
        last = chunks.pop()
        chunks[-1] = (chunks[-1][0], last[1])
    return chunks


def _slice_marks(text: str, marks: list[dict] | None, start: int, end: int) -> list[dict]:
    """Marks (UTF-16 offsets into text) for text[start:end] (code points), re-based."""
    if not marks:
        return []
    s16, e16 = utf16_len(text[:start]), utf16_len(text[:end])
    out = []
    for m in marks:
        a, b = max(m["start"], s16), min(m["end"], e16)
        if a < b:
            nm = dict(m)
            nm["start"], nm["end"] = a - s16, b - s16
            out.append(nm)
    return out


def split_long_paragraph(block: dict) -> list[dict]:
    text = block.get("text") or ""
    if block.get("role") or _word_count(text) <= LONG_PARAGRAPH_WORDS:
        return [block]
    spans = _chunk_spans(text)
    if len(spans) < 2:
        return [block]
    out = []
    for s, e in spans:
        nb = {k: v for k, v in block.items() if k not in ("text", "marks")}
        nb["text"] = text[s:e]
        ms = _slice_marks(text, block.get("marks"), s, e)
        if ms:
            nb["marks"] = ms
        out.append(nb)
    return out


# "(1) ... (2) ..." / "1) ... 2) ..." / "(a) ... (b) ..." / "a) ... b) ..."
_ENUM_MARK = re.compile(r"(?:(?<=\s)|^)\(?(\d{1,2}|[a-h])\)\s+")
_INLINE_BULLET = re.compile(r"\s+[•●▪]\s+")


def _sequential(labels: list[str]) -> bool:
    if all(l.isdigit() for l in labels):
        return [int(l) for l in labels] == list(range(int(labels[0]), int(labels[0]) + len(labels))) and int(labels[0]) == 1
    if all(len(l) == 1 and l.isalpha() for l in labels):
        return [ord(l) for l in labels] == list(range(ord("a"), ord("a") + len(labels)))
    return False


def split_inline_list(block: dict) -> list[dict]:
    """Lead-in paragraph + list, or the block unchanged."""
    text = block.get("text") or ""
    if block.get("role") or block.get("marks"):
        return [block]

    ms = list(_ENUM_MARK.finditer(text))
    if len(ms) >= 3 and _sequential([m.group(1) for m in ms]):
        items = []
        for i, m in enumerate(ms):
            end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
            items.append(text[m.end():end].strip().rstrip(";,").strip())
        lead = text[: ms[0].start()].strip()
        if all(_word_count(it) >= 2 for it in items) and _word_count(lead) <= 40:
            out = []
            if lead:
                out.append({**{k: v for k, v in block.items() if k != "text"}, "text": lead})
            out.append({"type": "list", "ordered": True, "items": items})
            return out

    parts = _INLINE_BULLET.split(text)
    if len(parts) >= 4:  # lead-in + 3 items, or 4+ items
        lead, items = parts[0].strip(), [p.strip() for p in parts[1:] if p.strip()]
        if len(items) >= 3 and all(_word_count(it) >= 1 for it in items) and _word_count(lead) <= 40:
            out = []
            if lead and lead not in ("•", "●", "▪"):
                out.append({**{k: v for k, v in block.items() if k != "text"}, "text": lead})
            out.append({"type": "list", "ordered": False, "items": items})
            return out
    return [block]


def readable_blocks(raw_blocks: list[dict]) -> list[dict]:
    out: list[dict] = []
    for b in raw_blocks:
        if b.get("type") != "paragraph":
            out.append(b)
            continue
        for piece in split_inline_list(b):
            if piece.get("type") == "paragraph":
                out.extend(split_long_paragraph(piece))
            else:
                out.append(piece)
    return out


def structure_hint(sections: list[dict]) -> str | None:
    """'few-headings' when some stretch of text runs over FEW_HEADINGS_WORDS with no heading."""
    run = 0
    for s in sections:
        if s.get("heading"):
            run = 0
        for b in s.get("blocks", []):
            t = b.get("type")
            if t == "heading":
                run = 0
            elif t == "paragraph":
                run += _word_count(b.get("text") or "")
            elif t == "list":
                run += sum(_word_count(i) for i in b.get("items") or [])
            if run > FEW_HEADINGS_WORDS:
                return "few-headings"
    return None
