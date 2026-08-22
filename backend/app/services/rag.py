"""Chunking, embedding, and retrieval for chat grounding.

Content — uploaded/OCR'd reports, scraped web pages, past chat turns — is
chunked and embedded locally (sentence-transformers), stored in MongoDB, and
retrieved by brute-force cosine similarity — plenty fast at single-user
scale, no vector database required.
"""

from datetime import datetime, timezone

import numpy as np

from app.db import get_db
from app.services.embeddings import embed, embed_batch


def _chunk_text(text: str, size: int = 800, overlap: int = 150) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += size - overlap
    return [c.strip() for c in chunks if c.strip()]


def _store_source(
    source_id: str,
    title: str,
    kind: str,
    content: str,
    url: str | None = None,
    owner_id: str | None = None,
    extracted: dict | None = None,
) -> dict:
    """Chunks, embeds, and stores any piece of content as a retrievable
    source — the shared path for uploaded reports, OCR'd documents, and
    scraped web pages."""
    chunks = _chunk_text(content) or [content[:200] or "(empty document)"]
    vectors = embed_batch(chunks)

    db = get_db()
    uploaded_at = datetime.now(timezone.utc).date().isoformat()

    db.chunks.delete_many({"sourceId": source_id})
    db.chunks.insert_many(
        [
            {
                "sourceId": source_id,
                "text": chunk,
                "embedding": vector,
                "index": i,
                "type": kind,
                **({"url": url} if url else {}),
            }
            for i, (chunk, vector) in enumerate(zip(chunks, vectors))
        ]
    )

    source = {
        "id": source_id,
        "title": title,
        "kind": kind,
        "uploadedAt": uploaded_at,
        "excerpt": chunks[0][:220],
        # Full text, kept separately from the overlapping retrieval chunks so
        # the reader view doesn't show duplicated text at chunk boundaries.
        "content": content,
        **({"url": url} if url else {}),
        # Who uploaded this — lets Profile derive History/Medications only
        # from this same user's own documents. Not set for scraped web
        # pages, which aren't personal medical records.
        **({"clerkUserId": owner_id} if owner_id else {}),
        # Conditions/medications extracted from this one document, computed
        # once (at upload time) rather than live on every Profile visit —
        # Profile just reads and merges these across all your documents.
        **(
            {
                "extractedConditions": extracted["conditions"],
                "extractedMedications": extracted["medications"],
            }
            if extracted is not None
            else {}
        ),
    }
    db.sources.update_one({"id": source_id}, {"$set": source}, upsert=True)
    return source


def ingest_report(
    filename: str, kind: str, report: str, owner_id: str | None = None, extracted: dict | None = None
) -> dict:
    """Stores a My Data report (already OCR'd + LLM-authored) for retrieval."""
    source_id = f"src-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    return _store_source(source_id, filename, kind, report, owner_id=owner_id, extracted=extracted)


def store_web_content(url: str, title: str, content: str) -> dict:
    """Chunks and embeds a scraped web page, same as an uploaded document, so
    deep-search results are retrievable through the normal RAG pipeline."""
    return _store_source(f"web:{url}", title, "web", content, url=url)


def store_chat_message(session_id: str, role: str, content: str) -> None:
    """Embeds a chat turn into the same vector store used for RAG retrieval,
    so later questions can recall earlier parts of this conversation."""
    if not content.strip():
        return
    db = get_db()
    db.chunks.insert_one(
        {
            "sourceId": f"chat:{session_id}",
            "text": content,
            "embedding": embed(content),
            "type": "chat",
            "sessionId": session_id,
            "role": role,
        }
    )


def retrieve(query: str, top_k: int = 4, allowed_source_ids: list[str] | None = None) -> list[dict]:
    """Searches chunk embeddings by cosine similarity. When allowed_source_ids
    is given, only searches within those sources — e.g. the My Data cards the
    user selected for this chat session, plus its own conversation history."""
    db = get_db()
    query_vector = np.array(embed(query))

    mongo_filter = {"sourceId": {"$in": allowed_source_ids}} if allowed_source_ids is not None else {}

    scored: list[tuple[float, dict]] = []
    for chunk in db.chunks.find(mongo_filter, {"_id": 0}):
        similarity = float(np.dot(query_vector, np.array(chunk["embedding"])))
        scored.append((similarity, chunk))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k]]
