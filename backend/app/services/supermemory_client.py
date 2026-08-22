"""Symptom knowledge graph, backed by the Supermemory API.

Every symptom/condition — whether logged by hand on Home or extracted from
a chat message as you write it — is written here as a memory with
structured metadata. `build_graph()` reads every distinct one back and
connects them as a complete graph, each edge labeled with the number of
days between the two symptoms' occurrences.
"""

from datetime import datetime

import httpx

from app.config import settings

SUPERMEMORY_BASE = "https://api.supermemory.ai"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.supermemory_api_key}",
        "Content-Type": "application/json",
    }


def _format_date(iso_date: str) -> str:
    d = datetime.fromisoformat(iso_date).date()
    return f"{d.strftime('%a, %b')} {d.day}"


async def log_symptom(name: str, occurred_on: str) -> None:
    payload = {
        "memories": [
            {
                "content": f"Patient reported symptom '{name}' on {occurred_on}.",
                "metadata": {"type": "symptom", "symptom": name, "date": occurred_on},
                "temporalContext": {"eventDate": [occurred_on]},
            }
        ],
        "containerTag": settings.supermemory_container_tag,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            f"{SUPERMEMORY_BASE}/v4/memories", headers=_headers(), json=payload
        )
        res.raise_for_status()


async def log_medication(name: str, dosage: str, occurred_on: str) -> None:
    payload = {
        "memories": [
            {
                "content": f"Patient reported taking medication '{name}' on {occurred_on}.",
                "metadata": {
                    "type": "medication",
                    "medication": name,
                    "dosage": dosage,
                    "date": occurred_on,
                },
                "temporalContext": {"eventDate": [occurred_on]},
            }
        ],
        "containerTag": settings.supermemory_container_tag,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            f"{SUPERMEMORY_BASE}/v4/memories", headers=_headers(), json=payload
        )
        res.raise_for_status()


async def log_web_content(query: str, url: str, title: str, content: str) -> None:
    """Best-effort — a failed write here should never break a deep search."""
    if not settings.supermemory_api_key or not content.strip():
        return
    payload = {
        "memories": [
            {
                "content": content[:8000],
                "metadata": {"type": "web", "url": url, "title": title, "query": query},
            }
        ],
        "containerTag": settings.supermemory_chat_container_tag,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{SUPERMEMORY_BASE}/v4/memories", headers=_headers(), json=payload
            )
            res.raise_for_status()
    except httpx.HTTPError:
        pass


async def log_document(source_id: str, title: str, kind: str, content: str) -> None:
    """Best-effort — a failed write here should never break a My Data upload."""
    if not settings.supermemory_api_key or not content.strip():
        return
    payload = {
        "memories": [
            {
                "content": content[:8000],
                "metadata": {"type": "document", "sourceId": source_id, "title": title, "kind": kind},
            }
        ],
        "containerTag": settings.supermemory_chat_container_tag,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{SUPERMEMORY_BASE}/v4/memories", headers=_headers(), json=payload
            )
            res.raise_for_status()
    except httpx.HTTPError:
        pass


async def log_chat_message(session_id: str, role: str, content: str) -> None:
    """Best-effort — a failed write here should never break the chat turn."""
    if not settings.supermemory_api_key or not content.strip():
        return
    payload = {
        "memories": [
            {
                "content": content,
                "metadata": {"type": "chat", "sessionId": session_id, "role": role},
            }
        ],
        "containerTag": settings.supermemory_chat_container_tag,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{SUPERMEMORY_BASE}/v4/memories", headers=_headers(), json=payload
            )
            res.raise_for_status()
    except httpx.HTTPError:
        pass


async def list_all_symptoms() -> list[dict]:
    """Returns every distinct symptom/condition ever logged, one entry per
    distinct name with its most recent occurrence date."""
    if not settings.supermemory_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # log_symptom's content always literally contains the word
            # "symptom", so this reliably surfaces every logged symptom —
            # filtering by metadata.type server-side turned out not to
            # match here, so the type check is done client-side below
            # instead, which is more robust anyway.
            res = await client.post(
                f"{SUPERMEMORY_BASE}/v4/search",
                headers=_headers(),
                json={
                    "q": "symptom",
                    "containerTag": settings.supermemory_container_tag,
                    # Supermemory caps this at 100 — a higher value 400s.
                    "limit": 100,
                },
            )
            res.raise_for_status()
            results = res.json().get("results", [])
    except httpx.HTTPError:
        return []

    latest_by_name: dict[str, str] = {}
    for r in results:
        meta = r.get("metadata")
        if not isinstance(meta, dict) or meta.get("type") != "symptom":
            continue
        name = meta.get("symptom")
        date = meta.get("date")
        if not name or not date:
            continue
        if name not in latest_by_name or date > latest_by_name[name]:
            latest_by_name[name] = date
    return [{"name": name, "date": date} for name, date in latest_by_name.items()]


