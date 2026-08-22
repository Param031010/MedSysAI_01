"""Chooses which LLM backend serves the chat endpoint.

Defaults to a local Ollama model named by OLLAMA_MODEL. If that variable is
empty, routes to gpt-oss-20b on Groq Cloud instead.
"""

import asyncio
import json
import random
import re

import httpx

from app.config import settings

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# Some local models (especially base/pretrained variants without a properly
# registered stop token in their Ollama template) leak chat special tokens
# like `<|im_end|>` into the literal output — strip them defensively.
_SPECIAL_TOKEN = re.compile(r"<\|[^|<>]{1,40}\|>")
# Grabs the outermost {...} object out of a model reply that should be pure
# JSON but sometimes isn't quite.
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the public web for information outside the user's personal "
            "medical records — general medical reference, current guidance, or "
            "anything not already covered by their uploaded reports or past "
            "conversation. Only call this when the question genuinely needs "
            "outside information."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The web search query"},
            },
            "required": ["query"],
        },
    },
}


def active_provider() -> tuple[str, str]:
    """Returns (provider, model) for whichever backend is currently selected."""
    if settings.ollama_model:
        return "ollama", settings.ollama_model
    return "groq", settings.groq_model


async def check_reachable() -> bool:
    provider, _ = active_provider()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            if provider == "ollama":
                res = await client.get(f"{settings.ollama_host}/api/tags")
            else:
                res = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                )
            return res.status_code == 200
    except httpx.HTTPError:
        return False


async def _complete(
    user: str,
    system: str | None = None,
    max_tokens: int | None = None,
    timeout: float = 60.0,
    temperature: float | None = None,
) -> str:
    """Runs a single-turn completion against whichever text backend is
    active — a local Ollama model if OLLAMA_MODEL is set, else Groq."""
    provider, model = active_provider()
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": user}
    ]
    async with httpx.AsyncClient(timeout=timeout) as client:
        if provider == "ollama":
            ollama_payload: dict = {
                "model": model,
                "messages": messages,
                "stream": False,
                # Ollama unloads an idle model after 5 minutes by
                # default, and reloading it costs several extra seconds
                # on the next request — keep it resident longer so
                # normal browsing gaps don't repeatedly pay that cost.
                "keep_alive": "30m",
            }
            options: dict = {}
            if max_tokens:
                # Without a cap this local model will ramble well past a
                # short answer before it naturally stops — costing many
                # extra seconds for no benefit — so cap it the same way
                # the Groq branch below already does via `max_tokens`.
                options["num_predict"] = max_tokens
            if temperature is not None:
                options["temperature"] = temperature
            if options:
                ollama_payload["options"] = options
            res = await client.post(
                f"{settings.ollama_host}/api/chat",
                json=ollama_payload,
            )
            res.raise_for_status()
            return _SPECIAL_TOKEN.sub("", res.json()["message"]["content"]).strip()

        payload: dict = {"model": model, "messages": messages}
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if temperature is not None:
            payload["temperature"] = temperature
        res = await client.post(
            GROQ_CHAT_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json=payload,
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"].strip()


async def decide_web_search(user_message: str) -> str | None:
    """Lets the model decide whether this question needs a web search — only
    wired for Groq today, since that's the tool-calling-capable path this
    project has verified. Returns the search query if the model wants one,
    else None. Failures degrade to "no search" rather than blocking chat."""
    provider, model = active_provider()
    if provider != "groq" or not settings.groq_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                GROQ_CHAT_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Decide whether answering the user's message requires "
                                "searching the public web. Call web_search only if the "
                                "question needs outside information; otherwise respond "
                                "with no tool call."
                            ),
                        },
                        {"role": "user", "content": user_message},
                    ],
                    "tools": [WEB_SEARCH_TOOL],
                    "tool_choice": "auto",
                    "max_tokens": 200,
                },
            )
            res.raise_for_status()
            message = res.json()["choices"][0]["message"]
    except (httpx.HTTPError, KeyError, IndexError):
        return None

    tool_calls = message.get("tool_calls") or []
    if not tool_calls:
        return None
    try:
        args = json.loads(tool_calls[0]["function"]["arguments"])
    except (json.JSONDecodeError, KeyError):
        return None
    return args.get("query") or user_message


