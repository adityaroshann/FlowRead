import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import transform, extract, scrape, summarize

app = FastAPI(title="FlowRead API", version="1.0.0")

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://flowread-mu.vercel.app")
origins = [o.strip() for o in allowed_origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transform.router, prefix="/api")
app.include_router(extract.router, prefix="/api")
app.include_router(scrape.router, prefix="/api")
app.include_router(summarize.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "FlowRead API"}
