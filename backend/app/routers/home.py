import asyncio

from fastapi import APIRouter

from app.models import HomeSnapshot
from app.services import ai_graph_builder, model_router, supermemory_client, weather
from app.services.mock_data import HOME_SNAPSHOT

router = APIRouter(prefix="/home", tags=["home"])


@router.get("/snapshot", response_model=HomeSnapshot)
async def get_snapshot() -> dict:
    snapshot = dict(HOME_SNAPSHOT)

    try:
        results = await asyncio.gather(
            weather.get_environment_snapshot(),
            supermemory_client.build_graph(),
            model_router.generate_general_tip(),
            return_exceptions=True,
        )

        environment = results[0] if not isinstance(results[0], Exception) else None
        graph = results[1] if not isinstance(results[1], Exception) else None
        general_tip = results[2] if not isinstance(results[2], Exception) else None

        if environment and isinstance(environment, dict):
            snapshot["environment"] = environment
            snapshot["tip"] = weather.tip_for(environment.get("aqiCategory", "Good"))

        if general_tip and isinstance(general_tip, str):
            snapshot["generalTip"] = general_tip
        elif not snapshot.get("generalTip"):
            snapshot["generalTip"] = "Prioritize adequate rest, hydration, and regular exercise to support overall health."

        # If Supermemory graph has nodes, use it; otherwise use AI Knowledge Graph Builder
        if graph and isinstance(graph, dict) and graph.get("nodes"):
            snapshot["graph"] = graph
            snapshot["status"], snapshot["statusNote"] = supermemory_client.describe_status(graph)
        else:
            symptoms = await supermemory_client.list_all_symptoms()
            ai_res = await ai_graph_builder.build_llm_knowledge_graph(symptoms)
            snapshot["graph"] = ai_res["graph"]
            snapshot["status"] = ai_res["status"]
            snapshot["statusNote"] = ai_res["statusNote"]

        # Enrich graph nodes & edges with authentic medical definitions & pairwise rationales
        if snapshot.get("graph") and snapshot["graph"].get("nodes"):
            try:
                snapshot["graph"] = await asyncio.wait_for(
                    ai_graph_builder.enrich_graph_with_clinical_knowledge(snapshot["graph"]),
                    timeout=2.5,
                )
            except Exception:
                pass
    except Exception:
        pass

    return snapshot