REPORT_SYSTEM_PROMPT = """You are a clinical documentation assistant. You are \
given raw OCR-extracted text from a medical document the user uploaded (a lab \
report, prescription, discharge summary, imaging report, insurance document, \
or similar). Produce a detailed, well-organized report in clean Markdown:

1. A top-level heading naming the document type and its date, if known.
2. A short plain-language summary (2-3 sentences) of what the document says.
3. Key findings or values, as a Markdown table when the source contains \
numeric results — note anything outside a typical reference range.
4. Any recommendations, follow-ups, or next steps evident in the source.

Be precise: only report what's actually in the source text, never invent \
values. If parts of the OCR text are garbled or ambiguous, say so plainly \
rather than guessing. Do not include any preamble like "Here is the report" \
— start directly with the heading."""


async def generate_report(ocr_text: str, filename: str) -> str:
    """Turns raw OCR text into a structured, readable report for My Data."""
    if not ocr_text.strip():
        return f"# {filename}\n\nNo readable text was found in this document."

    try:
        return await _complete(
            f"Filename: {filename}\n\nOCR text:\n{ocr_text}",
            system=REPORT_SYSTEM_PROMPT,
            timeout=60.0,
        )
    except (httpx.HTTPError, KeyError, IndexError):
        return f"# {filename}\n\nCouldn't generate a report — here's the raw extracted text:\n\n{ocr_text}"


DOCUMENT_CATEGORIES = ["consultation", "consult_prescription", "prescription", "report"]

CLASSIFY_SYSTEM_PROMPT = """Classify the medical document below into exactly \
one category. Reply with only the category slug, nothing else:

- consultation: a doctor's visit note or consult summary, no medication prescribed
- consult_prescription: a consult note that also prescribes medication
- prescription: a prescription/medication list only, no consult narrative
- report: a lab result, diagnostic report, imaging report, or similar test output

Reply with exactly one of: consultation, consult_prescription, prescription, report"""


async def classify_document(ocr_text: str) -> str:
    """Categorizes an uploaded document for My Data. Defaults to "report" —
    the safest bucket — if the model is unreachable or replies oddly."""
    if not ocr_text.strip():
        return "report"
    provider, _ = active_provider()
    if provider == "groq" and not settings.groq_api_key:
        return "report"
    try:
        answer = (
            await _complete(
                ocr_text[:3000], system=CLASSIFY_SYSTEM_PROMPT, max_tokens=350, timeout=20.0
            )
        ).lower()
    except (httpx.HTTPError, KeyError, IndexError):
        return "report"

    for category in DOCUMENT_CATEGORIES:
        if category in answer:
            return category
    return "report"


HISTORY_EXTRACTION_SYSTEM_PROMPT = """You are a clinical data extraction assistant. \
You are given the text of one medical document belonging to a patient (a lab report, \
consultation note, or prescription). Extract:

1. "conditions": diagnoses, disorders, or syndromes the document explicitly names as \
such — not lab results, not test names, not procedures performed.

   EXCLUDE all of the following, even if the document lists many of them:
   - Any lab test result restated as "<test name> low/high/elevated/normal/deficient" \
(e.g. "Hemoglobin low", "WBC high", "Elevated creatine kinase", "Normal calcium") — \
these are lab values, not diagnoses, no matter how the flag word is phrased.
   - Procedures, scans, or tests performed or referred for (e.g. "Distal enteroscopy", \
"Anal manometry", "ECG", "Chest X-ray", "Colonoscopy") — these are actions taken, not \
conditions the patient has.

   INCLUDE only an actual named diagnosis, disorder, or deficiency the document \
states the patient HAS (e.g. "Type 2 diabetes", "Vitamin D deficiency", "Iron-deficiency \
anemia", "Hypertension", "Seasonal allergic rhinitis").

2. "medications": a list of {"name": ..., "dosage": ...} for medications *named* in \
the source, as actually prescribed or taken. The "name" must be a real drug or \
product name copied from the text — never a placeholder like "Medication 1" or a \
generic instruction like "Continue current medications as prescribed" (that is not a \
medication name and must not appear here).

Only extract what's explicitly and unambiguously stated — never invent, guess, or \
paraphrase a condition or medication into existence. This source text may be noisy \
OCR output from a scanned document; if it's garbled, cut off, or you cannot clearly \
identify a real named condition or medication in it, return empty lists rather than \
inventing something plausible-sounding to fill them.

Deduplicate: if the same condition or medication appears more than once, list it \
once. If nothing qualifies for a list, return it empty — do not pad it with lab \
values, procedures, test names, or placeholders.

Reply with ONLY a JSON object of this exact shape, no other text, no markdown fence:
{"conditions": ["..."], "medications": [{"name": "...", "dosage": "..."}]}"""


