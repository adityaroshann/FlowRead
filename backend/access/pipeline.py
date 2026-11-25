"""End-to-end conversion: bytes -> AccessDoc, with progress callbacks."""

from __future__ import annotations

import asyncio
import io
import threading
import zipfile
from typing import Callable

from . import ai
from .check import check_doc
from .common import build_doc

Emit = Callable[[dict], None]

DEFAULT_LANG = "en"
SUPPORTED_EXTENSIONS = ("pdf", "docx", "pptx")


def sniff_kind(data: bytes, filename: str) -> str | None:
    """'pdf', 'docx', 'pptx' or None (unsupported). Uses magic bytes and the zip directory."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if data[:5] == b"%PDF-" or (ext == "pdf" and b"%PDF-" in data[:1024]):
        return "pdf"
    if data[:2] != b"PK":
        return None
    try:
        names = set(zipfile.ZipFile(io.BytesIO(data)).namelist())
    except Exception:
        return None
    if "word/document.xml" in names:
        return "docx"
    if "ppt/presentation.xml" in names:
        return "pptx"
    return None


async def finish_document(
    title: str,
    raw: list[dict],
    lang: str,
    source_file: str,
    source: dict,
    describe_images: bool,
    progress: Callable[[str, str, int], None],
) -> dict:
    """AI enrichment, sections, report. Shared by every input kind."""
    n_images = sum(1 for b in raw if b["type"] == "image")
    progress("images", f"Found {n_images} image{'s' if n_images != 1 else ''}.", 50)
    stats = await ai.enrich_blocks(raw, describe_images=describe_images, progress=progress)
    if stats["images"] and ai.has_api_key() and describe_images:
        msg = f"Described {stats['described']} of {stats['images']} images"
        if stats["failed"]:
            msg += f" ({stats['failed']} need manual alt text)"
        progress("images", msg + ".", 85)

    progress("structure", "Building sections…", 88)
    doc = await asyncio.to_thread(build_doc, title, raw, source_file, lang or DEFAULT_LANG)
    doc["source"] = source

    progress("check", "Checking accessibility…", 95)
    doc["report"] = check_doc(doc)
    progress("check", f"Accessibility score: {doc['report']['score']}.", 100)
    return doc


async def convert_document(
    data: bytes, filename: str, describe_images: bool, emit: Emit, source_url: str | None = None
) -> dict:
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
    elif kind == "pptx":
        from .pptx import extract_pptx

        title, raw, lang = await asyncio.to_thread(extract_pptx, data, progress)
    else:
        raise ValueError("Unsupported file type. Upload a PDF, DOCX or PPTX file.")

    pages = max([b["n"] for b in raw if b["type"] == "pageMarker"] or [0]) or None
    source = {"kind": "url" if source_url else kind, "pages": pages, "url": source_url}
    return await finish_document(title, raw, lang, filename, source, describe_images, progress)
