# FlowRead — Read faster. Focus better.

[![Live Demo](https://img.shields.io/badge/Live-flowread--mu.vercel.app-E8A838?style=for-the-badge)](https://flowread-mu.vercel.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.133-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![Claude](https://img.shields.io/badge/Claude-Haiku-7C3AED?style=for-the-badge)](https://anthropic.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

> An accessibility-first web app that transforms any document, PDF, or URL into a beautifully formatted, ADHD/dyslexia-friendly reading experience using bionic text rendering and AI-powered summarization.

---

## Features

- **Bionic Reading Engine** — Bolds the first 40–55% of each word, guiding the eye and reducing cognitive load
- **Multi-format support** — Upload PDF, DOCX, TXT, or paste a URL
- **AI Summaries** — Claude Haiku generates a TL;DR + key bullets, streamed word-by-word
- **Reading settings** — Adjust bold intensity, font size, line spacing, color theme, and font family (including OpenDyslexic and Atkinson Hyperlegible)
- **Text-to-Speech** — Built-in read-aloud using the Web Speech API
- **Export** — Download as PDF or DOCX with bionic formatting preserved
- **Themes** — Cream, Dark, Sepia, and High Contrast modes

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, Framer Motion, React Router |
| Backend | FastAPI (Python), uvicorn |
| PDF extraction | PyMuPDF (fitz) |
| DOCX extraction | python-docx |
| URL scraping | httpx + BeautifulSoup4, newspaper3k, Jina.ai Reader |
| AI | Claude Haiku (claude-haiku-3-5-20251001) via Anthropic API |
| Export | jsPDF + html2canvas, docx npm |
| Deploy | Vercel (frontend) + Render (backend) |
| CI/CD | GitHub Actions |

---

## Why I built this

Reading on screens is hard for millions of people with ADHD or dyslexia. I built FlowRead to make any document as readable as possible — without subscriptions, paywalls, or browser extensions. Just upload and read.

---

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- An [Anthropic API key](https://console.anthropic.com)

### Backend

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt

# Create your .env
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

uvicorn main:app --reload
# API runs at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install

# Create your .env
cp .env.example .env
# .env already points to http://localhost:8000 by default

npm run dev
# App runs at http://localhost:5173
```

---

## Deploy

### Backend → Render
1. Create a new **Web Service** on [render.com](https://render.com)
2. Root directory: `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add env var: `ANTHROPIC_API_KEY`

### Frontend → Vercel
1. Import the repo on [vercel.com](https://vercel.com)
2. Root directory: `frontend/`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add env var: `VITE_API_BASE_URL=https://your-render-app.onrender.com`

### GitHub Actions (auto-deploy)
Add these secrets to your repo (`Settings → Secrets`):
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VITE_API_BASE_URL`

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/transform` | Bionic text transform |
| POST | `/api/extract` | Extract text from file |
| POST | `/api/scrape` | Scrape text from URL |
| POST | `/api/summarize` | AI summary (SSE stream) |
| POST | `/api/simplify` | Simplify a paragraph |

---

## License

MIT © [Aditya Roshan](https://github.com/adityaroshann)
