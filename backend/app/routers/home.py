import asyncio

from fastapi import APIRouter

from app.models import HomeSnapshot
from app.services import model_router, supermemory_client, weather
from app.services.mock_data import HOME_SNAPSHOT

router = APIRouter(prefix="/home", tags=["home"])


@router.get("/snapshot", response_model=HomeSnapshot)
async def get_snapshot() -> dict:
    snapshot = dict(HOME_SNAPSHOT)

    # None of these three depends on another's result — run them
    # concurrently instead of chaining their latency (weather, Supermemory,
    # and the local LLM tip can each take a couple of seconds on their own).
    environment, graph, general_tip = await asyncio.gather(
        weather.get_environment_snapshot(),
        supermemory_client.build_graph(),
        model_router.generate_general_tip(),
    )

    if environment:
        snapshot["environment"] = environment
        snapshot["tip"] = weather.tip_for(environment["aqiCategory"])

    # Never a canned demo pattern — the real, current knowledge graph built
    # from every symptom you've logged or mentioned in chat.
    snapshot["graph"] = graph
    snapshot["status"], snapshot["statusNote"] = supermemory_client.describe_status(graph)

    snapshot["generalTip"] = general_tip

    return snapshot
