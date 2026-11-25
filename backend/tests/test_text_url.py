"""/convert-text, /convert-url (SSRF guards with mocked DNS + HTTP) and /define."""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

import access.fetch as fetch
from access.fetch import FetchError, is_public_ip, safe_fetch
from access.text import text_to_raw
from fixtures import make_course_pdf, make_png


@pytest.fixture(scope="module")
def client():
    import main

    return TestClient(main.app)


# ---------------------------------------------------------------------------
# Pasted text
# ---------------------------------------------------------------------------

PASTE = """# Week 6: Plate Tectonics

The crust is broken into **plates** that move on the *mantle*. Read [the notes](https://example.org/n).
This line joins the paragraph above.

## Boundaries

- Divergent: plates move apart
- Convergent: plates collide
  - Subduction zones
1. Measure the gap
2. Record it

### Rates
Plates move a few centimetres a year.
"""


def test_text_to_raw_structure():
    title, raw = text_to_raw(PASTE)
    assert title == "Week 6: Plate Tectonics"
    assert [(b["text"], b["level"]) for b in raw if b["type"] == "heading"] == [("Boundaries", 2), ("Rates", 3)]
    p = raw[0]
    assert p["text"] == ("The crust is broken into plates that move on the mantle. Read the notes. "
                         "This line joins the paragraph above.")
    got = [(m["type"], p["text"][m["start"]:m["end"]], m.get("href")) for m in p["marks"]]
    assert got == [("bold", "plates", None), ("italic", "mantle", None), ("link", "the notes", "https://example.org/n")]
    lists = [(b["ordered"], b["items"]) for b in raw if b["type"] == "list"]
    assert lists == [
        (False, ["Divergent: plates move apart", "Convergent: plates collide"]),
        (False, ["Subduction zones"]),
        (True, ["Measure the gap", "Record it"]),
    ]


def test_text_unsafe_link_is_plain_text():
    _, raw = text_to_raw("Click [here](javascript:alert(1)) now.\n\nSecond paragraph.", title="T")
    assert raw[0]["text"].startswith("Click here")
    assert "marks" not in raw[0]


def test_convert_text_endpoint(client):
    r = client.post("/api/access/convert-text", json={"text": PASTE})
    assert r.status_code == 200
    doc = r.json()
    assert doc["title"] == "Week 6: Plate Tectonics"
    assert doc["source"] == {"kind": "text", "pages": None, "url": None}
    assert [s["heading"] for s in doc["sections"]] == ["", "Boundaries"]
    assert doc["report"]["score"] == 100


def test_convert_text_limits(client):
    assert client.post("/api/access/convert-text", json={"text": "   "}).status_code == 400
    assert client.post("/api/access/convert-text", json={"text": "a" * 200_001}).status_code == 413


# ---------------------------------------------------------------------------
# URL fetching and SSRF
# ---------------------------------------------------------------------------

ARTICLE = b"""<!doctype html><html lang="en-GB"><head><title>Volcanoes | Example Site</title></head>
<body><nav><a href="/">Home</a> Menu items</nav>
<article>
<h1>Volcanoes</h1>
<p>A volcano is an opening in the crust where <strong>magma</strong> reaches the surface.
See <a href="/more">more</a> and <a href="javascript:x()">bad</a>.</p>
<h2>Types</h2>
<ul><li>Shield volcanoes</li><li>Stratovolcanoes<ul><li>Explosive</li></ul></li></ul>
<figure><img src="/img/v.png" alt="Cross-section of a stratovolcano"><figcaption>Figure 1: Layers</figcaption></figure>
<img src="/img/divider.png" alt="">
<table><thead><tr><th>Volcano</th><th>Height (m)</th></tr></thead>
<tbody><tr><td>Etna</td><td>3357</td></tr><tr><td>Fuji</td><td>3776</td></tr></tbody></table>
<h3>Hazards</h3><p>Ash clouds can disrupt flights over large distances for many days.</p>
<div class="share-buttons"><p>Share this on social media</p></div>
</article><footer><p>All rights reserved by the example site, forever and ever.</p></footer></body></html>"""


