from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.services import supermemory_client

router = APIRouter(prefix="/symptoms", tags=["symptoms"])


class SymptomIn(BaseModel):
    name: str
    date: str


@router.post("")
async def log_symptom(body: SymptomIn) -> dict:
    if not settings.supermemory_api_key:
        raise HTTPException(
            status_code=503,
            detail="SUPERMEMORY_API_KEY is not configured — the knowledge graph is offline.",
        )
    await supermemory_client.log_symptom(body.name, body.date)
    return {"status": "logged"}
