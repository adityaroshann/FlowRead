"""Claude helpers: image descriptions, spoken maths, plain language, summaries.

Models
- VISION_MODEL (claude-opus-5-5): image alt text and spoken maths. Accuracy
  matters most here, so it uses the capable model at low effort.
- FAST_MODEL (claude-haiku-5-5): plain-language rewrites, section summaries
  and word definitions.
- Scanned pages (page_to_blocks) and maths-heavy pages (math_from_image)
  also use VISION_MODEL, which accepts images.

Without ANTHROPIC_API_KEY every helper raises ``AIUnavailable``; the
conversion pipeline catches that and leaves images with altStatus "missing".
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Callable

VISION_MODEL = "claude-opus-5-5"
FAST_MODEL = "claude-haiku-5-5"
IMAGE_CONCURRENCY = 4
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AIUnavailable(Exception):
    """No API key configured."""


class AIError(Exception):
    """The API call failed or returned something unusable."""


def has_api_key() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


_client = None


def get_client():
    """Lazily build the async client (tests replace this function)."""
    global _client
    if not has_api_key():
        raise AIUnavailable("ANTHROPIC_API_KEY is not set on the server.")
    if _client is None:
        import anthropic

        _client = anthropic.AsyncAnthropic(timeout=90.0, max_retries=2)
    return _client


def _text_of(resp) -> str:
    return "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text").strip()


async def _call(
    model: str,
    system: str,
    content,
    *,
    max_tokens: int,
    effort: str = "low",
    schema: dict | None = None,
    fallback: bool = False,
) -> str:
    import anthropic

    client = get_client()
    output_config: dict = {"effort": effort}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    kwargs = dict(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": content}],
        output_config=output_config,
    )
    try:
        if fallback:
            # Server-side refusal fallback (routes a policy decline to another model).
            try:
                resp = await client.beta.messages.create(
                    **kwargs, betas=[_FALLBACK_BETA], extra_body={"fallbacks": "default"}
                )
            except anthropic.BadRequestError:
                resp = await client.messages.create(**kwargs)
        else:
            resp = await client.messages.create(**kwargs)
    except anthropic.AuthenticationError as e:
        raise AIError("The Anthropic API key was rejected.") from e
    except anthropic.RateLimitError as e:
        raise AIError("Rate limited by the Anthropic API. Try again shortly.") from e
    except anthropic.APIStatusError as e:
        raise AIError(f"Anthropic API error ({e.status_code}).") from e
    except anthropic.APIConnectionError as e:
        raise AIError("Could not reach the Anthropic API.") from e

    if resp.stop_reason == "refusal":
        raise AIError("The model declined this request.")
    if resp.stop_reason == "max_tokens":
        raise AIError("The model response was cut off.")
    text = _text_of(resp)
    if not text:
        raise AIError("The model returned an empty response.")
    return text


# ---------------------------------------------------------------------------
# Image descriptions
# ---------------------------------------------------------------------------

_DATA_URL_RE = re.compile(r"^data:(image/(?:png|jpeg|jpg|gif|webp));base64,(.+)$", re.DOTALL)

ALT_SYSTEM = """You write alt text for images in university course materials, for students who use screen readers.

Write what a student needs from the image to learn the material, not a visual inventory:
- Diagrams: name the parts and the relationships or process shown.
- Charts and graphs: chart type, what the axes measure, and the key trend or values.
- Photos: the subject and the detail that matters for the lesson.
- Text inside the image: include it if it carries meaning.
Use the surrounding text to judge what matters, but describe only what is in the image. Don't repeat the caption word for word.
Keep it to one to three sentences (under about 60 words). Don't start with "Image of" or "Picture of". Plain text, no markdown.