class Web:
    """Mocked DNS + HTTP. ``routes`` maps (host, path) -> handler(request) -> httpx.Response."""

    def __init__(self, monkeypatch, dns: dict, routes: dict):
        self.requests = []

        async def resolve(host, port):
            if host not in dns:
                raise OSError("NXDOMAIN")
            return dns[host]

        def handler(request: httpx.Request):
            self.requests.append(request)
            key = (request.headers["host"].split(":")[0], request.url.path)
            if key not in routes:
                return httpx.Response(404)
            return routes[key](request)

        monkeypatch.setattr(fetch, "_resolve", resolve)
        monkeypatch.setattr(fetch, "_transport", httpx.MockTransport(handler))


def _html(body, ctype="text/html; charset=utf-8"):
    return lambda req: httpx.Response(200, content=body, headers={"content-type": ctype})


def test_is_public_ip():
    for bad in ("127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1",
                "100.64.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "240.0.0.1", "2002:7f00:1::"):
        assert not is_public_ip(bad), bad
    for good in ("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"):
        assert is_public_ip(good)


def test_convert_url_article(client, monkeypatch):
    web = Web(monkeypatch, {"news.example.org": ["93.184.216.34"]}, {
        ("news.example.org", "/a"): _html(ARTICLE),
        ("news.example.org", "/img/v.png"): lambda r: httpx.Response(200, content=make_png(),
                                                                       headers={"content-type": "image/png"}),
        ("news.example.org", "/img/divider.png"): lambda r: httpx.Response(200, content=make_png(200, 50)),
    })
    r = client.post("/api/access/convert-url", json={"url": "https://news.example.org/a"})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["title"] == "Volcanoes"
    assert doc["lang"] == "en-GB"
    assert doc["source"] == {"kind": "url", "pages": None, "url": "https://news.example.org/a"}
    blocks = [b for s in doc["sections"] for b in s["blocks"]]
    assert [s["heading"] for s in doc["sections"]] == ["", "Types"]
    para = blocks[0]
    assert para["text"].startswith("A volcano is an opening")
    links = [m for m in para["marks"] if m["type"] == "link"]
    assert [m["href"] for m in links] == ["https://news.example.org/more"]  # javascript: dropped
    lists = [b["items"] for b in blocks if b["type"] == "list"]
    assert lists == [["Shield volcanoes", "Stratovolcanoes"], ["Explosive"]]
    imgs = [b for b in blocks if b["type"] == "image"]
    assert imgs[0]["alt"] == "Cross-section of a stratovolcano" and imgs[0]["caption"] == "Figure 1: Layers"
    assert imgs[0]["src"].startswith("data:image/png;base64,")
    assert imgs[1]["altStatus"] == "decorative"
    table = next(b for b in blocks if b["type"] == "table")
    assert table["headers"] == ["Volcano", "Height (m)"] and table["rows"][1] == ["Fuji", "3776"]
    texts = " ".join(b.get("text", "") for b in blocks)
    assert "Share this" not in texts and "All rights reserved" not in texts and "Menu items" not in texts
    # Connections were pinned to the validated IP, with the original Host header.
    assert all(req.url.host == "93.184.216.34" for req in web.requests)
    assert web.requests[0].headers["host"] == "news.example.org"
    assert web.requests[0].extensions.get("sni_hostname") == "news.example.org"


def test_convert_url_pdf(client, monkeypatch):
    Web(monkeypatch, {"files.example.org": ["93.184.216.34"]}, {
        ("files.example.org", "/week3.pdf"): _html(make_course_pdf(), "application/pdf"),
    })
    r = client.post("/api/access/convert-url", json={"url": "http://files.example.org/week3.pdf"})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["title"] == "Week 3: Cell Biology"
    assert doc["source"]["kind"] == "url" and doc["source"]["pages"] == 3
    assert doc["source"]["url"] == "http://files.example.org/week3.pdf"


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",
    "http://localhost:8000/api",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.1.2.3/",
    "ftp://example.org/file",
    "file:///etc/passwd",
    "http://user:pw@example.org/",
    "http://internal.example.org/",  # resolves to a private address
    "http://mixed.example.org/",  # one public and one private answer
])
def test_convert_url_blocks_ssrf(client, monkeypatch, url):
    web = Web(monkeypatch, {"internal.example.org": ["10.0.0.7"],
                            "mixed.example.org": ["93.184.216.34", "192.168.0.10"]}, {})
    r = client.post("/api/access/convert-url", json={"url": url})
    assert r.status_code == 400, (url, r.status_code, r.text)
    assert web.requests == []  # nothing was ever requested


