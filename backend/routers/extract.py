import io
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

router = APIRouter()


class Page(BaseModel):
    pageNum: int
    paragraphs: list[str]


class ExtractResponse(BaseModel):
    title: str
    pages: list[Page]


def extract_pdf(data: bytes) -> ExtractResponse:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=data, filetype="pdf")
    title = doc.metadata.get("title", "") or "Untitled"
    pages = []
    for i, page in enumerate(doc, start=1):
        blocks = page.get_text("blocks")
        paragraphs = []
        for block in blocks:
            # block = (x0, y0, x1, y1, text, block_no, block_type)
            if block[6] == 0:  # text block
                text = block[4].strip()
                if text:
                    paragraphs.append(text)
        pages.append(Page(pageNum=i, paragraphs=paragraphs))
    doc.close()
    return ExtractResponse(title=title, pages=pages)


def extract_docx(data: bytes) -> ExtractResponse:
    from docx import Document
    doc = Document(io.BytesIO(data))
    title = "Untitled"
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    # Try to get title from first heading
    for p in doc.paragraphs:
        if p.style.name.startswith("Heading") and p.text.strip():
            title = p.text.strip()
            break
    return ExtractResponse(title=title, pages=[Page(pageNum=1, paragraphs=paragraphs)])


def extract_txt(data: bytes) -> ExtractResponse:
    text = data.decode("utf-8", errors="replace")
    paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
    title = paragraphs[0][:80] if paragraphs else "Untitled"
    return ExtractResponse(title=title, pages=[Page(pageNum=1, paragraphs=paragraphs)])


@router.post("/extract", response_model=ExtractResponse)
async def extract_file(file: UploadFile = File(...)):
    data = await file.read()
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        return extract_pdf(data)
    elif ext in ("docx",):
        return extract_docx(data)
    elif ext in ("txt", "md"):
        return extract_txt(data)
    else:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: .{ext}. Accepted: pdf, docx, txt, md")
