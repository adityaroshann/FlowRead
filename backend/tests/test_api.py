import json

import pytest
from fastapi.testclient import TestClient

from fixtures import make_course_docx, make_course_pdf, make_png


@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


def parse_sse(text: str) -> list[dict]:
    events = []
    for chunk in text.split("\n\n"):
        for line in chunk.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


def convert(client, data, name, mime, **form):
    r = client.post("/api/access/convert", files={"file": (name, data, mime)}, data=form)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream")
    return parse_sse(r.text)


def _blocks(doc, t):
    return [b for s in doc["sections"] for b in s["blocks"] if b["type"] == t]


def test_health(client):
    r = client.get("/api/access/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_convert_pdf_without_key(client, course_pdf):
    events = convert(client, course_pdf, "week3.pdf", "application/pdf")
    assert events[-1]["type"] == "done"
    progress = [e for e in events if e["type"] == "progress"]
    steps = [e["step"] for e in progress]
    for step in ("layout", "tables", "images", "structure", "check"):
        assert step in steps
    # Steps arrive in pipeline order and pct never decreases.
    order = ["layout", "tables", "images", "structure", "check"]
    first_seen = [steps.index(s) for s in order]
    assert first_seen == sorted(first_seen)
    pcts = [e["pct"] for e in progress]
    assert pcts == sorted(pcts) and all(0 <= p <= 100 for p in pcts)

    doc = events[-1]["doc"]
    assert doc["title"] == "Week 3: Cell Biology"
    assert doc["lang"] == "en"
    assert doc["sourceFile"] == "week3.pdf"
    assert doc["createdAt"].endswith("Z")
    img = _blocks(doc, "image")[0]
    assert img["alt"] == "" and img["altStatus"] == "missing"
    rules = [i["rule"] for i in doc["report"]["issues"]]
    assert rules == ["image-alt-missing"]
    assert doc["report"]["score"] == 85


def test_convert_pdf_with_mocked_ai(client, course_pdf, fake_ai):
    events = convert(client, course_pdf, "week3.pdf", "application/pdf")
    doc = events[-1]["doc"]
    img = _blocks(doc, "image")[0]
    assert img["altStatus"] == "ai"
    assert img["alt"] == "Diagram of an animal cell with a central nucleus."
    math = _blocks(doc, "math")[0]
    assert math["spoken"].startswith("spoken: Magnification")
    assert [i["rule"] for i in doc["report"]["issues"]] == ["image-alt-unreviewed"]
    assert doc["report"]["score"] == 92
    # The image call sends the image and its context to the vision model.
    img_calls = [c for c in fake_ai.calls if "alt text" in c["system"]]
    assert len(img_calls) == 1
    call = img_calls[0]
    assert call["model"] == "claude-opus-5-5"
    content = call["messages"][0]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["media_type"] == "image/png"
    assert "Cell structures" in content[1]["text"]
    assert call["output_config"]["format"]["type"] == "json_schema"


def test_convert_describe_images_false(client, course_pdf, fake_ai):
    events = convert(client, course_pdf, "week3.pdf", "application/pdf", describeImages="false")
    img = _blocks(events[-1]["doc"], "image")[0]
    assert img["altStatus"] == "missing"
    assert not [c for c in fake_ai.calls if "alt text" in c["system"]]


def test_convert_image_api_error_is_per_item(client, course_pdf, failing_ai):
    events = convert(client, course_pdf, "week3.pdf", "application/pdf")
    assert events[-1]["type"] == "done"
    doc = events[-1]["doc"]
    assert _blocks(doc, "image")[0]["altStatus"] == "missing"
    assert _blocks(doc, "math")[0]["spoken"].startswith("spoken:")  # other calls still worked
    assert any("manual alt text" in e.get("message", "") for e in events)


def test_convert_docx(client, course_docx):
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    events = convert(client, course_docx, "week4.docx", mime)
    doc = events[-1]["doc"]
    assert doc["title"] == "Week 4: Genetics"
    assert doc["lang"] == "en-US"
    assert [s["heading"] for s in doc["sections"]] == ["Introduction", "Punnett squares"]
    assert _blocks(doc, "table")[0]["headers"] == ["Genotype", "Phenotype"]


def test_convert_damaged_pdf_streams_error(client):
    events = convert(client, b"%PDF-1.7\nthis is not really a pdf", "bad.pdf", "application/pdf")
    assert events[-1]["type"] == "error"
    assert events[-1]["message"]


def test_convert_unsupported_type(client):
    r = client.post("/api/access/convert", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 415
    r = client.post("/api/access/convert", files={"file": ("fake.pdf", b"hello there", "application/pdf")})
    assert r.status_code == 415


def test_convert_too_large(client, monkeypatch):
    import routers.access as routes

    monkeypatch.setattr(routes, "MAX_UPLOAD_BYTES", 1000)
    r = client.post("/api/access/convert", files={"file": ("big.pdf", b"%PDF-" + b"0" * 5000, "application/pdf")})
    assert r.status_code == 413


def test_ai_endpoints_503_without_key(client):
    assert client.post("/api/access/plain", json={"text": "Hello."}).status_code == 503
    assert client.post("/api/access/summary", json={"heading": "H", "text": "Hello."}).status_code == 503
    r = client.post("/api/access/describe-image", json={"src": "data:image/png;base64,AAAA"})
    assert r.status_code == 503
    assert "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_plain_endpoint(client, fake_ai):
    r = client.post("/api/access/plain", json={"text": "Mitochondria synthesise ATP.", "context": "Cells"})
    assert r.status_code == 200
    assert r.json() == {"plain": "PLAIN: Mitochondria synthesise ATP."}
    assert fake_ai.calls[-1]["model"] == "claude-haiku-5-5"
    assert "Cells" in fake_ai.calls[-1]["messages"][0]["content"]


def test_summary_endpoint(client, fake_ai):
    r = client.post("/api/access/summary", json={"heading": "Cells", "text": "Cells are small."})
    assert r.status_code == 200
    assert r.json()["summary"].startswith("This section")
    assert fake_ai.calls[-1]["model"] == "claude-haiku-5-5"


def test_describe_image_endpoint(client, fake_ai):
    import base64

    src = "data:image/png;base64," + base64.b64encode(make_png()).decode()
    r = client.post("/api/access/describe-image", json={"src": src, "context": "A cell"})
    assert r.status_code == 200
    assert r.json() == {"alt": "Diagram of an animal cell with a central nucleus.", "decorative": False}
    assert client.post("/api/access/describe-image", json={"src": "https://x/y.png"}).status_code == 400


def test_plain_rejects_empty(client, fake_ai):
    assert client.post("/api/access/plain", json={"text": "  "}).status_code == 400


def test_check_endpoint(client):
    doc = {
        "id": "doc_1", "title": "T", "lang": "en", "sourceFile": "x.pdf", "createdAt": "",
        "sections": [{"id": "s1", "heading": "A", "level": 2, "summary": None, "blocks": [
            {"id": "b1", "type": "table", "caption": None, "headers": [], "rows": [["1"]]}]}],
    }
    r = client.post("/api/access/check", json=doc)
    assert r.status_code == 200
    assert r.json() == {
        "score": 92,
        "issues": [{"blockId": "b1", "sectionId": "s1", "rule": "table-no-headers", "severity": "serious",
                    "message": "Table has no header row."}],
    }


def test_sse_without_image():
    # Sanity: a doc with no images and no key has a perfect score.
    from access.check import check_doc
    from access.common import build_doc
    from access.pdf import extract_pdf

    title, raw, _ = extract_pdf(make_course_pdf(with_image=False))
    doc = build_doc(title, raw, "x.pdf", "en")
    assert check_doc(doc)["score"] == 100


def test_docx_fixture_roundtrip_types():
    assert make_course_docx()[:2] == b"PK"