# The prompt alone doesn't reliably stop a small local model from inventing
# placeholder medication names or listing procedures as if they were
# conditions — these deterministic filters catch what prompting misses.
_PLACEHOLDER_MED_NAME = re.compile(r"^medication\s*\d*$", re.IGNORECASE)
_PROCEDURE_KEYWORDS = (
    "enteroscopy", "colonoscopy", "endoscopy", "manometry", "biopsy",
    "x-ray", "xray", "ultrasound", "mri", "ct scan", " ecg", "electrocardiogram",
)
_INSTRUCTION_PHRASES = ("continue", "as prescribed", "as directed", "as advised", "as needed by doctor")


def _is_real_medication_name(name: str) -> bool:
    if _PLACEHOLDER_MED_NAME.match(name):
        return False
    lowered = name.lower()
    if any(phrase in lowered for phrase in _INSTRUCTION_PHRASES):
        return False
    # A real drug/product name isn't a full sentence or instruction.
    return len(name.split()) <= 4


def _is_real_condition(condition: str) -> bool:
    lowered = f" {condition.lower()} "
    return not any(keyword in lowered for keyword in _PROCEDURE_KEYWORDS)


async def _extract_from_one_document(text: str) -> dict:
    """Extracts conditions/medications from a single document's text. Empty
    on any failure — a bad document should never sink the others."""
    empty = {"conditions": [], "medications": []}
    text = text.strip()[:4000]
    if not text:
        return empty
    try:
        raw = await _complete(text, system=HISTORY_EXTRACTION_SYSTEM_PROMPT, timeout=60.0)
        try:
            data = json.loads(raw.strip())
        except json.JSONDecodeError:
            # Smaller local models sometimes wrap the JSON in a markdown
            # fence or a stray sentence despite instructions — pull out the
            # outermost {...} object rather than giving up.
            match = _JSON_OBJECT.search(raw)
            if not match:
                return empty
            data = json.loads(match.group(0))
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError):
        return empty

    conditions = [
        c.strip()
        for c in data.get("conditions", [])
        if isinstance(c, str) and c.strip() and _is_real_condition(c)
    ]
    medications = [
        {"name": m["name"].strip(), "dosage": str(m.get("dosage", "")).strip()}
        for m in data.get("medications", [])
        if isinstance(m, dict)
        and isinstance(m.get("name"), str)
        and m["name"].strip()
        and _is_real_medication_name(m["name"].strip())
    ]
    return {"conditions": conditions, "medications": medications}


async def extract_medical_history(documents: list[str]) -> dict:
    """Derives conditions + medications from the user's own uploaded reports,
    consultations, and prescriptions — every document, past and present,
    extracted individually and merged, so a growing document count never
    lets earlier documents get crowded out of one shared context budget.
    Returns empty lists on any failure, or when there's nothing to extract
    from — never blocks the Profile page."""
    documents = [d.strip() for d in documents if d and d.strip()]
    if not documents:
        return {"conditions": [], "medications": []}
    provider, _ = active_provider()
    if provider == "groq" and not settings.groq_api_key:
        return {"conditions": [], "medications": []}

    per_document = await asyncio.gather(*(_extract_from_one_document(doc) for doc in documents))

    conditions: dict[str, str] = {}
    medications: dict[str, dict] = {}
    for result in per_document:
        for condition in result["conditions"]:
            conditions.setdefault(condition.lower(), condition)
        for med in result["medications"]:
            medications.setdefault(med["name"].lower(), med)

    return {"conditions": list(conditions.values()), "medications": list(medications.values())}


GENERAL_TIP_THEMES = [
    "hydration",
    "sleep quality",
    "movement and exercise",
    "stress management",
    "nutrition",
    "posture and ergonomics",
    "preventive checkups",
    "mental wellbeing",
    "screen time and eye strain",
    "recovery and rest days",
]

GENERAL_TIP_FALLBACK = (
    "Set OLLAMA_MODEL or GROQ_API_KEY to generate a fresh wellness tip here."
)

GENERAL_TIP_SYSTEM_PROMPT = (
    "Write one short, plain-language, evidence-based general wellness tip a "
    "health app could show anyone. One or two sentences, no preamble, no "
    "markdown, no emoji. Do not address a specific medical condition — keep "
    "it general."
)


