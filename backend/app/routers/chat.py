import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.db import get_db
from app.models import (
    ChatMessage,
    ChatMessageIn,
    ChatSession,
    ChatSessionIn,
    ChatSessionSourcesIn,
    ChatSource,
)
from app.services import model_router, rag, supermemory_client, weather, web_search
from app.services.clerk_auth import require_clerk_auth
from app.services.mock_data import CHAT_SOURCES

router = APIRouter(prefix="/chat", tags=["chat"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{int(datetime.now(timezone.utc).timestamp() * 1000)}"


async def _remember_message(session_id: str, role: str, content: str) -> None:
    rag.store_chat_message(session_id, role, content)
    await supermemory_client.log_chat_message(session_id, role, content)


@router.get("/sessions", response_model=list[ChatSession])
def list_sessions() -> list[dict]:
    db = get_db()
    return list(db.chat_sessions.find({}, {"_id": 0}).sort("updatedAt", -1))


@router.post("/sessions", response_model=ChatSession)
def create_session(body: ChatSessionIn) -> dict:
    db = get_db()
    session = {
        "id": _new_id("sess"),
        "title": body.title or "New chat",
        "createdAt": _now(),
        "updatedAt": _now(),
        "sourceIds": [],
    }
    db.chat_sessions.insert_one({**session})
    return session


@router.put("/sessions/{session_id}/sources", response_model=ChatSession)
def set_session_sources(session_id: str, body: ChatSessionSourcesIn) -> dict:
    db = get_db()
    session = db.chat_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    db.chat_sessions.update_one(
        {"id": session_id}, {"$set": {"sourceIds": body.sourceIds, "updatedAt": _now()}}
    )
    return {**session, "sourceIds": body.sourceIds}


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessage])
def get_session_messages(session_id: str) -> list[dict]:
    db = get_db()
    return list(
        db.chat_messages.find({"sessionId": session_id}, {"_id": 0}).sort("createdAt", 1)
    )


