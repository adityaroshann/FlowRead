import io
import re
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

router = APIRouter()

# A block looks like a heading if it's short, on one line, doesn't end with a period,
# and isn't just a number or date.
_HEADING_RE = re.compile(r"^[^\n]{1,80}$")
_ENDS_SENTENCE = re.compile(r"[.!?]$")
_ONLY_DIGITS = re.compile(r"^[\d\s\.\-\/]+$")


def _is_heading(text: str) -> bool:
    stripped = text.strip()
    if not stripped or len(stripped) < 3:
        return False
    if "\n" in stripped:
        return False
    if len(stripped) > 80:
        return False
    if _ENDS_SENTENCE.search(stripped):
        return False
    if _ONLY_DIGITS.match(stripped):
        return False
    return True


def _tag_paragraph(text: str) -> str:
    """Prefix headings with ## so the frontend can render them differently."""
    t = text.strip()
    if _is_heading(t):
        return f"## {t}"
    return t


class Page(BaseModel):
    pageNum: int
    paragraphs: list[str]


class ExtractResponse(BaseModel):
    title: str
    pages: list[Page]


def extract_pdf(data: bytes) -> ExtractResponse:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=data, filetype="pdf")
    title = doc.metadata.get("title", "").strip() or "Untitled"
    pages = []
    for i, page in enumerate(doc, start=1):
        blocks = page.get_text("blocks")
        paragraphs = []
        for block in blocks:
            # block = (x0, y0, x1, y1, text, block_no, block_type)
            if block[6] == 0:  # text block
                text = block[4].strip()
                if text:
                    paragraphs.append(_tag_paragraph(text))
        pages.append(Page(pageNum=i, paragraphs=paragraphs))
    doc.close()
    return ExtractResponse(title=title, pages=pages)


def extract_docx(data: bytes) -> ExtractResponse:
    from docx import Document
    doc = Document(io.BytesIO(data))
    title = "Untitled"
    paragraphs = []
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        if p.style.name.startswith("Heading"):
            if title == "Untitled" and p.style.name == "Heading 1":
                title = text
            paragraphs.append(f"## {text}")
        else:
            paragraphs.append(text)
    return ExtractResponse(title=title, pages=[Page(pageNum=1, paragraphs=paragraphs)])


def extract_txt(data: bytes) -> ExtractResponse:
    text = data.decode("utf-8", errors="replace")
    paragraphs = []
    for line in text.splitlines():
        line = line.strip()
        if line:
            paragraphs.append(_tag_paragraph(line))
    title = paragraphs[0].lstrip("# ")[:80] if paragraphs else "Untitled"
    return ExtractResponse(title=title, pages=[Page(pageNum=1, paragraphs=paragraphs)])


@router.post("/extract", response_model=ExtractResponse)
async def extract_file(file: UploadFile = File(...)):
    data = await file.read()
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        return extract_pdf(data)
    elif ext == "docx":
        return extract_docx(data)
    elif ext in ("txt", "md"):
        return extract_txt(data)
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: .{ext}. Accepted: pdf, docx, txt, md"
        )