async def generate_general_tip() -> str:
    """A short, general wellness tip — regenerated fresh on every Home load,
    not tied to weather/AQI or any of the user's own data."""
    provider, _ = active_provider()
    if provider == "groq" and not settings.groq_api_key:
        return GENERAL_TIP_FALLBACK

    theme = random.choice(GENERAL_TIP_THEMES)
    try:
        content = await _complete(
            f"Topic: {theme}",
            system=GENERAL_TIP_SYSTEM_PROMPT,
            max_tokens=100,
            timeout=15.0,
        )
        return content or GENERAL_TIP_FALLBACK
    except (httpx.HTTPError, KeyError, IndexError):
        return GENERAL_TIP_FALLBACK


async def generate_reply(message: str) -> str:
    try:
        return await _complete(message, timeout=30.0)
    except (httpx.HTTPError, KeyError, IndexError):
        return (
            "I couldn't reach the model backend just now. Check that Ollama "
            "is running locally, or that GROQ_API_KEY is set, then try again."
        )


CHAT_ENTITY_EXTRACTION_SYSTEM_PROMPT = """You are a clinical entity extraction assistant. \
You are given a single chat message a patient sent to a health assistant. Extract two \
things the PATIENT states about themselves — never something the message merely asks \
about in the abstract (e.g. "what causes migraines?" reports nothing about the patient):

1. "symptoms": every symptom, medical condition, or diagnosis the patient states they \
are currently experiencing or have experienced.

2. "medications": every medication the patient states they are taking or have taken, \
each as {"name": ..., "dosage": ...}. "dosage" is whatever the message states (e.g. \
"400mg twice daily"), or an empty string if no dosage is mentioned. "name" must be a \
real drug or product name actually stated — never invented.

Only extract what's explicitly and unambiguously stated — never invent, guess, or infer \
something the message doesn't actually report. Most chat messages report neither — \
acknowledgments, greetings, general questions, and small talk are common, and the \
correct output for all of them is two empty lists. When in doubt, return empty lists \
rather than guessing.

Examples:
Message: "I've had a splitting headache since this morning."
Output: {"symptoms": ["headache"], "medications": []}

Message: "Thanks, that makes sense."
Output: {"symptoms": [], "medications": []}

Message: "What foods are good for heart health?"
Output: {"symptoms": [], "medications": []}

Message: "I've been taking ibuprofen 400mg for my knee pain since I fell yesterday."
Output: {"symptoms": ["knee pain"], "medications": [{"name": "Ibuprofen", "dosage": "400mg"}]}

Message: "ok sounds good, I'll try that"
Output: {"symptoms": [], "medications": []}

Reply with ONLY a JSON object of this exact shape, no other text, no markdown fence: \
{"symptoms": ["..."], "medications": [{"name": "...", "dosage": "..."}]}"""


async def extract_chat_entities(text: str) -> dict:
    """Pulls out symptoms and medications the user reports about themselves
    in a single chat message — feeds both the Home knowledge graph and the
    Profile history/medications. Empty on any failure or when nothing
    qualifies — never blocks the chat reply."""
    text = text.strip()
    empty = {"symptoms": [], "medications": []}
    if not text:
        return empty
    provider, _ = active_provider()
    if provider == "groq" and not settings.groq_api_key:
        return empty

    try:
        raw = await _complete(
            text[:2000],
            system=CHAT_ENTITY_EXTRACTION_SYSTEM_PROMPT,
            timeout=30.0,
            # A classification task, not creative writing — deterministic
            # output makes it far less likely to hallucinate an entity out
            # of a message that doesn't report one.
            temperature=0,
        )
        try:
            data = json.loads(raw.strip())
        except json.JSONDecodeError:
            match = _JSON_OBJECT.search(raw)
            if not match:
                return empty
            data = json.loads(match.group(0))
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError):
        return empty

    if not isinstance(data, dict):
        return empty

    symptoms = [
        s.strip()
        for s in data.get("symptoms", [])
        if isinstance(s, str) and s.strip() and _is_real_condition(s)
    ]
    medications = [
        {"name": m["name"].strip(), "dosage": str(m.get("dosage", "")).strip()}
        for m in data.get("medications", [])
        if isinstance(m, dict)
        and isinstance(m.get("name"), str)
        and m["name"].strip()
        and _is_real_medication_name(m["name"].strip())
    ]
    return {"symptoms": symptoms, "medications": medications}
