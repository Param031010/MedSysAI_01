"""Quick-Reply Option Generator for MedSysAI Chat UI.

Generates 2 to 4 interactive option chips (pills) for the frontend when clarification
or quick symptom choices would help the user answer quickly.
"""

import json
import re
from app.services import model_router

QUICK_OPTIONS_SYSTEM_PROMPT = """You are a clinical UI assistant helper.
Analyze the patient's message and the assistant's reply. Whenever the assistant asks a question or gathers symptom details, generate 2 to 4 short, clear, interactive option buttons (chips) that the patient can click to answer directly without typing.

Guidelines:
- Options should be clear, patient-friendly choices matching the assistant's question.
- Always provide 2 to 4 distinct options when a question or symptom check is present.
- Example 1 (Cough question): ["Dry cough (< 3 days)", "Wet/Mucus cough (< 3 days)", "Coughing > 1 week", "Associated chest tightness"]
- Example 2 (Fever question): ["No fever", "Low fever (< 100°F)", "High fever (> 101°F)"]
- Example 3 (Duration question): ["Started today", "1 to 3 days ago", "4 to 7 days ago", "More than 2 weeks"]

Reply ONLY with a raw JSON object of this exact shape, no preamble, no markdown fences:
{"quick_options": ["Option 1", "Option 2", "Option 3"]}"""


_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


async def generate_quick_options(user_message: str, assistant_reply: str) -> list[str]:
    """Generates 2-4 interactive quick-reply options for the Chat UI, or empty list if none needed."""
    try:
        prompt = f"Patient Message: {user_message}\nAssistant Reply: {assistant_reply}"
        raw = await model_router.complete_gemini(
            prompt,
            system=QUICK_OPTIONS_SYSTEM_PROMPT,
            max_tokens=200,
            timeout=10.0,
            temperature=0,
        )
        cleaned = re.sub(r"<think>.*?</think>", "", raw.strip(), flags=re.DOTALL).strip()
        cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

        match = _JSON_OBJECT.search(cleaned)
        data = json.loads(match.group(0)) if match else json.loads(cleaned)
        if isinstance(data, dict):
            opts = data.get("quick_options", [])
            if isinstance(opts, list):
                return [str(o).strip() for o in opts if isinstance(o, str) and o.strip()][:4]
    except Exception:
        pass

    return []
