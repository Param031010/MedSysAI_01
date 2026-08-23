import asyncio
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
    # STEP 1: Pass raw user input to LLM for clinical normalization
    normalized_name = await ai_graph_builder.normalize_symptom_name(body.name)

    # STEP 2: Store ONLY the LLM-normalized clinical term in MongoDB db.symptoms
    log_res = await supermemory_client.log_symptom(normalized_name, body.date)

    # STEP 3: Send normalized clinical term to LLM in background for Knowledge Graph enrichment (0ms HTTP delay)
    asyncio.create_task(ai_graph_builder.compute_and_store_symptom_knowledge(normalized_name))

    return {
        "status": "logged",
        "rawInput": body.name,
        "normalizedName": normalized_name,
        "frequency": log_res.get("frequency", 1),
    }


@router.delete("/{name}")
async def delete_symptom(name: str) -> dict:
    await supermemory_client.delete_symptom(name)
    await ai_graph_builder.delete_symptom_knowledge(name)
    return {"status": "deleted"}

