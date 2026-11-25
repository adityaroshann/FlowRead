"""Accessible PDF export (mounted at /api/export). See docs/v2/CONTRACT.md."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, ValidationError

from export.typst_render import ExportError, font_families, render_pdf_with_info, slug, typst_version

router = APIRouter()
log = logging.getLogger("flowread.export")

MAX_EXPORT_BYTES = 30 * 1024 * 1024


class _Loose(BaseModel):
    model_config = ConfigDict(extra="allow")


class SectionIn(_Loose):
    heading: str | None = ""
    level: int | None = 2
    summary: str | None = None
    blocks: list[dict] = []


class DocIn(_Loose):
    title: str | None = ""
    lang: str | None = "en"
    sections: list[SectionIn]


class ExportIn(_Loose):
    doc: DocIn
    settings: dict | None = None
    options: dict | None = None


@router.get("/health")
async def export_health():
    fonts = await asyncio.to_thread(font_families)
    return {"typst": typst_version(), "fonts": fonts}


@router.post("/pdf")
async def export_pdf(request: Request):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_EXPORT_BYTES:
        raise HTTPException(413, "The document is larger than the 30 MB export limit.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_EXPORT_BYTES:
            raise HTTPException(413, "The document is larger than the 30 MB export limit.")
    try:
        payload = json.loads(bytes(body) or b"null")
        req = ExportIn.model_validate(payload)
    except (json.JSONDecodeError, UnicodeDecodeError, ValidationError) as e:
        raise HTTPException(422, "The request is not a valid FlowRead document export.") from e
    doc = req.doc.model_dump()
    try:
        pdf, info = await asyncio.to_thread(render_pdf_with_info, doc, req.settings, req.options)
    except ExportError:
        raise HTTPException(500, "Could not build the PDF. Please try again or report this document.")
    except Exception:
        log.exception("PDF export failed")
        raise HTTPException(500, "Could not build the PDF. Please try again or report this document.")
    name = f"{slug(doc.get('title'))}-flowread.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
            # "ua-1" normally; "tagged" when characters no bundled font can draw forced the fallback.
            "X-FlowRead-PDF-Standard": info["standard"],
        },
    )
