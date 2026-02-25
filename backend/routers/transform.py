from fastapi import APIRouter
from pydantic import BaseModel, Field
from utils.bionic import bionic_transform, word_count, reading_time_minutes

router = APIRouter()


class TransformRequest(BaseModel):
    text: str
    intensity: float = Field(default=0.45, ge=0.35, le=0.55)


class TransformResponse(BaseModel):
    html: str
    wordCount: int
    readingTimeMinutes: float


@router.post("/transform", response_model=TransformResponse)
async def transform_text(req: TransformRequest):
    html = bionic_transform(req.text, req.intensity)
    wc = word_count(req.text)
    rt = reading_time_minutes(req.text)
    return TransformResponse(html=html, wordCount=wc, readingTimeMinutes=rt)