Set decorative to true only if the image adds no information (a border, background texture, stock flourish or logo with no teaching purpose). Then alt is an empty string."""

ALT_SCHEMA = {
    "type": "object",
    "properties": {"alt": {"type": "string"}, "decorative": {"type": "boolean"}},
    "required": ["alt", "decorative"],
    "additionalProperties": False,
}


def parse_data_url(src: str) -> tuple[str, str]:
    m = _DATA_URL_RE.match(src or "")
    if not m:
        raise ValueError("src must be a base64 data URL (png or jpeg).")
    media = m.group(1).replace("image/jpg", "image/jpeg")
    return media, m.group(2).strip()


async def describe_image(src: str, context: str = "") -> dict:
    media, b64 = parse_data_url(src)
    prompt = "Write the alt text for this image."
    if context.strip():
        prompt += f"\n\nSurrounding text from the document:\n<context>\n{context.strip()[:1500]}\n</context>"
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
        {"type": "text", "text": prompt},
    ]
    text = await _call(VISION_MODEL, ALT_SYSTEM, content, max_tokens=4000, schema=ALT_SCHEMA, fallback=True)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError("Image description was not valid JSON.") from e
    decorative = bool(data.get("decorative"))
    alt = "" if decorative else str(data.get("alt", "")).strip()
    if not decorative and not alt:
        raise AIError("Image description was empty.")
    return {"alt": alt, "decorative": decorative}


# ---------------------------------------------------------------------------
# Maths
# ---------------------------------------------------------------------------

MATH_SYSTEM = """You turn a maths expression extracted from a PDF into the words a screen reader should say.
Read it the way a teacher would say it aloud, unambiguously (say where groupings start and end when it matters).
The extraction may have lost superscripts or subscripts; read the most likely intended expression.
Reply with the spoken reading only: one plain-text sentence or phrase, no markdown, no preamble."""


async def speak_math(text: str) -> str:
    return await _call(VISION_MODEL, MATH_SYSTEM, f"Expression: {text}", max_tokens=2000, fallback=True)


# ---------------------------------------------------------------------------
# Plain language and summaries
# ---------------------------------------------------------------------------

PLAIN_SYSTEM = """You rewrite passages from university course materials in plain language, for students who benefit from simpler text.

Rules:
- Aim for a grade 6 to 8 reading level: short sentences, common words, active voice.
- Keep every fact, number, name, date and condition from the original. Keep key technical terms; you may explain a term only with words already implied by the passage.
- Add no new information, examples, opinions or advice.
- Keep roughly the same order. Don't summarise or drop details.
The section heading, if given, is context only: don't repeat it in your reply.
Reply with the rewritten passage only: plain text, no markdown, no heading, no preamble."""

SUMMARY_SYSTEM = """You summarise one section of university course material for a student.
Write 2 to 3 plain sentences that say what the section covers and its main points.
Use only information in the section. Plain text, no markdown, no preamble."""


async def plain_language(text: str, context: str = "") -> str:
    msg = f"<passage>\n{text.strip()}\n</passage>"
    heading = context.strip()
    if heading:
        msg = f"<section_heading>{heading}</section_heading>\n\n" + msg
    out = await _call(FAST_MODEL, PLAIN_SYSTEM, msg, max_tokens=8000)
    # Guard against the heading being echoed back as a first line.
    first, _, rest = out.partition("\n")
    if heading and rest.strip() and first.strip().rstrip(":").lower() == heading.lower():
        out = rest.strip()
    return out


async def summarize(heading: str, text: str) -> str:
    msg = f"Section heading: {heading.strip() or '(untitled)'}\n\n<section>\n{text.strip()}\n</section>"
    return await _call(FAST_MODEL, SUMMARY_SYSTEM, msg, max_tokens=2000)


# ---------------------------------------------------------------------------
# Definitions
# ---------------------------------------------------------------------------

DEFINE_SYSTEM = """You define a word or phrase for a student who met it while reading course material.
Give one or two short, plain sentences that explain what the term means as it is used in the given sentence.
Use common words. Don't start by repeating the term, don't add examples unless they are needed, and don't give advice.
Reply with the definition only: plain text, no markdown, no preamble."""


async def define_term(term: str, context: str = "") -> str:
    msg = f"Term: {term.strip()}"
    if context.strip():
        msg += f"\n\n<sentence>\n{context.strip()[:1500]}\n</sentence>"
    return await _call(FAST_MODEL, DEFINE_SYSTEM, msg, max_tokens=1000)


# ---------------------------------------------------------------------------
# Vision: scanned pages and maths-heavy pages
# ---------------------------------------------------------------------------

OCR_SYSTEM = """You transcribe one scanned page of study material into structured blocks so it can be read with assistive technology.

