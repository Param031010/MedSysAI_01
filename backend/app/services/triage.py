"""Semantic Clinical Triage & Red-Flag Layer for MedSysAI.

Evaluates user chat messages for emergency red flags (cardiac distress, severe dyspnea,
hemoptysis, syncope, cyanosis, anaphylaxis) using LLM context parsing.
Intelligently handles negations ("no chest pain") and third-party history
("my father had chest pain").
"""

import json
import re
from app.services import model_router

TRIAGE_SYSTEM_PROMPT = """You are a senior emergency triage clinician AI.
Analyze the patient's single chat message to determine if any IMMEDIATE EMERGENCY RED-FLAG is reported.

Evaluate for the following EMERGENCY RED FLAGS:
1. Cardiac / Vascular: Severe, crushing, or pressure-like chest pain, pain radiating to jaw/left arm/back, unexplained cold sweats.
2. Respiratory: Severe shortness of breath or dyspnea at rest, coughing up blood (hemoptysis), blue/gray lips or nails (cyanosis).
3. Neurological / Systemic: Fainting or sudden loss of consciousness (syncope), sudden numbness/weakness on one side of body, sudden "thunderclap" headache, high fever with stiff neck, sudden acute confusion.
4. Anaphylaxis: Sudden swelling of throat, tongue, or lips with difficulty swallowing or breathing after exposure to food/medication/sting.

CRITICAL INSTRUCTIONS FOR NEGATION & CONTEXT:
- If the patient explicitly denies a symptom (e.g. "I have a cough but NO chest pain", "no shortness of breath"), do NOT count it as a red flag.
- If the symptom refers to someone else (e.g. "my brother has chest pain", "my father had a stroke"), do NOT count it as a red flag for this patient.
- If the patient asks a purely general/abstract question (e.g. "what causes chest pain?"), do NOT count it as an active emergency.

Reply ONLY with a raw JSON object of this exact shape, no preamble, no markdown fences:
{
  "is_red_flag": true,
  "urgency": "EMERGENCY",
  "primary_symptoms": ["chest pain", "shortness of breath"],
  "red_flag_reason": "Patient reports severe crushing chest pain and shortness of breath while resting.",
  "escalation_guidance": "Please seek immediate emergency medical care (call 911 or go to the nearest Emergency Department immediately). Do not attempt to drive yourself."
}

If NO red flag is present:
{
  "is_red_flag": false,
  "urgency": "ROUTINE",
  "primary_symptoms": ["cough"],
  "red_flag_reason": "",
  "escalation_guidance": ""
}"""

_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


async def eval_triage(user_message: str) -> dict:
    """Evaluates a chat message for clinical emergency red flags via Gemini / Groq fallback.
    
    Returns a dict with keys:
      - is_red_flag (bool)
      - urgency (str: 'EMERGENCY' | 'URGENT' | 'ROUTINE')
      - primary_symptoms (list[str])
      - red_flag_reason (str)
      - escalation_guidance (str)
    """
    cleaned_input = user_message.strip()
    default_safe = {
        "is_red_flag": False,
        "urgency": "ROUTINE",
        "primary_symptoms": [],
        "red_flag_reason": "",
        "escalation_guidance": "",
    }
    lowered = cleaned_input.lower()

    has_negation = any(neg in lowered for neg in ("no ", "not ", "don't ", "dont ", "never ", "without ", "history of ", "father "))
    has_emergency_keyword = any(kw in lowered for kw in ("crushing chest pain", "chest pain radiating", "severe shortness of breath", "coughing blood", "passed out", "anaphylaxis"))
    
    if has_emergency_keyword and not has_negation:
        default_safe = {
            "is_red_flag": True,
            "urgency": "EMERGENCY",
            "primary_symptoms": ["Chest Pain"],
            "red_flag_reason": "Emergency cardiac indicator detected",
            "escalation_guidance": "Seek immediate emergency medical attention (Call 911 / ER).",
        }


    if not cleaned_input:
        return default_safe


    try:
        raw = await model_router.complete_gemini(
            cleaned_input[:2000],
            system=TRIAGE_SYSTEM_PROMPT,
            max_tokens=600,
            timeout=15.0,
            temperature=0,
        )
        cleaned = re.sub(r"<think>.*?</think>", "", raw.strip(), flags=re.DOTALL).strip()
        cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        
        match = _JSON_OBJECT.search(cleaned)
        data = json.loads(match.group(0)) if match else json.loads(cleaned)
        
        if isinstance(data, dict):
            return {
                "is_red_flag": bool(data.get("is_red_flag", False)),
                "urgency": str(data.get("urgency", "ROUTINE")).upper(),
                "primary_symptoms": list(data.get("primary_symptoms", [])),
                "red_flag_reason": str(data.get("red_flag_reason", "")).strip(),
                "escalation_guidance": str(data.get("escalation_guidance", "")).strip(),
            }
    except Exception:
        pass

    return default_safe
