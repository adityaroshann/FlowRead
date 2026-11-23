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
from access.pipeline import convert_document, sniff_kind

router = APIRouter()
log = logging.getLogger("flowread.access")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 60_000


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
    if ext not in ("pdf", "docx"):
        raise HTTPException(415, f"Unsupported file type '.{ext}'. Upload a PDF or DOCX file.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than the 25 MB limit.")
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    if sniff_kind(data, filename) is None:
        raise HTTPException(415, "The file content is not a valid PDF or DOCX.")
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