def test_redirect_to_private_ip_is_blocked(monkeypatch):
    web = Web(monkeypatch, {"a.example.org": ["93.184.216.34"], "evil.example.org": ["127.0.0.1"]}, {
        ("a.example.org", "/"): lambda r: httpx.Response(302, headers={"location": "http://evil.example.org/x"}),
    })
    with pytest.raises(FetchError) as e:
        asyncio.run(safe_fetch("http://a.example.org/"))
    assert e.value.status == 400
    assert len(web.requests) == 1  # the private hop was never contacted


def test_redirect_limit(monkeypatch):
    routes = {("r.example.org", f"/{i}"): (lambda i: lambda r: httpx.Response(301, headers={"location": f"/{i + 1}"}))(i)
              for i in range(10)}
    web = Web(monkeypatch, {"r.example.org": ["93.184.216.34"]}, routes)
    with pytest.raises(FetchError, match="redirects"):
        asyncio.run(safe_fetch("http://r.example.org/0"))
    assert len(web.requests) == 4  # the first request + 3 redirects


def test_redirects_followed_within_limit(monkeypatch):
    Web(monkeypatch, {"r.example.org": ["93.184.216.34"]}, {
        ("r.example.org", "/0"): lambda r: httpx.Response(301, headers={"location": "/1"}),
        ("r.example.org", "/1"): _html(b"<p>ok</p>"),
    })
    res = asyncio.run(safe_fetch("http://r.example.org/0"))
    assert res.url == "http://r.example.org/1" and res.body == b"<p>ok</p>"


def test_size_cap(monkeypatch):
    big = b"x" * (fetch.MAX_BYTES + 10)
    Web(monkeypatch, {"big.example.org": ["93.184.216.34"]}, {
        ("big.example.org", "/"): lambda r: httpx.Response(200, content=big),
    })
    with pytest.raises(FetchError) as e:
        asyncio.run(safe_fetch("http://big.example.org/"))
    assert e.value.status == 413


def test_timeout(monkeypatch):
    async def slow(host, port):
        await asyncio.sleep(5)
        return ["93.184.216.34"]

    monkeypatch.setattr(fetch, "_resolve", slow)
    with pytest.raises(FetchError) as e:
        asyncio.run(safe_fetch("http://slow.example.org/", timeout=0.05))
    assert e.value.status == 504


def test_non_html_rejected(client, monkeypatch):
    Web(monkeypatch, {"z.example.org": ["93.184.216.34"]}, {
        ("z.example.org", "/f.zip"): _html(b"PK\x03\x04", "application/zip"),
    })
    assert client.post("/api/access/convert-url", json={"url": "https://z.example.org/f.zip"}).status_code == 415


# ---------------------------------------------------------------------------
# Define
# ---------------------------------------------------------------------------


def test_define_503_without_key(client):
    r = client.post("/api/access/define", json={"term": "osmosis", "context": "Water moves by osmosis."})
    assert r.status_code == 503


def test_define(client, fake_ai):
    r = client.post("/api/access/define", json={"term": "osmosis", "context": "Water moves by osmosis."})
    assert r.status_code == 200
    assert r.json() == {"definition": "A short plain definition."}
    call = fake_ai.calls[-1]
    assert call["model"] == "claude-haiku-5-5" and "osmosis" in call["messages"][0]["content"]
    assert client.post("/api/access/define", json={"term": " "}).status_code == 400
