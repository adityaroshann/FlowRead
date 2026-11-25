"""FlowRead Access API (mounted at /api/access). See docs/access/CONTRACT.md."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from access import ai
from access.check import check_doc
from access.pipeline import SUPPORTED_EXTENSIONS, convert_document, finish_document, sniff_kind

router = APIRouter()
log = logging.getLogger("flowread.access")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 60_000
MAX_PASTE_CHARS = 200_000


@router.get("/health")
async def access_health():
    return {"status": "ok", "ai": ai.has_api_key()}


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/convert")
async def convert(request: Request, file: UploadFile = File(...), describeImages: str = Form("true")):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES + 1024 * 1024:
        raise HTTPException(413, "File is larger than the 25 MB limit.")
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(415, f"Unsupported file type '.{ext}'. Upload a PDF, DOCX or PPTX file.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than the 25 MB limit.")
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    if sniff_kind(data, filename) is None:
        raise HTTPException(415, "The file content is not a valid PDF, DOCX or PPTX file.")
    describe = describeImages.strip().lower() not in ("false", "0", "no", "off")

    queue: asyncio.Queue = asyncio.Queue()

    async def run():
        try:
            doc = await convert_document(data, filename, describe, queue.put_nowait)
            queue.put_nowait({"type": "done", "doc": doc})
        except ValueError as e:
            queue.put_nowait({"type": "error", "message": str(e)})
        except Exception:
            log.exception("Conversion failed for %s", filename)
            queue.put_nowait({"type": "error", "message": "Could not convert this file. It may be damaged."})
        finally:
            queue.put_nowait(None)

    async def stream():
        task = asyncio.create_task(run())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield _sse(event)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


class TextRequest(BaseModel):
    text: str
    title: str | None = None


class UrlRequest(BaseModel):
    url: str


class DefineRequest(BaseModel):
    term: str
    context: str | None = None


def _noop_progress(*_a, **_k) -> None:
    pass


@router.post("/convert-text")
async def convert_text(req: TextRequest):
    from access.text import text_to_raw

    if not req.text or not req.text.strip():
        raise HTTPException(400, "text must not be empty.")
    if len(req.text) > MAX_PASTE_CHARS:
        raise HTTPException(413, f"text is longer than {MAX_PASTE_CHARS} characters.")
    title, raw = await asyncio.to_thread(text_to_raw, req.text, (req.title or "")[:300])
    source = {"kind": "text", "pages": None, "url": None}
    return await finish_document(title, raw, "en", "pasted-text", source, True, _noop_progress)


@router.post("/convert-url")
async def convert_url(req: UrlRequest):
    from access import web
    from access.fetch import FetchError, safe_fetch

    url = (req.url or "").strip()
    if not url or len(url) > 2048:
        raise HTTPException(400, "Enter a web address.")
    try:
        res = await safe_fetch(url)
    except FetchError as e:
        raise HTTPException(e.status, str(e))
    name = res.url.rstrip("/").rsplit("/", 1)[-1] or "page"
    if res.content_type == "application/pdf" or res.body[:5] == b"%PDF-":
        filename = name if name.lower().endswith(".pdf") else name + ".pdf"
        try:
            return await convert_document(res.body, filename, True, lambda e: None, source_url=res.url)
        except ValueError as e:
            raise HTTPException(422, str(e))
    if res.content_type and not (
        res.content_type in ("text/html", "application/xhtml+xml", "text/plain") or res.content_type.endswith("+xml")
    ):
        raise HTTPException(415, "That link is not a web page or a PDF.")
    html = res.body.decode(_charset(res.body), errors="replace")
    title, raw, lang = await asyncio.to_thread(web.html_to_raw, html, res.url)
    raw = await web.resolve_images(raw)
    if not any(b["type"] in ("paragraph", "list", "table", "heading") for b in raw):
        raise HTTPException(422, "Could not find readable article text on that page.")
    source = {"kind": "url", "pages": None, "url": res.url}
    return await finish_document(title, raw, lang or "en", res.url, source, True, _noop_progress)


def _charset(body: bytes) -> str:
    import re as _re

    m = _re.search(rb"<meta[^>]+charset=[\"']?([A-Za-z0-9_-]+)", body[:4096], _re.IGNORECASE)
    if m:
        cs = m.group(1).decode("ascii", "ignore")
        try:
            "".encode(cs)
            return cs
        except LookupError:
            pass
    return "utf-8"


@router.post("/define")
async def define(req: DefineRequest):
    _require_ai()
    term = (req.term or "").strip()
    if not term:
        raise HTTPException(400, "term must not be empty.")
    if len(term) > 200 or len(req.context or "") > 4000:
        raise HTTPException(413, "term or context is too long.")
    return {"definition": await _run_ai(ai.define_term(term, req.context or ""))}


class PlainRequest(BaseModel):
    text: str
    context: str | None = None


class SummaryRequest(BaseModel):
    heading: str = ""
    text: str


class DescribeRequest(BaseModel):
    src: str
    context: str | None = None


def _require_ai():
    if not ai.has_api_key():
        raise HTTPException(503, "AI features are unavailable: ANTHROPIC_API_KEY is not set on the server.")


def _require_text(text: str):
    if not text or not text.strip():
        raise HTTPException(400, "text must not be empty.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(413, f"text is longer than {MAX_TEXT_CHARS} characters.")


async def _run_ai(coro):
    try:
        return await coro
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except ai.AIError as e:
        raise HTTPException(502, str(e))


@router.post("/plain")
async def plain(req: PlainRequest):
    _require_ai()
    _require_text(req.text)
    return {"plain": await _run_ai(ai.plain_language(req.text, req.context or ""))}


@router.post("/summary")
async def summary(req: SummaryRequest):
    _require_ai()
    _require_text(req.text)
    return {"summary": await _run_ai(ai.summarize(req.heading, req.text))}


@router.post("/describe-image")
async def describe_image(req: DescribeRequest):
    _require_ai()
    try:
        ai.parse_data_url(req.src)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if len(req.src) > 20 * 1024 * 1024:
        raise HTTPException(413, "Image is too large.")
    return await _run_ai(ai.describe_image(req.src, req.context or ""))


@router.post("/check")
async def check(doc: dict):
    return check_doc(doc)
