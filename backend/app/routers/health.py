from fastapi import APIRouter

from app.models import ModelStatus
from app.services import model_router

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ModelStatus)
async def health() -> dict:
    provider, model = model_router.active_provider()
    reachable = await model_router.check_reachable()
    return {"provider": provider, "model": model, "reachable": reachable}
