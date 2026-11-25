import json
import os
import sys
from types import SimpleNamespace

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS = os.path.dirname(os.path.abspath(__file__))
for p in (BACKEND, TESTS):
    if p not in sys.path:
        sys.path.insert(0, p)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """No real API calls in tests: start every test without a key."""
    import access.ai as ai

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(ai, "_client", None)

    def _no_client():
        raise ai.AIUnavailable("ANTHROPIC_API_KEY is not set on the server.")

    monkeypatch.setattr(ai, "get_client", _no_client)
    yield


class FakeMessages:
    def __init__(self, recorder, fail_images=False):
        self.calls = recorder
        self.fail_images = fail_images

    async def create(self, **kwargs):
        import anthropic

        self.calls.append(kwargs)
        system = kwargs.get("system", "")
        content = kwargs["messages"][0]["content"]
        if "scanned page" in system:
            text = json.dumps({"blocks": [
                {"type": "heading", "text": "Scanned heading", "level": 9, "ordered": False, "items": [],
                 "headers": [], "rows": [], "latex": "", "spoken": ""},
                {"type": "paragraph", "text": "Text read\x00 from the  scan.", "level": 0, "ordered": False,
                 "items": [], "headers": [], "rows": [], "latex": "", "spoken": ""},
                {"type": "list", "text": "", "level": 0, "ordered": "yes", "items": ["one", "", 2],
                 "headers": [], "rows": [], "latex": "", "spoken": ""},
                {"type": "table", "text": "", "level": 0, "ordered": False, "items": [],
                 "headers": ["A", "B"], "rows": [["1"], ["2", "3", "4"]], "latex": "", "spoken": ""},
                {"type": "math", "text": "x^2", "level": 0, "ordered": False, "items": [], "headers": [],
                 "rows": [], "latex": "x^{2}", "spoken": "x squared"},
                {"type": "script", "text": "<script>", "level": 0, "ordered": False, "items": [],
                 "headers": [], "rows": [], "latex": "", "spoken": ""},
            ]})
        elif "mathematics on one page" in system:
            n = content[1]["text"].count("\n")
            text = json.dumps({"items": [
                {"index": i, "latex": f"\\alpha_{i}", "spoken": f"vision reading {i}"} for i in range(1, n + 1)
            ] + [{"index": 99, "latex": "bad", "spoken": "out of range"}]})
        elif "define a word" in system:
            text = "A short plain definition."
        elif "alt text" in system:
            if self.fail_images:
                raise anthropic.APIConnectionError(request=None)
            text = json.dumps({"alt": "Diagram of an animal cell with a central nucleus.", "decorative": False})
        elif "maths expression" in system:
            text = "spoken: " + content.replace("Expression: ", "")
        elif "plain language" in system:
            passage = content.split("<passage>")[1].split("</passage>")[0].strip()
            # Echo the heading first, like a real model sometimes does; ai.py strips it.
            echoed = "Cells\n" if "<section_heading>Cells" in content else ""
            text = echoed + "PLAIN: " + passage
        elif "summarise" in system:
            text = "This section is a summary. It has two sentences."
        else:
            text = "?"
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


class FakeClient:
    def __init__(self, fail_images=False):
        self.calls = []
        self.messages = FakeMessages(self.calls, fail_images)
        self.beta = SimpleNamespace(messages=self.messages)


@pytest.fixture
def fake_ai(monkeypatch):
    """Pretend a key is set and route all Claude calls to FakeClient."""
    import access.ai as ai

    client = FakeClient()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")
    monkeypatch.setattr(ai, "get_client", lambda: client)
    return client


@pytest.fixture
def failing_ai(monkeypatch):
    import access.ai as ai

    client = FakeClient(fail_images=True)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")
    monkeypatch.setattr(ai, "get_client", lambda: client)
    return client


@pytest.fixture(scope="session")
def course_pdf():
    from fixtures import make_course_pdf

    return make_course_pdf()


@pytest.fixture(scope="session")
def course_docx():
    from fixtures import make_course_docx

    return make_course_docx()