@router.post("/sessions/{session_id}/messages", response_model=ChatMessage)
async def post_session_message(
    session_id: str, body: ChatMessageIn, user_id: str = Depends(require_clerk_auth)
) -> dict:
    db = get_db()
    session = db.chat_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    is_first_message = db.chat_messages.count_documents({"sessionId": session_id}) == 0

    user_message = {
        "id": _new_id("m"),
        "sessionId": session_id,
        "role": "user",
        "content": body.content,
        "createdAt": _now(),
    }
    db.chat_messages.insert_one({**user_message})
    await _remember_message(session_id, "user", body.content)

    search_query = (
        body.content
        if body.deepSearch
        else await model_router.decide_web_search(body.content)
    )
    web_sources: list[dict] = []
    if search_query:
        web_sources = await web_search.deep_search(search_query)

    web_source_ids = [f"web:{w['url']}" for w in web_sources]
    allowed_source_ids = [
        f"chat:{session_id}",
        *session.get("sourceIds", []),
        *web_source_ids,
    ]
    if web_source_ids:
        db.chat_sessions.update_one(
            {"id": session_id}, {"$addToSet": {"sourceIds": {"$each": web_source_ids}}}
        )

    context_chunks = rag.retrieve(body.content, top_k=8, allowed_source_ids=allowed_source_ids)

    # Concurrently fetch user profile & environment snapshot for Priority 1 grounding
    profile_task = asyncio.to_thread(db.profiles.find_one, {"clerkUserId": user_id}, {"_id": 0})
    weather_task = weather.get_environment_snapshot()
    user_profile, env_snapshot = await asyncio.gather(profile_task, weather_task)

    context_parts: list[str] = []

    if user_profile:
        conditions_str = ", ".join(user_profile.get("conditions", [])) or "None listed"
        meds = user_profile.get("medications", [])
        meds_str = (
            ", ".join(
                f"{m['name']} ({m['dosage']})" if m.get("dosage") else m["name"]
                for m in meds
                if isinstance(m, dict) and m.get("name")
            )
            or "None listed"
        )
        context_parts.append(
            f"[PATIENT PROFILE]\n"
            f"Name: {user_profile.get('fullName', 'Patient')}\n"
            f"Age: {user_profile.get('age', 'N/A')}, BMI: {user_profile.get('bmi', 'N/A')}, Blood Group: {user_profile.get('bloodGroup', 'N/A')}\n"
            f"Active Conditions: {conditions_str}\n"
            f"Current Medications: {meds_str}"
        )

    if env_snapshot:
        pollutants_str = ", ".join(
            f"{p['label']}: {p['value']} {p['unit']}"
            for p in env_snapshot.get("pollutants", [])
        )
        context_parts.append(
            f"[LIVE LOCAL ENVIRONMENT & AQI]\n"
            f"Location: {env_snapshot.get('locationName', 'Unknown')}\n"
            f"Temperature: {env_snapshot.get('tempC')}°C, Weather: {env_snapshot.get('condition')}\n"
            f"AQI: {env_snapshot.get('aqi')} ({env_snapshot.get('aqiCategory')})\n"
            f"Pollutants: {pollutants_str}"
        )

    if context_chunks:
        context_text = "\n\n".join(chunk["text"] for chunk in context_chunks)
        context_parts.append(f"[MEDICAL RECORDS & CONVERSATION EXCERPTS]\n{context_text}")

    prompt = body.content
    if context_parts:
        context_block = "\n\n".join(context_parts)
        prompt = (
            "Use the following patient profile, live environmental intelligence, and medical record/history excerpts "
            "to ground your answer. If environmental factors (e.g. high PM2.5 or humidity) or patient active conditions/medications "
            "are relevant to the user's question, incorporate personalized guidance naturally.\n\n"
            f"{context_block}\n\nQuestion: {body.content}"
        )

    # Extracting entities runs alongside reply generation (not after it) so
    # the knowledge graph and Profile history/medications build themselves
    # as you chat without adding latency to the reply you're actually
    # waiting for.
    reply_text, entities = await asyncio.gather(
        model_router.generate_reply(prompt),
        model_router.extract_chat_entities(body.content),
    )
    today = _now()[:10]
    for symptom in entities["symptoms"]:
        try:
            await supermemory_client.log_symptom(symptom, today)
        except httpx.HTTPError:
            pass
    for medication in entities["medications"]:
        try:
            await supermemory_client.log_medication(medication["name"], medication["dosage"], today)
        except httpx.HTTPError:
            pass

    assistant_message = {
        "id": _new_id("m"),
        "sessionId": session_id,
        "role": "assistant",
        "content": reply_text,
        "createdAt": _now(),
    }
    db.chat_messages.insert_one({**assistant_message})
    await _remember_message(session_id, "assistant", reply_text)

    update = {"updatedAt": _now()}
    if is_first_message:
        update["title"] = body.content[:60]
    db.chat_sessions.update_one({"id": session_id}, {"$set": update})

    return assistant_message


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str) -> None:
    db = get_db()
    result = db.chat_sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat session not found")
    db.chat_messages.delete_many({"sessionId": session_id})


@router.get("/sources", response_model=list[ChatSource])
def get_sources() -> list[dict]:
    db = get_db()
    docs = list(db.sources.find({}, {"_id": 0}).sort("uploadedAt", -1))
    return docs if docs else CHAT_SOURCES


@router.get("/sources/{source_id:path}/content")
def get_source_content(source_id: str) -> dict:
    db = get_db()
    source = db.sources.find_one({"id": source_id}, {"_id": 0})
    if not source:
        mock = next((s for s in CHAT_SOURCES if s["id"] == source_id), None)
        if not mock:
            raise HTTPException(status_code=404, detail="Source not found")
        return {**mock, "content": mock["excerpt"]}

    if "content" in source:
        return source

    # Legacy sources stored before full content was kept separately — fall
    # back to stitching chunks together (may duplicate text at overlaps).
    chunks = db.chunks.find({"sourceId": source_id}, {"_id": 0}).sort("index", 1)
    content = "\n\n".join(chunk["text"] for chunk in chunks) or source["excerpt"]
    return {**source, "content": content}


@router.delete("/sources/{source_id:path}", status_code=204)
def delete_source(source_id: str) -> None:
    db = get_db()
    result = db.sources.delete_one({"id": source_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    db.chunks.delete_many({"sourceId": source_id})
    # Drop it from any chat session that had it selected for grounding, so
    # nothing references a source that no longer exists.
    db.chat_sessions.update_many({}, {"$pull": {"sourceIds": source_id}})


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)) -> dict:
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured — speech-to-text is offline.",
        )
    raw = await file.read()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                files={"file": (file.filename or "audio.webm", raw, file.content_type or "audio/webm")},
                data={"model": settings.groq_whisper_model},
            )
            res.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Transcription failed") from exc
    return {"text": res.json().get("text", "")}
