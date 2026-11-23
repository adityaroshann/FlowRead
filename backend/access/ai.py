"""Claude helpers: image descriptions, spoken maths, plain language, summaries.

Models
- VISION_MODEL (claude-opus-5-5): image alt text and spoken maths. Accuracy
  matters most here, so it uses the capable model at low effort.
- FAST_MODEL (claude-haiku-5-5): plain-language rewrites and section summaries.

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
# Conversion enrichment
# ---------------------------------------------------------------------------


async def enrich_blocks(
    raw_blocks: list[dict],
    describe_images: bool = True,
    progress: Callable[[str, str, int], None] | None = None,
) -> dict:
    """Fill image alt text and maths readings in place.

    Never raises for API problems: failed items keep altStatus "missing"
    (images) or the rule-based spoken text (maths). Returns counts.
    """
    progress = progress or (lambda *a: None)
    images = [b for b in raw_blocks if b["type"] == "image" and not b.get("_author_alt")]
    maths = [b for b in raw_blocks if b["type"] == "math"]
    stats = {"images": len(images), "described": 0, "failed": 0, "math": len(maths), "mathSpoken": 0}

    if not has_api_key():
        if images:
            progress("images", f"{len(images)} image(s) need alt text (no AI key configured).", 85)
        return stats
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
            except (AIError, AIUnavailable, ValueError):
                stats["failed"] += 1
            except Exception:
                stats["failed"] += 1
        done += 1
        progress("images", f"Describing images ({stats['described'] + stats['failed']} of {len(images)})…",
                 50 + int(35 * done / max(1, total)))

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
