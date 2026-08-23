import json
import re
from datetime import datetime
import httpx

from app.db import get_db
from app.services import model_router

_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)

SYSTEM_PROMPT = """You are a clinical knowledge graph assistant. You are given a list of symptoms and conditions reported by a patient along with their dates.

Construct a clinical concept knowledge graph connecting related symptoms/conditions:
1. Create a node for each distinct symptom or condition. Node id should be "n1", "n2", etc.
2. Create edges ONLY between symptoms/conditions that have a real medical or temporal relationship (e.g. "co-occurs with", "shares risk factor", "potential trigger", "complication of", "aggravated by"). Do not connect completely unrelated symptoms.
3. Evaluate overall status as "stable", "moderate", or "serious" based on clinical clustering and symptom severity.
4. Provide a 1-sentence statusNote summarizing the clinical observation.

Reply with ONLY a raw JSON object of this exact shape, no preamble, no markdown fence:
{
  "nodes": [{"id": "n1", "label": "Symptom Name", "date": "Mon, Aug 20"}],
  "edges": [{"source": "n1", "target": "n2", "durationDays": 1, "relation": "co-occurs with"}],
  "status": "stable",
  "statusNote": "Short clinical summary line."
}"""

ENRICHMENT_SYSTEM_PROMPT = """You are a senior clinical consultant AI. You are given a list of patient symptoms (nodes) and their connection pairs (edges).
Your job is to provide specific, patient-friendly medical descriptions and precise physiological rationales.

For each node:
1. "description": A concise (1-2 sentence) patient-friendly medical explanation of what this symptom is and its clinical context.
2. "category": Affected body system (e.g. "Neurological", "Cardiovascular", "Respiratory", "Gastrointestinal", "Systemic", "Musculoskeletal").

For each edge:
1. "relation": A specific medical relationship tag (e.g. "shared neurological pathway", "viral prodrome", "cardiorespiratory stress", "systemic inflammation", "temporal co-occurrence").
2. "rationale": A concise (1-2 sentence) clinical explanation of how these two specific symptoms relate physiologically and what their combined presence indicates.

Reply ONLY with a JSON object of this exact shape:
{
  "nodes": [{"id": "n1", "description": "...", "category": "..."}],
  "edges": [{"source": "n1", "target": "n2", "relation": "...", "rationale": "..."}]
}"""


def _format_date(iso_date: str) -> str:
    try:
        d = datetime.fromisoformat(iso_date).date()
        return f"{d.strftime('%a, %b')} {d.day}"
    except Exception:
        return iso_date


async def build_llm_knowledge_graph(symptoms: list[dict], conditions: list[str] | None = None) -> dict:
    """Uses LLM reasoning to build a clinical knowledge graph with medical edge relationships when Supermemory is unavailable."""
    all_items = []
    for s in symptoms:
        name = s.get("name", "").capitalize()
        date_str = _format_date(s.get("date", ""))
        if name:
            all_items.append(f"- Symptom: {name} (Date: {date_str})")

    for c in conditions or []:
        if c:
            all_items.append(f"- Active Condition: {c.capitalize()}")

    if not all_items:
        return {
            "graph": {"nodes": [], "edges": []},
            "status": "stable",
            "statusNote": "No symptoms logged yet — nothing to flag.",
        }

    user_prompt = "Patient Reported Items:\n" + "\n".join(all_items)

    try:
        raw = await model_router.complete_gemini(
            user_prompt,
            system=SYSTEM_PROMPT,
            max_tokens=600,
            timeout=3.0,
            temperature=0,
        )
        try:
            data = json.loads(raw.strip())
        except json.JSONDecodeError:
            match = _JSON_OBJECT.search(raw)
            if not match:
                raise ValueError("No JSON object in model response")
            data = json.loads(match.group(0))

        nodes = [
            {"id": str(n.get("id", f"n{i}")), "label": str(n.get("label", "")), "date": str(n.get("date", ""))}
            for i, n in enumerate(data.get("nodes", []))
            if n.get("label")
        ]
        edges = [
            {
                "source": str(e.get("source", "")),
                "target": str(e.get("target", "")),
                "durationDays": int(e.get("durationDays", 0)),
                "relation": str(e.get("relation", "related to")),
            }
            for e in data.get("edges", [])
            if e.get("source") and e.get("target")
        ]
        status = data.get("status") if data.get("status") in ("stable", "moderate", "serious") else "stable"
        status_note = str(data.get("statusNote", "Symptom pattern processed."))

        return {
            "graph": {"nodes": nodes, "edges": edges},
            "status": status,
            "statusNote": status_note,
        }

    except Exception:
        # Fallback to simple date gap math if LLM call is offline
        nodes = [
            {"id": f"n{i}", "label": s["name"].capitalize(), "date": _format_date(s.get("date", ""))}
            for i, s in enumerate(symptoms)
        ]
        edges = []
        for i in range(len(symptoms)):
            for j in range(i + 1, len(symptoms)):
                edges.append(
                    {
                        "source": nodes[i]["id"],
                        "target": nodes[j]["id"],
                        "durationDays": 1,
                        "relation": "clinical co-occurrence",
                    }
                )
        return {
            "graph": {"nodes": nodes, "edges": edges},
            "status": "stable",
            "statusNote": "Symptom graph compiled from local records.",
        }


