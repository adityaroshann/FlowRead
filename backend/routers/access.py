from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def access_health():
    return {"status": "ok"}