Transcribe the text exactly as printed, in reading order (columns top to bottom, left column first). Don't summarise, translate, correct or add anything.
Block types:
- heading: a title or heading; level 2 for main headings, 3 or 4 for sub-headings.
- paragraph: running text. Join lines that wrap; repair words hyphenated across lines.
- list: bulleted or numbered items (ordered true for numbers or letters). Leave the markers out of items.
- table: headers is the header row (empty if there is none); rows are the remaining rows as cell text.
- math: a displayed formula. text is the formula as printed, latex is LaTeX for it, spoken is how a teacher would read it aloud.
Skip running headers, footers, page numbers and purely decorative marks. For a picture or diagram, add a paragraph that starts with "Figure:" and briefly describes it.
Fill every field; use an empty string, an empty array, false or 0 for fields that don't apply to a block type. If the page has no readable text, return no blocks."""

_STR = {"type": "string"}
OCR_SCHEMA = {
    "type": "object",
    "properties": {
        "blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["heading", "paragraph", "list", "table", "math"]},
                    "text": _STR,
                    "level": {"type": "integer"},
                    "ordered": {"type": "boolean"},
                    "items": {"type": "array", "items": _STR},
                    "headers": {"type": "array", "items": _STR},
                    "rows": {"type": "array", "items": {"type": "array", "items": _STR}},
                    "latex": _STR,
                    "spoken": _STR,
                },
                "required": ["type", "text", "level", "ordered", "items", "headers", "rows", "latex", "spoken"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["blocks"],
    "additionalProperties": False,
}

MATH_VISION_SYSTEM = """You read the mathematics on one page of study material from its image.
You are given a numbered list of formulas that were extracted from the page as plain text; extraction often loses superscripts, subscripts, fractions and symbols.
For each numbered formula, find it in the image and return:
- latex: correct LaTeX for the formula as printed (no surrounding dollar signs).
- spoken: how a teacher would read it aloud, unambiguously, in plain English.
Return one entry per formula, using its number as index. Skip a number only if you cannot find that formula."""

MATH_VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"index": {"type": "integer"}, "latex": _STR, "spoken": _STR},
                "required": ["index", "latex", "spoken"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}

MAX_OCR_BLOCKS = 200
MAX_FIELD = 5000
_CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\ud800-\udfff]")


def _s(v, limit: int = MAX_FIELD) -> str:
    """Coerce to a clean string with no control characters and collapsed whitespace."""
    if v is None:
        return ""
    if not isinstance(v, str):
        v = str(v)
    v = _CTRL_RE.sub(" ", v)
    return re.sub(r"\s+", " ", v).strip()[:limit]


