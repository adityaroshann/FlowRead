import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bs4 import BeautifulSoup

router = APIRouter()


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResponse(BaseModel):
    title: str
    sourceUrl: str
    paragraphs: list[str]


def _clean_paragraphs(paragraphs: list[str]) -> list[str]:
    return [p.strip() for p in paragraphs if len(p.strip()) > 40]


async def _try_httpx_bs4(url: str) -> ScrapeResponse | None:
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 FlowRead/1.0"})
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else "Untitled"
        # Try article > main > body in order
        container = soup.find("article") or soup.find("main") or soup.find("body")
        if not container:
            return None
        paragraphs = _clean_paragraphs([p.get_text() for p in container.find_all("p")])
        if len(paragraphs) < 3:
            return None
        return ScrapeResponse(title=title, sourceUrl=url, paragraphs=paragraphs)
    except Exception:
        return None


async def _try_newspaper(url: str) -> ScrapeResponse | None:
    try:
        from newspaper import Article
        article = Article(url)
        article.download()
        article.parse()
        paragraphs = _clean_paragraphs(article.text.split("\n"))
        if not paragraphs:
            return None
        title = article.title or "Untitled"
        return ScrapeResponse(title=title, sourceUrl=url, paragraphs=paragraphs)
    except Exception:
        return None


async def _try_jina(url: str) -> ScrapeResponse | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"https://r.jina.ai/{url}", headers={"Accept": "text/markdown"})
            resp.raise_for_status()
        lines = resp.text.splitlines()
        title = "Untitled"
        paragraphs = []
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("# ") and title == "Untitled":
                title = stripped[2:]
            elif stripped and not stripped.startswith("#"):
                paragraphs.append(stripped)
        paragraphs = _clean_paragraphs(paragraphs)
        if not paragraphs:
            return None
        return ScrapeResponse(title=title, sourceUrl=url, paragraphs=paragraphs)
    except Exception:
        return None


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_url(req: ScrapeRequest):
    result = await _try_httpx_bs4(req.url)
    if result:
        return result
    result = await _try_newspaper(req.url)
    if result:
        return result
    result = await _try_jina(req.url)
    if result:
        return result
    raise HTTPException(
        status_code=422,
        detail="Could not extract readable content from this URL. Try pasting the text directly."
    )
