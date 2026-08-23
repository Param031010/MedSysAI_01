from fastapi import APIRouter
from pydantic import BaseModel

from app.services import ai_graph_builder, supermemory_client

router = APIRouter(prefix="/symptoms", tags=["symptoms"])


class SymptomIn(BaseModel):
    name: str
    date: str


@router.get("")
async def list_symptoms() -> list[dict]:
    return await supermemory_client.list_all_symptoms()


@router.post("")
async def log_symptom(body: SymptomIn) -> dict:
    await supermemory_client.log_symptom(body.name, body.date)
    await ai_graph_builder.compute_and_store_symptom_knowledge(body.name)
    return {"status": "logged"}


@router.delete("/{name}")
async def delete_symptom(name: str) -> dict:
    await supermemory_client.delete_symptom(name)
    await ai_graph_builder.delete_symptom_knowledge(name)
    return {"status": "deleted"}