def sanitize_ocr_blocks(data) -> list[dict]:
    """Validate the model's blocks against the AccessDoc schema. Ids are assigned later by build_doc."""
    from .common import spoken_fallback

    if not isinstance(data, dict) or not isinstance(data.get("blocks"), list):
        raise AIError("Page transcription had no blocks.")
    out: list[dict] = []
    for b in data["blocks"][:MAX_OCR_BLOCKS]:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "heading":
            text = _s(b.get("text"), 300)
            if text:
                try:
                    level = int(b.get("level") or 2)
                except (TypeError, ValueError):
                    level = 2
                out.append({"type": "heading", "text": text, "level": max(2, min(4, level))})
        elif t == "paragraph":
            text = _s(b.get("text"))
            if text:
                out.append({"type": "paragraph", "text": text})
        elif t == "list":
            raw_items = b.get("items") if isinstance(b.get("items"), list) else []
            items = [x for x in (_s(i, 2000) for i in raw_items[:100]) if x]
            if items:
                out.append({"type": "list", "ordered": b.get("ordered") is True, "items": items})
        elif t == "table":
            raw_rows = b.get("rows") if isinstance(b.get("rows"), list) else []
            rows = [[_s(c, 1000) for c in r[:30]] for r in raw_rows[:300] if isinstance(r, list)]
            rows = [r for r in rows if any(r)]
            raw_h = b.get("headers") if isinstance(b.get("headers"), list) else []
            headers = [_s(h, 300) for h in raw_h[:30]]
            if not any(headers):
                headers = []
            if not rows and headers:
                rows, headers = [headers], []
            if not rows:
                continue
            width = max([len(r) for r in rows] + [len(headers)])
            rows = [r + [""] * (width - len(r)) for r in rows]
            if headers:
                headers = headers + [""] * (width - len(headers))
            out.append({"type": "table", "caption": None, "headers": headers, "rows": rows})
        elif t == "math":
            text = _s(b.get("text"), 2000)
            latex = _s(b.get("latex"), 2000) or None
            spoken = _s(b.get("spoken"), 2000)
            if not text and latex:
                text = latex
            if text:
                out.append({"type": "math", "latex": latex, "spoken": spoken or spoken_fallback(text), "text": text})
    return out


def _png_content(png: bytes, prompt: str) -> list:
    import base64

    return [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(png).decode()}},
        {"type": "text", "text": prompt},
    ]


async def page_to_blocks(png: bytes, context: str = "") -> list[dict]:
    """Transcribe a scanned page image into AccessDoc blocks (validated, without ids)."""
    prompt = "Transcribe this page into blocks."
    if context.strip():
        prompt += f"\n\nDocument context (for reference only):\n<context>\n{context.strip()[:500]}\n</context>"
    text = await _call(
        VISION_MODEL, OCR_SYSTEM, _png_content(png, prompt), max_tokens=16000, schema=OCR_SCHEMA, fallback=True
    )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError("Page transcription was not valid JSON.") from e
    return sanitize_ocr_blocks(data)


async def math_from_image(png: bytes, formulas: list[str]) -> dict[int, dict]:
    """{index (1-based): {"latex", "spoken"}} for the numbered formulas found on the page image."""
    listing = "\n".join(f"{i}. {f}" for i, f in enumerate(formulas, start=1))
    text = await _call(
        VISION_MODEL,
        MATH_VISION_SYSTEM,
        _png_content(png, f"Formulas:\n{listing}"),
        max_tokens=8000,
        schema=MATH_VISION_SCHEMA,
        fallback=True,
    )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError("Maths reading was not valid JSON.") from e
    out: dict[int, dict] = {}
    for item in data.get("items", []) if isinstance(data, dict) else []:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        latex, spoken = _s(item.get("latex"), 2000), _s(item.get("spoken"), 2000)
        if 1 <= idx <= len(formulas) and spoken:
            out[idx] = {"latex": latex or None, "spoken": spoken}
    return out


# ---------------------------------------------------------------------------
# Conversion enrichment
# ---------------------------------------------------------------------------


def _needs_alt(b: dict) -> bool:
    return (
        b["type"] == "image"
        and not b.get("_author_alt")
        and not b.get("_skip_ai")
        and b.get("origin") != "page"
        and b.get("altStatus") != "decorative"
    )


async def _ocr_scanned_pages(raw_blocks: list[dict], stats: dict, progress) -> None:
    """Replace scanned-page image blocks with transcribed blocks (in place)."""
    scans = [b for b in raw_blocks if b["type"] == "image" and b.get("_scan_png")]
    if not scans:
        return
    sem = asyncio.Semaphore(IMAGE_CONCURRENCY)
    results: dict[int, list[dict]] = {}

    async def do(b):
        async with sem:
            try:
                blocks = await page_to_blocks(b["_scan_png"], b.get("_context", ""))
                if blocks:
                    results[id(b)] = blocks
            except Exception:
                pass  # keep the page image (origin "page")
        stats["pagesTried"] += 1
        progress(
            "images",
            f"Reading scanned pages ({stats['pagesTried']} of {len(scans)})…",
            50 + int(15 * stats["pagesTried"] / len(scans)),
        )

    await asyncio.gather(*(do(b) for b in scans))
    out = []
    for b in raw_blocks:
        if id(b) in results:
            stats["pagesOcr"] += 1
            for nb in results[id(b)]:
                if nb["type"] == "math":
                    nb["_math_done"] = True
                out.append(nb)
        else:
            b.pop("_scan_png", None)
            out.append(b)
    raw_blocks[:] = out