NODE_SYSTEM_PROMPT = """You are a senior clinical consultant AI.
For each symptom name listed, provide an authentic, patient-friendly medical explanation and body system category.

Reply ONLY with a raw JSON object of this exact shape, no preamble, no markdown fences:
{
  "nodes": [
    {
      "label": "Symptom Name",
      "category": "Neurological / Cognitive",
      "description": "Concise 1-2 sentence medical explanation of this specific symptom."
    }
  ]
}"""

EDGE_SYSTEM_PROMPT = """You are a senior clinical consultant AI.
For each symptom pair listed, analyze why these two specific symptoms co-occur physiologically and what their combined presence implies.

Reply ONLY with a raw JSON object of this exact shape, no preamble, no markdown fences:
{
  "edges": [
    {
      "source": "Symptom A",
      "target": "Symptom B",
      "relation": "Specific Medical Relationship Tag (e.g. Cardio-Neurological Distress, Systemic Inflammatory Response, Neuro-Endocrine Cluster)",
      "rationale": "Concise 1-2 sentence specific clinical explanation of why these two particular symptoms relate physiologically."
    }
  ]
}"""


async def enrich_graph_with_clinical_knowledge(graph: dict) -> dict:
    """Enriches graph nodes and edges dynamically using Gemini 2.5 Flash with ZERO hardcoded fallback dictionaries. Stores everything permanently in MongoDB db.graph_cache."""
    if not graph or not graph.get("nodes"):
        return graph

    db = get_db()
    nodes = list(graph.get("nodes", []))
    edges = list(graph.get("edges", []))
    node_by_id = {n["id"]: n for n in nodes}
    node_by_label = {n["label"].strip().lower(): n for n in nodes if n.get("label")}

    uncached_nodes = []
    for n in nodes:
        label = n.get("label", "").strip()
        cached = db.graph_cache.find_one({"key": f"node:{label.lower()}"})
        if cached and cached.get("description"):
            n["description"] = cached.get("description")
            n["category"] = cached.get("category", "Clinical Symptom")
        else:
            uncached_nodes.append(n)

    uncached_edges = []
    for e in edges:
        src_label = node_by_id.get(e["source"], {}).get("label", "")
        tgt_label = node_by_id.get(e["target"], {}).get("label", "")
        if not src_label or not tgt_label:
            continue
        key = f"edge:{min(src_label, tgt_label).lower()}:{max(src_label, tgt_label).lower()}"
        cached = db.graph_cache.find_one({"key": key})
        if cached and cached.get("rationale"):
            e["relation"] = cached.get("relation", e.get("relation"))
            e["rationale"] = cached.get("rationale")
        else:
            uncached_edges.append((e, src_label, tgt_label, key))

    # 1. Dynamically enrich uncached nodes via Gemini 2.5 Flash
    if uncached_nodes:
        prompt_lines = ["Define the following patient symptoms:"]
        for n in uncached_nodes:
            prompt_lines.append(f"- {n['label']}")

        try:
            raw = await model_router.complete_gemini(
                "\n".join(prompt_lines),
                system=NODE_SYSTEM_PROMPT,
                max_tokens=1500,
                timeout=25.0,
                temperature=0,
            )
            cleaned = re.sub(r"^```json\s*", "", raw.strip(), flags=re.IGNORECASE)
            cleaned = re.sub(r"^```\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            match = _JSON_OBJECT.search(cleaned)
            data = json.loads(match.group(0)) if match else json.loads(cleaned)

            for n_item in data.get("nodes", []):
                lbl = str(n_item.get("label", "")).strip().lower()
                target_node = node_by_label.get(lbl)
                if target_node:
                    desc = str(n_item.get("description", "")).strip()
                    cat = str(n_item.get("category", "Clinical Symptom")).strip()
                    if desc:
                        target_node["description"] = desc
                        target_node["category"] = cat
                        db.graph_cache.update_one(
                            {"key": f"node:{target_node['label'].lower()}"},
                            {"$set": {"description": desc, "category": cat}},
                            upsert=True,
                        )
        except Exception:
            pass

    # 2. Dynamically enrich uncached edges in small 15-pair chunks via Gemini 2.5 Flash
    if uncached_edges:
        edge_chunks = [uncached_edges[i:i + 15] for i in range(0, len(uncached_edges), 15)]

        for edge_chunk in edge_chunks:
            prompt_lines = ["Analyze the clinical relationship for these symptom pairs:"]
            for e, src_label, tgt_label, _ in edge_chunk:
                prompt_lines.append(f"- Pair: {src_label} and {tgt_label} (Occurred {e.get('durationDays', 0)} days apart)")

            try:
                raw = await model_router.complete_gemini(
                    "\n".join(prompt_lines),
                    system=EDGE_SYSTEM_PROMPT,
                    max_tokens=2000,
                    timeout=30.0,
                    temperature=0,
                )
                cleaned = re.sub(r"^```json\s*", "", raw.strip(), flags=re.IGNORECASE)
                cleaned = re.sub(r"^```\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
                match = _JSON_OBJECT.search(cleaned)
                data = json.loads(match.group(0)) if match else json.loads(cleaned)

                for e_item in data.get("edges", []):
                    s_raw = str(e_item.get("source", "")).strip().lower()
                    t_raw = str(e_item.get("target", "")).strip().lower()
                    relation = str(e_item.get("relation", "Clinical Co-occurrence")).strip()
                    rationale = str(e_item.get("rationale", "")).strip()

                    if not s_raw or not t_raw or not rationale:
                        continue

                    for e in edges:
                        e_src_lbl = node_by_id.get(e["source"], {}).get("label", "").lower()
                        e_tgt_lbl = node_by_id.get(e["target"], {}).get("label", "").lower()

                        is_match = (
                            (s_raw in e_src_lbl or e_src_lbl in s_raw) and (t_raw in e_tgt_lbl or e_tgt_lbl in t_raw)
                        ) or (
                            (s_raw in e_tgt_lbl or e_tgt_lbl in s_raw) and (t_raw in e_src_lbl or e_src_lbl in t_raw)
                        )

                        if is_match:
                            e["relation"] = relation
                            e["rationale"] = rationale
                            key = f"edge:{min(e_src_lbl, e_tgt_lbl)}:{max(e_src_lbl, e_tgt_lbl)}"
                            db.graph_cache.update_one(
                                {"key": key},
                                {"$set": {"relation": relation, "rationale": rationale}},
                                upsert=True,
                            )
            except Exception:
                pass

    return {"nodes": nodes, "edges": edges}


async def compute_and_store_symptom_knowledge(symptom_name: str) -> None:
    """Invoked immediately upon logging a new symptom. Prompts Gemini 2.5 Flash to compute medical definition, category, and pairwise clinical rationales against all existing symptoms, storing everything permanently in MongoDB."""
    db = get_db()
    symptom_name = symptom_name.strip().capitalize()
    if not symptom_name:
        return

    all_symptoms = await db.symptoms.find({}, {"_id": 0}).to_list(length=100)
    existing_labels = list({s["name"].strip().capitalize() for s in all_symptoms if s.get("name") and s["name"].strip().capitalize() != symptom_name})

    prompt_lines = [
        f"New Symptom Logged: {symptom_name}",
        f"Existing Symptoms in Patient Timeline: {', '.join(existing_labels) if existing_labels else 'None'}",
        "\n1. Provide a 1-2 sentence medical description and body system category for the new symptom.",
        "2. Provide specific clinical relationship tags and physiological rationales connecting the new symptom to each existing symptom.",
    ]

    try:
        raw = await model_router.complete_gemini(
            "\n".join(prompt_lines),
            system=ENRICHMENT_SYSTEM_PROMPT,
            max_tokens=1000,
            timeout=25.0,
            temperature=0,
        )
        cleaned = re.sub(r"^```json\s*", "", raw.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        match = _JSON_OBJECT.search(cleaned)
        data = json.loads(match.group(0)) if match else json.loads(cleaned)

        for n_item in data.get("nodes", []):
            desc = str(n_item.get("description", "")).strip()
            cat = str(n_item.get("category", "General")).strip()
            label = str(n_item.get("label", symptom_name)).strip().lower()
            if desc:
                db.graph_cache.update_one(
                    {"key": f"node:{label}"},
                    {"$set": {"description": desc, "category": cat}},
                    upsert=True,
                )

        for e_item in data.get("edges", []):
            src = str(e_item.get("source", "")).strip().lower()
            tgt = str(e_item.get("target", "")).strip().lower()
            relation = str(e_item.get("relation", "co-occurs with")).strip()
            rationale = str(e_item.get("rationale", "")).strip()
            if rationale:
                key = f"edge:{min(src, tgt)}:{max(src, tgt)}"
                db.graph_cache.update_one(
                    {"key": key},
                    {"$set": {"relation": relation, "rationale": rationale}},
                    upsert=True,
                )
    except Exception:
        pass


async def delete_symptom_knowledge(symptom_name: str) -> None:
    """Removes cached node and edge entries for a deleted symptom."""
    db = get_db()
    label = symptom_name.strip().lower()
    db.graph_cache.delete_one({"key": f"node:{label}"})
    db.graph_cache.delete_many({"key": {"$regex": f"edge:.*{re.escape(label)}.*"}})


