from access.check import check_doc, score_issues


def _doc(**kw):
    base = {"id": "doc_x", "title": "T", "lang": "en", "sourceFile": "x.pdf", "createdAt": "", "sections": []}
    base.update(kw)
    return base


def _sec(sid, heading, level, blocks):
    return {"id": sid, "heading": heading, "level": level, "summary": None, "blocks": blocks}


def _rules(report):
    return [i["rule"] for i in report["issues"]]


def test_clean_doc_scores_100():
    doc = _doc(sections=[_sec("s1", "Intro", 2, [
        {"id": "b1", "type": "paragraph", "text": "Hello", "plain": None},
        {"id": "b2", "type": "image", "src": "data:", "alt": "A cell", "altStatus": "approved", "caption": None},
        {"id": "b3", "type": "image", "src": "data:", "alt": "", "altStatus": "decorative", "caption": None},
        {"id": "b4", "type": "table", "caption": None, "headers": ["a"], "rows": [["1"]]},
        {"id": "b5", "type": "math", "latex": None, "spoken": "x equals 1", "text": "x = 1"},
        {"id": "b6", "type": "heading", "text": "Sub", "level": 3},
        {"id": "b7", "type": "pageMarker", "n": 2},
    ])])
    assert check_doc(doc) == {"score": 100, "issues": []}


def test_every_rule_and_score():
    long_text = " ".join(["word"] * 1501)
    doc = _doc(title="  ", lang="", sections=[
        _sec("s1", "", 2, [
            {"id": "b1", "type": "image", "src": "data:", "alt": "", "altStatus": "missing", "caption": None},
            {"id": "b2", "type": "image", "src": "data:", "alt": "Cell", "altStatus": "ai", "caption": None},
        ]),
        _sec("s2", "Deep", 4, [
            {"id": "b3", "type": "table", "caption": None, "headers": [], "rows": [["1"]]},
            {"id": "b4", "type": "math", "latex": None, "spoken": "", "text": "x = 1"},
            {"id": "b5", "type": "heading", "text": "Deeper", "level": 6},
            {"id": "b6", "type": "paragraph", "text": long_text},
        ]),
    ])
    r = check_doc(doc)
    assert _rules(r) == [
        "doc-missing-title",
        "doc-missing-lang",
        "image-alt-missing",
        "image-alt-unreviewed",
        "heading-skip",
        "table-no-headers",
        "math-no-spoken",
        "heading-skip",
        "section-too-long",
    ]
    sev = {i["rule"]: i["severity"] for i in r["issues"]}
    assert sev == {
        "doc-missing-title": "serious",
        "doc-missing-lang": "serious",
        "image-alt-missing": "critical",
        "image-alt-unreviewed": "serious",
        "heading-skip": "moderate",
        "table-no-headers": "serious",
        "math-no-spoken": "moderate",
        "section-too-long": "minor",
    }
    # 1 critical, 4 serious, 3 moderate, 1 minor
    assert r["score"] == 100 - 15 - 4 * 8 - 3 * 4 - 1 == 40
    assert r["issues"][0]["blockId"] is None and r["issues"][0]["sectionId"] is None
    assert r["issues"][2]["blockId"] == "b1" and r["issues"][2]["sectionId"] == "s1"
    assert r["issues"][4]["sectionId"] == "s2" and r["issues"][4]["blockId"] is None
    assert r["issues"][7]["blockId"] == "b5"
    assert r["issues"][8]["sectionId"] == "s2" and r["issues"][8]["blockId"] is None


def test_empty_alt_with_ai_status_is_missing():
    doc = _doc(sections=[_sec("s1", "A", 2, [
        {"id": "b1", "type": "image", "src": "", "alt": " ", "altStatus": "ai", "caption": None},
    ])])
    assert _rules(check_doc(doc)) == ["image-alt-missing"]


def test_section_at_limit_is_fine():
    doc = _doc(sections=[_sec("s1", "A", 2, [
        {"id": "b1", "type": "paragraph", "text": " ".join(["w"] * 1499), "plain": None},
    ])])
    assert check_doc(doc)["issues"] == []  # 1499 + 1 heading word = 1500


def test_score_floor():
    assert score_issues([{"severity": "critical"}] * 10) == 0
