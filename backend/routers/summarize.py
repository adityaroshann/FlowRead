import json
import os
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import anthropic

router = APIRouter()

SYSTEM_PROMPT = """You are a reading assistant. Given a document or article, produce a structured summary.
Return ONLY valid JSON with this exact shape:
{
  "tldr": "2-3 sentence summary here",
  "bullets": ["Key point one (max 15 words)", "Key point two", "Key point three", "Key point four", "Key point five"],
  "readingTimeMinutes": 4
}
No extra text before or after the JSON."""

SIMPLIFY_PROMPT = """Rewrite this paragraph at a 7th grade reading level. Keep all key information. Return only the rewritten paragraph, no extra text."""


class SummarizeRequest(BaseModel):
    text: str


class SimplifyRequest(BaseModel):
    paragraph: str


def _get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=api_key)


@router.post("/summarize")
async def summarize(req: SummarizeRequest):
    """
    Streams the AI summary as Server-Sent Events.
    Each SSE event: data: <JSON chunk>\n\n
    Final event: data: [DONE]\n\n
    """
    text_sample = req.text[:6000]

    def generate():
        client = _get_client()
        with client.messages.stream(
            model="claude-haiku-3-5-20251001",
            max_tokens=512,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Summarize this document:\n\n{text_sample}"}],
        ) as stream:
            for text in stream.text_stream:
                # Escape newlines in SSE data field
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
        model="claude-haiku-3-5-20251001",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": f"{SIMPLIFY_PROMPT}\n\nParagraph:\n{req.paragraph}"
        }],
    )
    simplified = message.content[0].text
    return {"simplified": simplified}
