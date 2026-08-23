import asyncio
import time

from fastapi import APIRouter

from app.models import HomeSnapshot
from app.services import ai_graph_builder, model_router, supermemory_client, weather
from app.services import mock_data

router = APIRouter(prefix="/home", tags=["home"])


_CACHED_GRAPH: tuple[dict, float] | None = None

@router.get("/snapshot")
async def get_snapshot() -> dict:
    """Combines environment data, active LLM model status, general tip, and the patient's Knowledge Graph."""
    global _CACHED_GRAPH
    snapshot = dict(mock_data.HOME_SNAPSHOT)

    try:
        results = await asyncio.gather(
            weather.get_environment_snapshot(),
            supermemory_client.build_graph(),
            model_router.generate_general_tip(),
            return_exceptions=True,
        )

        environment = results[0] if isinstance(results[0], dict) else None
        graph = results[1] if isinstance(results[1], dict) else None
        general_tip = results[2] if isinstance(results[2], str) else None

        raw_graph = graph if (graph and isinstance(graph, dict) and graph.get("nodes")) else await supermemory_client.build_graph()
        status, status_note = supermemory_client.describe_status(raw_graph)

        active_symptoms = [
            n.get("label") for n in raw_graph.get("nodes", [])
            if isinstance(n, dict) and n.get("type") == "Symptom" and n.get("label")
        ]

        if environment:
            snapshot["environment"] = environment
            snapshot["tip"] = weather.tip_for(environment.get("aqiCategory", "Good"), active_symptoms=active_symptoms)


        if general_tip and isinstance(general_tip, str):
            snapshot["generalTip"] = general_tip

        raw_graph = graph if (graph and isinstance(graph, dict) and graph.get("nodes")) else await supermemory_client.build_graph()
        status, status_note = supermemory_client.describe_status(raw_graph)

        enriched_graph = ai_graph_builder.apply_cached_knowledge(raw_graph)
        snapshot["graph"] = enriched_graph
        snapshot["status"] = status
        snapshot["statusNote"] = status_note
        asyncio.create_task(ai_graph_builder.enrich_graph_with_clinical_knowledge(enriched_graph))
    except Exception:
        pass

    return snapshot