async def list_all_medications() -> list[dict]:
    """Returns every distinct medication ever logged via chat, one entry per
    distinct name with its most recent occurrence's date/dosage."""
    if not settings.supermemory_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{SUPERMEMORY_BASE}/v4/search",
                headers=_headers(),
                json={
                    "q": "medication",
                    "containerTag": settings.supermemory_container_tag,
                    # Supermemory caps this at 100 — a higher value 400s.
                    "limit": 100,
                },
            )
            res.raise_for_status()
            results = res.json().get("results", [])
    except httpx.HTTPError:
        return []

    latest_by_name: dict[str, dict] = {}
    for r in results:
        meta = r.get("metadata")
        if not isinstance(meta, dict) or meta.get("type") != "medication":
            continue
        name = meta.get("medication")
        date = meta.get("date")
        if not name or not date:
            continue
        if name not in latest_by_name or date > latest_by_name[name]["date"]:
            latest_by_name[name] = {"date": date, "dosage": meta.get("dosage", "")}
    return [
        {"name": name, "dosage": info["dosage"], "date": info["date"]}
        for name, info in latest_by_name.items()
    ]


CLOSE_WINDOW_DAYS = 7
# A tight cluster (occurring this close together) or a widespread one (this
# many close pairs) reads as more urgent than a single loosely-close pair.
SERIOUS_MAX_GAP_DAYS = 2
SERIOUS_MIN_PAIRS = 3


def _join_labels(labels: list[str], limit: int = 4) -> str:
    if len(labels) <= limit:
        return ", ".join(labels)
    shown = ", ".join(labels[:limit])
    return f"{shown} and {len(labels) - limit} more"


def describe_status(graph: dict) -> tuple[str, str]:
    """Status + note derived from the real knowledge graph content — names
    the actual symptoms involved instead of a generic canned line."""
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    if not nodes:
        return "stable", "No symptoms logged yet — nothing to flag."

    by_id = {n["id"]: n["label"] for n in nodes}
    close_edges = sorted(
        (e for e in edges if e["durationDays"] <= CLOSE_WINDOW_DAYS),
        key=lambda e: e["durationDays"],
    )

    if not close_edges:
        labels = _join_labels([n["label"] for n in nodes])
        return (
            "stable",
            f"{labels} logged, but nothing clustering close together — no emerging pattern right now.",
        )

    top = close_edges[0]
    a, b = by_id.get(top["source"], "?"), by_id.get(top["target"], "?")
    day_word = "day" if top["durationDays"] == 1 else "days"
    note = f"{a} and {b} occurred {top['durationDays']} {day_word} apart"

    extra = len(close_edges) - 1
    if extra > 0:
        pair_word = "pair" if extra == 1 else "pairs"
        note += f", plus {extra} other close {pair_word} in your logs"

    if top["durationDays"] <= SERIOUS_MAX_GAP_DAYS or len(close_edges) >= SERIOUS_MIN_PAIRS:
        status = "serious"
        note += " — that clustering is worth mentioning to a doctor if it continues."
    else:
        status = "moderate"
        note += " — worth keeping an eye on."

    return status, note


async def build_graph() -> dict:
    """Every distinct logged symptom/condition as a node, connected to
    every other as a complete graph — each edge labeled with the number of
    days between the two symptoms' occurrences."""
    symptoms = await list_all_symptoms()

    nodes = [
        {"id": f"n{i}", "label": s["name"].capitalize(), "date": _format_date(s["date"])}
        for i, s in enumerate(symptoms)
    ]

    edges = []
    for i in range(len(symptoms)):
        day_i = datetime.fromisoformat(symptoms[i]["date"]).date()
        for j in range(i + 1, len(symptoms)):
            day_j = datetime.fromisoformat(symptoms[j]["date"]).date()
            edges.append(
                {
                    "source": nodes[i]["id"],
                    "target": nodes[j]["id"],
                    "durationDays": abs((day_j - day_i).days),
                }
            )

    return {"nodes": nodes, "edges": edges}


async def reachable() -> bool:
    if not settings.supermemory_api_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                f"{SUPERMEMORY_BASE}/v4/search",
                headers=_headers(),
                json={
                    "q": "ping",
                    "containerTag": settings.supermemory_container_tag,
                    "limit": 1,
                },
            )
            return res.status_code == 200
    except httpx.HTTPError:
        return False
