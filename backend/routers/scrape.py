import re
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bs4 import BeautifulSoup

router = APIRouter()

# Noise patterns to filter out of scraped paragraphs
_NOISE_PATTERNS = re.compile(
    r"^(share|tweet|subscribe|sign up|log in|sign in|related articles?|"
    r"you (might|may) (also )?(like|enjoy)|read more|advertisement|"
    r"cookie policy|terms of (use|service)|privacy policy|all rights reserved|"
    r"follow us|newsletter|comments?|reply|published|updated|posted)",
    re.IGNORECASE,
)
_URL_HEAVY = re.compile(r"https?://\S+")


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResponse(BaseModel):
    title: str
    sourceUrl: str
    paragraphs: list[str]


def _clean_paragraphs(paragraphs: list[str]) -> list[str]:
    cleaned = []
    for p in paragraphs:
        text = p.strip()
        if len(text) < 60:
            continue
        # Skip if it's mostly URLs
        url_chars = sum(len(m.group()) for m in _URL_HEAVY.finditer(text))
        if url_chars > len(text) * 0.5:
            continue
        # Skip common nav/footer noise
        if _NOISE_PATTERNS.match(text):
            continue
        cleaned.append(text)
    return cleaned


async def _try_httpx_bs4(url: str) -> ScrapeResponse | None:
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 FlowRead/1.0"})
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        # Remove noise containers before extracting text
        for tag in soup(["nav", "header", "footer", "aside", "script", "style",
                          "figure", "figcaption", "form", "button"]):
            tag.decompose()

        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else "Untitled"
        # Strip site name suffixes like " | Site Name" or " - Site Name"
        title = re.split(r"\s[\|\-–—]\s", title)[0].strip()

        container = soup.find("article") or soup.find("main") or soup.find("body")
        if not container:
            return None

        raw = [p.get_text(separator=" ") for p in container.find_all("p")]
        paragraphs = _clean_paragraphs(raw)
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
            elif stripped and not stripped.startswith("#") and not stripped.startswith("["):
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
