import json
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import anthropic

router = APIRouter()

SIMPLIFY_PROMPT = (
    "Rewrite this paragraph at a 7th grade reading level. "
    "Keep all key information. Return only the rewritten paragraph, no extra text."
)


def _build_system_prompt(word_count: int) -> tuple[str, int, int]:
    """
    Returns (system_prompt, max_tokens, max_chars) based on document length.
    """
    if word_count <= 300:
        bullet_range = "2 to 3"
        tldr_len = "1 sentence"
        max_tokens = 512
        max_chars = 3000
    elif word_count <= 1000:
        bullet_range = "4 to 5"
        tldr_len = "2 sentences"
        max_tokens = 768
        max_chars = 6000
    elif word_count <= 3000:
        bullet_range = "6 to 8"
        tldr_len = "2 to 3 sentences"
        max_tokens = 1024
        max_chars = 10000
    else:
        bullet_range = "9 to 12"
        tldr_len = "3 to 4 sentences"
        max_tokens = 1536
        max_chars = 14000

    prompt = f"""You are a reading assistant. This document is approximately {word_count} words.
Generate a summary scaled to the document's depth and complexity.

Return ONLY valid JSON with this exact shape:
{{
  "tldr": "{tldr_len} summary capturing the core message",
  "bullets": ["key insight one", "key insight two", ...],
  "readingTimeMinutes": <number>
}}

Rules:
- Write {bullet_range} bullet points (scale to actual content depth, not just length)
- Each bullet should capture a distinct key idea, finding, or argument — not paraphrase the same point
- tldr should be {tldr_len}
- readingTimeMinutes: estimate based on 200 words/min reading speed
- No extra text before or after the JSON"""

    return prompt, max_tokens, max_chars


class SummarizeRequest(BaseModel):
    text: str


class SimplifyRequest(BaseModel):
    paragraph: str


def _get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI features are not configured. Please set ANTHROPIC_API_KEY."
        )
    return anthropic.Anthropic(api_key=api_key)


@router.post("/summarize")
async def summarize(req: SummarizeRequest):
    """
    Streams the AI summary as Server-Sent Events.
    Each SSE event: data: <JSON chunk>\\n\\n
    Final event: data: [DONE]\\n\\n
    """
    # Check API key and build client BEFORE returning StreamingResponse
    # so errors surface as proper HTTP responses, not silent stream failures.
    client = _get_client()

    word_count = len(req.text.split())
    system_prompt, max_tokens, max_chars = _build_system_prompt(word_count)
    text_sample = req.text[:max_chars]

    def generate():
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": f"Summarize this document:\n\n{text_sample}"}],
        ) as stream:
            for text in stream.text_stream:
                escaped = text.replace("\n", "\\n")
                yield f"data: {json.dumps({'chunk': escaped})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@router.post("/simplify")
async def simplify(req: SimplifyRequest):
    client = _get_client()
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": f"{SIMPLIFY_PROMPT}\n\nParagraph:\n{req.paragraph}"
        }],
    )
    simplified = message.content[0].text
    return {"simplified": simplified}