async def _math_pages(raw_blocks: list[dict], stats: dict) -> None:
    """Ask the vision model for LaTeX + spoken text of math blocks on maths-heavy pages."""
    groups: dict[int, list[dict]] = {}
    pngs: dict[int, bytes] = {}
    for b in raw_blocks:
        if b["type"] == "math" and b.get("_math_png") is not None:
            key = id(b["_math_png"])
            groups.setdefault(key, []).append(b)
            pngs[key] = b["_math_png"]
    sem = asyncio.Semaphore(IMAGE_CONCURRENCY)

    async def do(key):
        blocks = groups[key]
        async with sem:
            try:
                res = await math_from_image(pngs[key], [b["text"] for b in blocks])
            except Exception:
                return  # keep the rule-based reading
        for i, b in enumerate(blocks, start=1):
            if i in res:
                b["latex"], b["spoken"] = res[i]["latex"], res[i]["spoken"]
                b["_math_done"] = True
                stats["mathVision"] += 1

    await asyncio.gather(*(do(k) for k in groups))


async def enrich_blocks(
    raw_blocks: list[dict],
    describe_images: bool = True,
    progress: Callable[[str, str, int], None] | None = None,
) -> dict:
    """Fill image alt text and maths readings in place, and transcribe scanned pages.

    Never raises for API problems: failed items keep altStatus "missing"
    (images), the rule-based spoken text (maths) or the page image with
    origin "page" (scanned pages). Returns counts.
    """
    progress = progress or (lambda *a: None)
    stats = {
        "images": 0, "described": 0, "failed": 0, "math": 0, "mathSpoken": 0,
        "pagesTried": 0, "pagesOcr": 0, "mathVision": 0,
    }

    if not has_api_key():
        images = [b for b in raw_blocks if _needs_alt(b)]
        stats["images"] = len(images)
        stats["math"] = sum(1 for b in raw_blocks if b["type"] == "math")
        if images:
            progress("images", f"{len(images)} image(s) need alt text (no AI key configured).", 85)
        return stats

    # Transcription is conversion, not description, so it runs even when describeImages is off.
    await _ocr_scanned_pages(raw_blocks, stats, progress)
    await _math_pages(raw_blocks, stats)

    images = [b for b in raw_blocks if _needs_alt(b)]
    maths = [b for b in raw_blocks if b["type"] == "math" and not b.get("_math_done")]
    stats["images"] = len(images)
    stats["math"] = sum(1 for b in raw_blocks if b["type"] == "math")
    if not describe_images:
        images = []

    sem = asyncio.Semaphore(IMAGE_CONCURRENCY)
    done = 0
    total = len(images) + len(maths)

    async def do_image(b):
        nonlocal done
        async with sem:
            try:
                res = await describe_image(b["src"], b.get("_context", ""))
                if res["decorative"]:
                    b["alt"], b["altStatus"] = "", "decorative"
                else:
                    b["alt"], b["altStatus"] = res["alt"], "ai"
                stats["described"] += 1
            except Exception:
                stats["failed"] += 1
        done += 1
        progress(
            "images",
            f"Describing images ({stats['described'] + stats['failed']} of {len(images)})…",
            65 + int(20 * done / max(1, total)),
        )

    async def do_math(b):
        nonlocal done
        async with sem:
            try:
                b["spoken"] = await speak_math(b["text"])
                stats["mathSpoken"] += 1
            except Exception:
                pass  # keep the rule-based reading
        done += 1

    await asyncio.gather(*(do_image(b) for b in images), *(do_math(b) for b in maths))
    return stats
