"""End-to-end conversion: bytes -> AccessDoc, with progress callbacks."""

from __future__ import annotations

import asyncio
import threading
from typing import Callable

from . import ai
from .check import check_doc
from .common import build_doc

Emit = Callable[[dict], None]

DEFAULT_LANG = "en"


def sniff_kind(data: bytes, filename: str) -> str | None:
    """'pdf', 'docx' or None (unsupported). Uses magic bytes, then extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if data[:5] == b"%PDF-" or (ext == "pdf" and b"%PDF-" in data[:1024]):
        return "pdf"
    if data[:2] == b"PK" and ext in ("docx", ""):
        return "docx"
    if data[:2] == b"PK" and b"word/" in data[:4096]:
        return "docx"
    return None


async def convert_document(data: bytes, filename: str, describe_images: bool, emit: Emit) -> dict:
    loop = asyncio.get_running_loop()
    loop_thread = threading.get_ident()

    def progress(step: str, message: str, pct: int) -> None:
        event = {"type": "progress", "step": step, "message": message, "pct": max(0, min(100, int(pct)))}
        if threading.get_ident() == loop_thread:
            emit(event)
        else:  # called from the extraction worker thread
            loop.call_soon_threadsafe(emit, event)

    kind = sniff_kind(data, filename)
    progress("layout", "Reading page layout…", 1)
    if kind == "pdf":
        from .pdf import extract_pdf

        title, raw, lang = await asyncio.to_thread(extract_pdf, data, progress)
    elif kind == "docx":
        from .docx import extract_docx

        title, raw, lang = await asyncio.to_thread(extract_docx, data, progress)
    else:
        raise ValueError("Unsupported file type. Upload a PDF or DOCX file.")

    n_images = sum(1 for b in raw if b["type"] == "image")
    progress("images", f"Found {n_images} image{'s' if n_images != 1 else ''}.", 50)
    stats = await ai.enrich_blocks(raw, describe_images=describe_images, progress=progress)
    if stats["images"] and ai.has_api_key() and describe_images:
        msg = f"Described {stats['described']} of {stats['images']} images"
        if stats["failed"]:
            msg += f" ({stats['failed']} need manual alt text)"
        progress("images", msg + ".", 85)

    progress("structure", "Building sections…", 88)
    doc = await asyncio.to_thread(build_doc, title, raw, filename, lang or DEFAULT_LANG)

    progress("check", "Checking accessibility…", 95)
    doc["report"] = check_doc(doc)
    progress("check", f"Accessibility score: {doc['report']['score']}.", 100)
    return doc
