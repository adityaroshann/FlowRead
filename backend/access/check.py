"""Accessibility rules checker and score for an AccessDoc.

``packages/core/src/check.js`` mirrors this file exactly. Exact
definitions (so both sides agree):

Doc-level issues come first (blockId and sectionId are null), then issues in
document order: for each section, its section-heading issue, then its block
issues in block order, then its section-too-long issue (blockId null).

- doc-missing-title (serious): ``title`` missing or only whitespace.
- doc-missing-lang (serious): ``lang`` missing or only whitespace.
- image-alt-missing (critical): image block whose altStatus is "missing", or
  whose ``alt`` is empty/whitespace while altStatus is not "decorative".
- image-alt-unreviewed (serious): image block with altStatus "ai" and a
  non-empty alt (an image with empty alt only gets image-alt-missing).
- page-needs-ocr (serious): image block with origin "page" (a scanned page
  kept as a picture because OCR was unavailable). It replaces the alt-text
  rules for that block (no image-alt-missing / image-alt-unreviewed).
- table-no-headers (serious): table block whose ``headers`` is empty.
- math-no-spoken (moderate): math block whose ``spoken`` is empty/whitespace.
- heading-skip (moderate): walking headings in document order starting from
  the doc title (level 1), a heading whose level is more than one deeper than
  the previous heading. Section headings count (sectionId set, blockId null)
  unless the section heading is "" (untitled section, skipped). Heading
  blocks count too (blockId set).
- section-too-long (minor): more than 1500 words in a section. Words are
  whitespace-separated tokens of: the section heading, heading/paragraph text,
  list items, table caption + headers + cells, math text, image caption.

Score = max(0, 100 - 15*critical - 8*serious - 4*moderate - 1*minor).
"""

from __future__ import annotations

SECTION_WORD_LIMIT = 1500
WEIGHTS = {"critical": 15, "serious": 8, "moderate": 4, "minor": 1}


def _blank(v) -> bool:
    return not isinstance(v, str) or not v.strip()


def _words(s) -> int:
    return len(s.split()) if isinstance(s, str) else 0


def _block_words(b: dict) -> int:
    t = b.get("type")
    if t in ("heading", "paragraph"):
        return _words(b.get("text"))
    if t == "list":
        return sum(_words(i) for i in b.get("items") or [])
    if t == "table":
        n = _words(b.get("caption"))
        n += sum(_words(h) for h in b.get("headers") or [])
        n += sum(_words(c) for row in b.get("rows") or [] for c in row)
        return n
    if t == "math":
        return _words(b.get("text"))
    if t == "image":
        return _words(b.get("caption"))
    return 0


def _issue(rule, severity, message, block_id=None, section_id=None):
    return {"blockId": block_id, "sectionId": section_id, "rule": rule, "severity": severity, "message": message}


def check_doc(doc: dict) -> dict:
    issues: list[dict] = []

    if _blank(doc.get("title")):
        issues.append(_issue("doc-missing-title", "serious", "Document has no title."))
    if _blank(doc.get("lang")):
        issues.append(_issue("doc-missing-lang", "serious", "Document language is not set."))

    prev_level = 1
    for section in doc.get("sections") or []:
        sid = section.get("id")
        heading = section.get("heading") or ""
        if heading.strip():
            level = section.get("level") or 2
            if level > prev_level + 1:
                issues.append(
                    _issue(
                        "heading-skip",
                        "moderate",
                        f"Heading level jumps from h{prev_level} to h{level}.",
                        None,
                        sid,
                    )
                )
            prev_level = level

        words = _words(heading)
        for b in section.get("blocks") or []:
            bid = b.get("id")
            t = b.get("type")
            words += _block_words(b)
            if t == "heading":
                level = b.get("level") or 2
                if level > prev_level + 1:
                    issues.append(
                        _issue(
                            "heading-skip",
                            "moderate",
                            f"Heading level jumps from h{prev_level} to h{level}.",
                            bid,
                            sid,
                        )
                    )
                prev_level = level
            elif t == "image":
                status = b.get("altStatus")
                if b.get("origin") == "page":
                    # A scanned page kept as a picture (OCR unavailable). This one
                    # issue replaces the alt-text rules for that block.
                    issues.append(
                        _issue(
                            "page-needs-ocr",
                            "serious",
                            "This page is a scanned image and could not be converted to text.",
                            bid,
                            sid,
                        )
                    )
                elif status == "missing" or (status != "decorative" and _blank(b.get("alt"))):
                    issues.append(_issue("image-alt-missing", "critical", "Image has no text alternative.", bid, sid))
                elif status == "ai":
                    issues.append(
                        _issue(
                            "image-alt-unreviewed",
                            "serious",
                            "AI image description has not been reviewed by staff.",
                            bid,
                            sid,
                        )
                    )
            elif t == "table":
                if not b.get("headers"):
                    issues.append(_issue("table-no-headers", "serious", "Table has no header row.", bid, sid))
            elif t == "math":
                if _blank(b.get("spoken")):
                    issues.append(
                        _issue("math-no-spoken", "moderate", "Maths expression has no spoken description.", bid, sid)
                    )

        if words > SECTION_WORD_LIMIT:
            issues.append(
                _issue(
                    "section-too-long",
                    "minor",
                    f"Section is {words} words long. Consider splitting it (over {SECTION_WORD_LIMIT} words).",
                    None,
                    sid,
                )
            )

    return {"score": score_issues(issues), "issues": issues}


def score_issues(issues: list[dict]) -> int:
    total = sum(WEIGHTS.get(i.get("severity"), 0) for i in issues)
    return max(0, 100 - total)
