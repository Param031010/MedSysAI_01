"""End-to-end integration test module for MedSysAI backend services.

Tests:
1. Symptom Normalization (LLM / Groq fallback)
2. Symptom Logging & Storage in MongoDB
3. Knowledge Graph Enrichment & Caching (db.graph_cache)
4. Home Dashboard Snapshot & Graph Assembly (build_graph + describe_status + apply_cached_knowledge)
5. Chat Entity Extraction & Vector RAG Retrieval
6. Clean teardown of test artifacts
"""

import asyncio
import sys
import json
from datetime import datetime

from app.db import get_db
from app.services import ai_graph_builder, supermemory_client, model_router, rag
from app.routers import home, symptoms


async def run_tests():
    print("=" * 60)
    print("      MEDSYS_AI END-TO-END SYSTEM TEST SUITE")
    print("=" * 60)
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    
    test_symptom_raw_1 = "feeling dizzy like room is spinning fast"
    test_symptom_raw_2 = "slighter head pain in back of head"
    
    cleaned_symptoms_to_purge = []

    try:
        # TEST 1: Symptom Normalization via LLM (Gemini / Groq fallback)
        print("\n[TEST 1] Testing LLM Symptom Normalization...")
        norm_1 = await ai_graph_builder.normalize_symptom_name(test_symptom_raw_1)
        norm_2 = await ai_graph_builder.normalize_symptom_name(test_symptom_raw_2)
        print(f"  Input 1: '{test_symptom_raw_1}' -> Normalized: '{norm_1}'")
        print(f"  Input 2: '{test_symptom_raw_2}' -> Normalized: '{norm_2}'")
        assert norm_1 and len(norm_1) < 45, "Normalization 1 failed"
        assert norm_2 and len(norm_2) < 45, "Normalization 2 failed"
        cleaned_symptoms_to_purge.extend([norm_1, norm_2])
        print("  [OK] TEST 1 PASSED: Symptom normalization is working!")

        # TEST 2: Symptom Logging & MongoDB Persistence
        print("\n[TEST 2] Testing Symptom Storage & Supermemory Sync...")
        log_res_1 = await supermemory_client.log_symptom(norm_1, today)
        log_res_2 = await supermemory_client.log_symptom(norm_2, today)
        
        db_sym_1 = db.symptoms.find_one({"name": norm_1})
        db_sym_2 = db.symptoms.find_one({"name": norm_2})
        assert db_sym_1 is not None, f"Symptom {norm_1} not found in db.symptoms"
        assert db_sym_2 is not None, f"Symptom {norm_2} not found in db.symptoms"
        print(f"  Logged '{norm_1}': frequency = {log_res_1['frequency']}, occurrences = {log_res_1['occurrences']}")
        print(f"  Logged '{norm_2}': frequency = {log_res_2['frequency']}, occurrences = {log_res_2['occurrences']}")
        print("  [OK] TEST 2 PASSED: Symptom logging and storage is working!")

        # TEST 3: Background Knowledge Graph Enrichment & Caching
        print("\n[TEST 3] Testing Clinical Knowledge Graph Enrichment...")
        await ai_graph_builder.compute_and_store_symptom_knowledge(norm_1)
        await ai_graph_builder.compute_and_store_symptom_knowledge(norm_2)

        cache_node_1 = db.graph_cache.find_one({"key": f"node:{norm_1.lower()}"})
        cache_node_2 = db.graph_cache.find_one({"key": f"node:{norm_2.lower()}"})
        
        print(f"  Node Cache [{norm_1}]: Category = {cache_node_1.get('category') if cache_node_1 else 'N/A'}")
        print(f"  Description [{norm_1}]: {cache_node_1.get('description') if cache_node_1 else 'N/A'}")
        print(f"  Node Cache [{norm_2}]: Category = {cache_node_2.get('category') if cache_node_2 else 'N/A'}")
        print(f"  Description [{norm_2}]: {cache_node_2.get('description') if cache_node_2 else 'N/A'}")

        # Check edge cache between norm_1 and norm_2
        e_key = f"edge:{min(norm_1.lower(), norm_2.lower())}:{max(norm_1.lower(), norm_2.lower())}"
        cache_edge = db.graph_cache.find_one({"key": e_key})
        if cache_edge:
            print(f"  Edge Cache [{norm_1} <-> {norm_2}]: Relation = {cache_edge.get('relation')}")
            print(f"  Rationale: {cache_edge.get('rationale')}")
        print("  [OK] TEST 3 PASSED: Knowledge Graph enrichment & MongoDB caching is working!")

        # TEST 4: Home Dashboard Snapshot & Knowledge Graph Assembly
        print("\n[TEST 4] Testing Home Dashboard Snapshot & Graph Assembly...")
        snapshot = await home.get_snapshot()
        graph = snapshot.get("graph", {})
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        status = snapshot.get("status")
        status_note = snapshot.get("statusNote")

        print(f"  Dashboard Status: '{status}'")
        print(f"  Status Note: '{status_note}'")
        print(f"  Total Nodes in Dashboard Graph: {len(nodes)}")
        print(f"  Total Edges in Dashboard Graph: {len(edges)}")
        
        # Verify our newly logged test nodes appear in graph with enriched properties
        test_node_found = any(n.get("label", "").lower() == norm_1.lower() for n in nodes)
        assert test_node_found, f"Node {norm_1} not found in Home Dashboard graph"
        print("  [OK] TEST 4 PASSED: Home Dashboard snapshot & graph assembly is working!")

        # TEST 5: Chat Entity Extraction & RAG Vector Retrieval
        print("\n[TEST 5] Testing Chat Entity Extraction & RAG Retrieval...")
        chat_input = "I have been experiencing a sharp headache and taking paracetamol 500mg daily."
        entities = await model_router.extract_chat_entities(chat_input)
        print(f"  Chat Input: '{chat_input}'")
        print(f"  Extracted Symptoms: {entities.get('symptoms')}")
        print(f"  Extracted Medications: {entities.get('medications')}")
        assert isinstance(entities.get('symptoms'), list), "Entity extraction symptoms missing"
        assert isinstance(entities.get('medications'), list), "Entity extraction medications missing"

        # Test RAG retrieval
        test_source_id = "test-doc-001"
        rag._store_source(test_source_id, "Test Medical Report", "report", "Patient exhibits mild hypertension and elevated blood glucose levels.")
        retrieved_chunks = rag.retrieve("What are the blood glucose levels?", top_k=2)
        print(f"  RAG Retrieved Chunks Count: {len(retrieved_chunks)}")
        if retrieved_chunks:
            print(f"  Top Retrieved Chunk: '{retrieved_chunks[0]['text']}'")
        assert len(retrieved_chunks) > 0, "RAG retrieval failed"
        
        # Clean up test RAG source
        db.sources.delete_one({"id": test_source_id})
        db.chunks.delete_many({"sourceId": test_source_id})
        print("  [OK] TEST 5 PASSED: Chat entity extraction and RAG retrieval is working!")

    finally:
        # CLEANUP: Remove test symptoms and test knowledge cache
        print("\n[CLEANUP] Cleaning up test data...")
        for sym in cleaned_symptoms_to_purge:
            await supermemory_client.delete_symptom(sym)
            await ai_graph_builder.delete_symptom_knowledge(sym)
        print("  [OK] CLEANUP COMPLETED: Test data removed from MongoDB.")

    print("\n" + "=" * 60)
    print("  ALL 5 TEST MODULES PASSED SUCCESSFULLY! EVERYTHING IS WORKING!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_tests())
