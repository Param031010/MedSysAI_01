# MedSys AI — Detailed Technical Reference

This file exists so an AI agent (or a new engineer) can make changes to this
codebase **without reading every source file first**. It documents every
module, function, data model, external integration, and non-obvious design
decision. If you're about to touch a file, find it in this doc first — it
tells you what already exists, why it's shaped the way it is, and what will
break if you change it carelessly.

Keep this file in sync: whenever you add/remove/rename a function, route,
model field, or env var, update the matching section here in the same
change.

---

## 1. What this project is

MedSys AI is a **personal, single-user, local-first health-intelligence
app**. No auth, no multi-tenancy. Four surfaces:

- **Home** — status banner (stable/serious), live weather+AQI, an
  LLM-generated general wellness tip, and a knowledge-graph alert card when
  the backend detects a risk pattern across logged symptoms.
- **Chat** — multi-session chat grounded on user-selected documents from My
  Data, with optional web search (manual "Deep Search" toggle or automatic
  LLM tool-choice), voice input (Whisper STT), and Markdown rendering.
- **Find Care** — TomTom map of nearby facilities, filterable by specialty,
  facility type (hospital/clinic/diagnostic center), and distance radius
  from a captured geolocation.
- **My Data** — upload PDFs/images of medical documents; the backend OCRs
  them, an LLM writes a structured report, and it's classified into a
  category. Cards are clickable (opens the full report in a modal) and
  selectable from Chat's composer to ground a conversation.
- **Profile** — static personal/medical record, read-only, no animation.

## 2. Tech stack

- **Frontend**: Vite + React 19 + TypeScript, Tailwind CSS v4 (`@theme` in
  `index.css`, no `tailwind.config.js`), Framer Motion, React Router,
  `react-markdown` + `remark-gfm`, `@tomtom-org/maps-sdk` + `maplibre-gl` v6.
- **Backend**: FastAPI (Python 3.12), MongoDB (local, via `pymongo`,
  synchronous driver used directly in async route handlers — fine at
  single-user scale), `sentence-transformers` for local embeddings,
  `pymupdf` for PDF rasterization, `ddgs` for web search.
- **LLMs**: all via **Groq Cloud** (`httpx` calls directly to
  `api.groq.com`, no SDK), with an **Ollama** fallback path for the main
  chat model only. See §7 for exactly which model does what.
- **External services**: Supermemory (knowledge graph + long-term memory),
  Firecrawl (web page scraping), TomTom (maps), OpenWeather (weather/AQI).

Run frontend: `cd frontend && npm run dev` (port 5173).
Run backend: `cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
(the heavy ML deps — `sentence-transformers`/torch — live in `backend/.venv`,
**not** the global Python, to avoid conflicting with other tools on this
machine; see §9).

---

## 3. Environment variables (`backend/.env`, see `backend/.env.example`)

| Variable | Default | Used by |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017` | `db.py` |
| `MONGODB_DB` | `medsys_ai` | `db.py` |
| `OLLAMA_HOST` | `http://localhost:11434` | `model_router.py` |
| `OLLAMA_MODEL` | `""` (empty) | `model_router.py` — **if empty, routes to Groq instead** |
| `GROQ_API_KEY` | `""` | everywhere in `model_router.py`, `ocr.py`, `chat.py` (transcribe) |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | main chat/report/classification/tip model |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | speech-to-text |
| `GROQ_VISION_MODEL` | `qwen/qwen3.6-27b` | OCR (My Data uploads) |
| `FIRECRAWL_API_KEY` | `""` | `web_search.py` — without it, deep search falls back to DuckDuckGo snippets instead of full scraped pages |
| `OPENWEATHER_API_KEY` | `""` | `weather.py` — without it, Home shows static mock environment data |
| `LOCATION_NAME` / `LOCATION_LAT` / `LOCATION_LNG` | Bengaluru coords | `weather.py` |
| `SUPERMEMORY_API_KEY` | `""` | `supermemory_client.py` — without it, no knowledge-graph alerts (never falls back to fake data) |
| `SUPERMEMORY_CONTAINER_TAG` | `medsys-symptoms` | symptom logging/detection |
| `SUPERMEMORY_CHAT_CONTAINER_TAG` | `medsys-chat` | chat messages, web content, documents |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | `embeddings.py` (sentence-transformers) |
| `CORS_ORIGINS` | `http://localhost:5173` | `main.py` |

Frontend (`frontend/.env.local`, see `.env.example`):

| Variable | Effect |
|---|---|
| `VITE_API_BASE_URL` | If unset, the whole app runs on mock data (`services/mocks.ts`) — no backend needed. If set, every `services/*.ts` function hits the real API. |
| `VITE_TOMTOM_API_KEY` | If unset, Find Care shows a CSS-drawn placeholder map instead of real TomTom tiles. |

---

## 4. MongoDB collections (no ODM — raw `pymongo`, accessed via `app/db.py::get_db()`)

- **`chat_sessions`** — `{id, title, createdAt, updatedAt, sourceIds: [str]}`.
  `sourceIds` is the list of My Data card ids (+ auto-added web source ids)
  the user has selected to ground *this* session. This is what makes
  grounding session-scoped instead of global.
- **`chat_messages`** — `{id, sessionId, role, content, createdAt}`.
- **`sources`** — one doc per "thing that can ground a chat": an uploaded
  My Data document, or a web page from deep search. Shape:
  `{id, title, kind, uploadedAt, excerpt, content, url?}`. `content` is the
  **full original text** (kept separately from chunks — see §8.1 for why).
  `id` for web sources is literally `f"web:{url}"`; for documents it's
  `f"src-{timestamp_ms}"`.
- **`chunks`** — the vector store. One doc per ~800-char overlapping chunk:
  `{sourceId, text, embedding: [float], index, type, sessionId?, role?, url?}`.
  `type` is one of the `ChatSource.kind` values, or `"chat"` for
  conversation-history chunks (`sourceId = f"chat:{sessionId}"`).
  `retrieve()` in `rag.py` does brute-force cosine similarity over this
  collection — fine at personal scale, no vector DB needed.

There is no user/auth collection — this is single-user by design.

---

## 5. Backend — file by file

### `app/main.py`
FastAPI app construction. Registers CORS middleware (`settings.cors_origins`)
and every router: `health`, `home`, `chat`, `facilities`, `profile`,
`symptoms`, `mydata`. If you add a new router, register it here.

### `app/config.py`
One `Settings` class, one `settings` singleton, all fields read from env
vars at import time via `os.getenv`. `load_dotenv()` runs at module import.
Add new env vars here, not scattered `os.getenv` calls elsewhere.

### `app/db.py`
`get_db() -> Database` — lazy singleton `MongoClient`, returns the
`settings.mongodb_db` database. Every router/service calls this to get a
handle; nothing caches collections beyond the client itself.

### `app/models.py`
All Pydantic request/response models. Notable ones:
- `ChatSourceKind` = `Literal["consultation", "consult_prescription", "prescription", "report", "web"]`
  — the My Data / Chat source category taxonomy. **If you add a category,
  update it here, in `model_router.DOCUMENT_CATEGORIES`, and in the
  frontend's `lib/sourceKinds.ts` + `components/mydata/CategoryFilter.tsx`.**
- `Facility.type` = `Literal["hospital", "clinic", "diagnostic_center"]` —
  unrelated to `ChatSourceKind`; this is Find Care's own taxonomy.
- `ChatSession.sourceIds: list[str] = []` — see §4.
- `HomeSnapshot.alert: KnowledgeGraphAlert | None` — **never hardcoded**;
  either a real Supermemory-detected pattern or `None`. See §8.4.

### `app/services/embeddings.py`
`embed(text) -> list[float]`, `embed_batch(texts) -> list[list[float]]`.
Lazy-loads one global `SentenceTransformer(settings.embedding_model)`
instance. All embeddings in this app are normalized, so cosine similarity
reduces to a plain dot product (see `rag.retrieve`).

### `app/services/rag.py`
The shared chunk/embed/store/retrieve pipeline. **Everything that can
ground a chat answer goes through `_store_source`.**
- `_chunk_text(text, size=800, overlap=150) -> list[str]` — naive
  character-window chunker, no sentence awareness.
- `_store_source(source_id, title, kind, content, url=None) -> dict` —
  chunks + embeds + upserts into `chunks` (deletes old chunks for that
  `source_id` first, so re-ingesting is idempotent) and upserts into
  `sources` **including the full `content`** (not reconstructed from
  chunks — see §8.1). Returns the `ChatSource`-shaped dict.
- `ingest_report(filename, kind, report) -> dict` — thin wrapper around
  `_store_source` with a fresh `src-{timestamp}` id. Called by
  `routers/mydata.py` after OCR + report generation.
- `store_web_content(url, title, content) -> dict` — wrapper with
  `source_id = f"web:{url}"`. Called by `web_search.deep_search`.
- `store_chat_message(session_id, role, content) -> None` — embeds one chat
  turn as a single chunk (no sub-chunking), `sourceId = f"chat:{session_id}"`,
  tagged `type: "chat"`. This is what lets later turns in the *same*
  session recall earlier ones.
- `retrieve(query, top_k=4, allowed_source_ids=None) -> list[dict]` —
  brute-force cosine similarity over `db.chunks`. **If `allowed_source_ids`
  is given, only searches chunks whose `sourceId` is in that list** — this
  is the session-scoping mechanism (see §8.2). If `None`, searches
  everything (not currently used by any caller — `chat.py` always passes an
  explicit list).

### `app/services/model_router.py`
All LLM calls live here. Talks to Groq directly via `httpx`
(`GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"`), or
Ollama's `/api/generate` for the main chat reply only.
- `active_provider() -> (provider, model)` — `"ollama"` if
  `settings.ollama_model` is non-empty, else `"groq"` with `settings.groq_model`.
- `check_reachable() -> bool` — used by `/health`; pings whichever provider
  is active.
- `WEB_SEARCH_TOOL` — the OpenAI-style function-calling tool schema passed
  to Groq for autonomous web-search decisions.
- `decide_web_search(user_message) -> str | None` — **Groq-only** (returns
  `None` immediately if Ollama is active or no API key). One tool-calling
  request with `tool_choice: "auto"` and a single `web_search` tool; if the
  model calls it, returns the query string from the tool-call arguments,
  else `None`. This is what powers automatic (non-button) deep search.
- `REPORT_SYSTEM_PROMPT` / `generate_report(ocr_text, filename) -> str` —
  turns raw OCR text into the structured Markdown report shown in My Data.
  Falls back to a raw-text dump if the model call fails, and to a "no
  readable text" message if `ocr_text` is empty.
- `DOCUMENT_CATEGORIES` / `CLASSIFY_SYSTEM_PROMPT` /
  `classify_document(ocr_text) -> str` — a second, separate Groq call that
  picks one of the 4 non-web `ChatSourceKind` values. Defaults to `"report"`
  on any failure (safest bucket). **`max_tokens=350`** — see §8.3 for why
  this can't be small.
- `GENERAL_TIP_THEMES` / `generate_general_tip() -> str` — Home's
  LLM-generated tip. Picks a random theme from a fixed list and asks for a
  short general wellness tip about it — **regenerated on every
  `/home/snapshot` call**, not cached. `max_tokens=400` for the same
  reasoning-model truncation reason as classification (§8.3). Falls back to
  a plain "add a GROQ_API_KEY" string, never fake AI-sounding content.
- `generate_reply(message) -> str` — the main chat-answer call. Routes to
  Ollama's `/api/generate` (prompt-based, not messages-based) or Groq's
  chat completions, depending on `active_provider()`. This is a **single
  string prompt**, not a messages array — grounding context is concatenated
  into `message` by the caller (`routers/chat.py`), not passed as separate
  turns.

### `app/services/ocr.py`
- `images_from_upload(filename, raw) -> list[str]` (base64 PNGs) — if
  `.pdf`, rasterizes up to `MAX_PAGES=12` pages via `pymupdf` at 150 DPI;
  otherwise treats `raw` as an image already and base64-encodes it as-is.
- `_ocr_batch(client, images_b64) -> str` — one Groq vision call with up to
  `MAX_IMAGES_PER_CALL=3` images in the content array, asks for verbatim
  transcription, strips any `<think>...</think>` reasoning block the model
  emits inline.
- `_ocr_batch_safe` — same, but swallows `httpx.HTTPError` and returns `""`
  so one bad batch doesn't fail the whole upload.
- `extract_text(images_b64) -> str` — splits into batches of 3, runs them
  **concurrently** via `asyncio.gather`, joins non-empty results.
  **`MAX_IMAGES_PER_CALL` must stay at 3** — `qwen/qwen3.6-27b` returns a
  400 above that, confirmed against a live error response (`"Too many
  images provided. This model supports up to 3 images"`), even though
  Groq's general vision docs say 5. Don't "fix" this back to 5.

### `app/services/supermemory_client.py`
All Supermemory REST calls (`SUPERMEMORY_BASE = "https://api.supermemory.ai"`).
Every write function is **best-effort**: wrapped in try/except, swallows
`httpx.HTTPError`, never raises into the caller. Every function returns
early (no-op) if `settings.supermemory_api_key` is empty.
- `log_symptom(name, occurred_on) -> None` — `POST /v4/memories`, container
  `supermemory_container_tag`, metadata `{type: "symptom", symptom, date}`,
  `temporalContext.eventDate`.
- `RISK_RULES` — hardcoded list of pattern-detection rules, currently just
  one: chest pain + night sweats within 7 days → cardiac risk headline.
  **To add a new detectable pattern, add an entry here** — this is a rule
  list, not itself "hardcoded output" (see §8.4 for the distinction).
- `_latest_occurrence(client, symptom) -> str | None` — `POST /v4/search`
  with a metadata filter on `symptom`, returns the max `date` from results.
- `detect_alert() -> dict | None` — for each `RISK_RULES` entry, looks up
  the latest occurrence of both symptoms; if both exist and are within
  `max_days_apart`, returns a `KnowledgeGraphAlert`-shaped dict. Returns
  `None` immediately if no API key. **This is the only source of
  `HomeSnapshot.alert` — there is no hardcoded fallback alert anywhere.**
- `reachable() -> bool` — unused by any current route, available for a
  future `/health`-style check.
- `log_chat_message(session_id, role, content) -> None` — every chat turn,
  container `supermemory_chat_container_tag`, metadata
  `{type: "chat", sessionId, role}`.
- `log_web_content(query, url, title, content) -> None` — every deep-search
  result, metadata `{type: "web", url, title, query}`, content truncated to
  8000 chars.
- `log_document(source_id, title, kind, content) -> None` — every My Data
  upload's generated report, metadata `{type: "document", sourceId, title, kind}`.

### `app/services/weather.py`
- `_pm25_to_aqi(pm25) -> int` — EPA breakpoint table, PM2.5 µg/m³ → US AQI
  0–500. Hardcoded breakpoints table (`_PM25_BREAKPOINTS`) — this is a
  legitimate physical-constant table, not app logic to remove.
- `_aqi_category(aqi) -> str` — Good/Moderate/Unhealthy for Sensitive
  Groups/Unhealthy/Very Unhealthy/Hazardous.
- `tip_for(aqi_category) -> str` — the **weather-based** tip shown in
  Home's "Today's tip" card (distinct from `generate_general_tip`, which is
  LLM-generated and unrelated to weather).
- `get_environment_snapshot() -> dict | None` — two OpenWeather calls
  (current weather + air pollution), returns `None` if no API key or either
  call fails (caller falls back to `mock_data.HOME_SNAPSHOT["environment"]`).

### `app/services/web_search.py`
- `_ddg_search(query, max_results) -> list[dict]` — sync `DDGS().text()`
  call (the `ddgs` package is sync-only).
- `_scrape(client, url) -> str | None` — Firecrawl `POST /v2/scrape`,
  `formats: ["markdown"]`. Returns `None` if no `FIRECRAWL_API_KEY` or the
  call fails.
- `deep_search(query) -> list[dict]` (`[{title, url}]`) — runs DDGS search
  in a thread (`asyncio.to_thread`, since `ddgs` is sync), scrapes the top
  `MAX_SCRAPED=3` results via Firecrawl (falling back to the DuckDuckGo
  result's own `body` snippet if Firecrawl isn't configured or fails),
  stores each via `rag.store_web_content` + `supermemory_client.log_web_content`.
  Called from `routers/chat.py`, either because the user hit "Deep Search"
  or because `model_router.decide_web_search` chose to.

### `app/routers/health.py`
`GET /health` → `ModelStatus` — `active_provider()` + `check_reachable()`.
Drives the Chat page's model-indicator dot.

### `app/routers/home.py`
`GET /home/snapshot` → `HomeSnapshot`. Starts from `mock_data.HOME_SNAPSHOT`
as a base (environment/tip only — **not** status/alert, which always come
from live logic), overlays live weather if available, **always** computes
`alert`/`status`/`statusNote` from `supermemory_client.detect_alert()`
(never the mock), and **always** calls `model_router.generate_general_tip()`
fresh. This route is the single most "assembled from multiple live sources"
endpoint in the app — read it before changing Home's data shape.

### `app/routers/chat.py`
The biggest router. Key pieces:
- `_remember_message(session_id, role, content)` — writes to both
  `rag.store_chat_message` and `supermemory_client.log_chat_message`. Called
  for both the user's message and the assistant's reply.
- `GET/POST /chat/sessions`, `GET /chat/sessions/{id}/messages` — CRUD-ish
  session management. New sessions start with `sourceIds: []`.
- `PUT /chat/sessions/{id}/sources` — body `{sourceIds: [str]}`, sets the
  session's grounding selection. Called every time the user checks/unchecks
  a card in the frontend's `SourcePicker`.
- `POST /chat/sessions/{id}/messages` — the core turn:
  1. Persists + remembers the user message.
  2. `search_query = body.content if body.deepSearch else await decide_web_search(body.content)`.
  3. If `search_query`, runs `web_search.deep_search` and **`$addToSet`s**
     the resulting `web:{url}` ids into the session's `sourceIds` in Mongo
     (so they show up in future turns' allowed set too, and the frontend
     picks them up on its next session refetch).
  4. Builds `allowed_source_ids = [f"chat:{session_id}", *session.sourceIds, *web_source_ids]`
     and calls `rag.retrieve(body.content, top_k=8, allowed_source_ids=...)`.
     **This is the session-scoping — an unselected document is invisible to
     retrieval no matter how relevant it is.**
  5. Concatenates retrieved chunk text into the prompt (if any), calls
     `generate_reply`.
  6. Persists + remembers the assistant message, updates session
     `updatedAt` (and `title` from the first 60 chars of the first message,
     if this was the first turn).
- `GET /chat/sources` — all `db.sources`, or `mock_data.CHAT_SOURCES` if
  empty. Used by both Chat's picker (all available cards) and My Data's
  grid (same data, different page).
- `GET /chat/sources/{source_id:path}/content` — **note the `:path`
  converter** — required because web source ids embed full URLs with `/`
  in them; a plain `{source_id}` would only match up to the first slash.
  Returns `source["content"]` directly if present, else falls back to
  joining chunks (legacy-doc compatibility path — new writes always have
  `content` via `rag._store_source`).
- `POST /chat/transcribe` — multipart audio → Groq Whisper
  (`/audio/transcriptions`) → `{text}`.

**Removed on purpose, don't re-add**: there used to be a `POST /chat/upload`
that let the Composer upload a file directly into the current chat. It's
gone — uploads now only happen via My Data (`/mydata/upload`), and Chat's
paperclip button opens a picker over existing My Data cards instead
(`SourcePicker.tsx`). If you're tempted to add direct upload back to Chat,
talk to the user first — this was an explicit architecture change.

### `app/routers/mydata.py`
`POST /mydata/upload` — the OCR → report → classify → store pipeline:
1. `.txt`/`.md` → decode directly as text, skip OCR.
2. Else → `ocr.images_from_upload` + `ocr.extract_text`.
3. `model_router.generate_report(extracted_text, filename)`.
4. `model_router.classify_document(extracted_text)`.
5. `rag.ingest_report(filename, kind, report)` + `supermemory_client.log_document`.
Returns the `ChatSource`. There's no separate list/detail endpoint for My
Data — the frontend reuses `GET /chat/sources` and
`GET /chat/sources/{id}/content` (see `frontend/src/services/mydata.ts`).

### `app/routers/facilities.py`
`GET /facilities?specialty=&type=` — filters `mock_data.FACILITIES` by both
params (AND, not OR) if given. All facility data is static mock data (no
real facility-finder API integrated) — that's intentional for this build,
not a bug.

### `app/routers/profile.py`
`GET /profile` → static `mock_data.PROFILE`. No write endpoint exists.

### `app/routers/symptoms.py`
`POST /symptoms` `{name, date}` → `supermemory_client.log_symptom`. Returns
503 if no `SUPERMEMORY_API_KEY`. This is how the knowledge-graph alert on
Home actually gets data — nothing in the current UI calls this endpoint
yet (no symptom-logging UI exists); it's exercised via
`backend/scripts/seed_symptoms.py` or direct API calls today.

### `app/services/mock_data.py`
Seed/fallback data. **Only used as a genuine fallback** (weather down,
Mongo empty, etc.) — never overrides live data that's actually available.
`HOME_SNAPSHOT["alert"]` is `None` and `HOME_SNAPSHOT["status"]` is
`"stable"` by design (see §8.4 — don't put a fake alert back here).

### `backend/scripts/seed_symptoms.py`
One-off script: logs "chest pain" (Aug 17) and "night sweats" (Aug 20) via
`supermemory_client.log_symptom`, matching the one `RISK_RULES` entry, so
Home's alert card has something real to detect on a fresh Supermemory
container. Run with `python scripts/seed_symptoms.py`. Not idempotent —
re-running adds duplicate memories.

---

## 6. Frontend — file by file

### Entry / shell
- `main.tsx` — mounts `<App>` inside `<BrowserRouter>`.
- `App.tsx` — all routes, wrapped in one `<NavShell>` layout route: `/`
  (Home), `/chat`, `/find-care`, `/my-data`, `/profile`.
- `components/layout/NavShell.tsx` — `NAV_ITEMS` array (icon+label+path) is
  the single source of truth for both the desktop left-rail and mobile
  bottom-tab nav. Add a page here to add it to both.

### `lib/`
- `motion.ts` — shared Framer Motion variants: `staggerContainer(stagger, delay)`,
  `riseIn`/`riseInReduced` (page-load reveal), `fadeUpMessage` (chat
  bubbles). Always pair `riseIn` with a `useReducedMotion()` check that
  swaps to `riseInReduced` — see any page for the pattern.
- `geo.ts` — `haversineKm(a, b)`, used by Find Care's distance sort/filter.
- `sourceKinds.ts` — `KIND_ICON` / `KIND_LABEL` maps keyed by
  `ChatSourceKind`. **Single source of truth** for how each category
  renders — used by `DataCard`, `SourceModal`, `SourcesPanel`,
  `SourcePicker`. Don't redefine these maps locally in a component again.

### `hooks/useReducedMotion.ts`
Wraps `matchMedia('(prefers-reduced-motion: reduce)')` in a hook. Used
throughout for conditional animation variants and to skip the Thread's
draw-in animation.

### `types/index.ts`
All shared TS types. Mirrors the backend Pydantic models field-for-field —
**if you change a Pydantic model's shape, update the matching interface
here in the same commit**, or the frontend will silently get `undefined`
for new fields. Key ones: `HomeSnapshot`, `ChatSource`/`ChatSourceDetail`,
`ChatSession` (has `sourceIds: string[]`), `ChatSourceKind`, `Facility`
(has `type: FacilityType`), `ProfileRecord`.

### `services/` (all API access goes through here — components never call `fetch` directly)
- `client.ts` — `apiFetch<T>(path, init)` (JSON), `apiUpload<T>(path, formData)`
  (multipart, no forced `Content-Type` so the browser sets the boundary),
  `isMockMode` (`true` iff `VITE_API_BASE_URL` is unset — every service
  function branches on this), `mockDelay(value, ms)` (simulates latency in
  mock mode so loading states are visible/testable).
- `mocks.ts` — every mock fixture, typed against the real interfaces. This
  is what the whole app runs on when no backend is configured.
- `home.ts`, `profile.ts`, `facilities.ts` — thin, one function each.
- `chat.ts` — session CRUD (`listChatSessions`, `createChatSession`,
  `setSessionSources`), messages (`getSessionMessages`, `sendSessionMessage`),
  `getChatSources` (all available grounding cards), `getSourceContent`
  (full report for the modal), `transcribeAudio` (blob → text via
  `/chat/transcribe`). **No `uploadChatSource` here anymore** — removed
  along with the backend's `/chat/upload` (see §5 note).
- `mydata.ts` — `listMyData` / `getMyDataContent` are literally aliases of
  `chat.ts`'s `getChatSources`/`getSourceContent` (`export const listMyData
  = getChatSources`) — same backend data, two semantically-named entry
  points for two different pages. `uploadMyData(file)` is the only new
  logic, hits `POST /mydata/upload`.

### `components/Thread.tsx`
The signature device. `<Thread path="M0 20 C..." viewBox="0 0 96 40" />` —
an SVG path with a gradient stroke that draws itself in via
`stroke-dashoffset` animation on mount (or fades in instantly if reduced
motion). **Use once per page**, per the design brief — currently: Home
(AQI→tip connector) and the alert card (symptom-node connector). Don't
scatter it as decoration elsewhere.

### `components/SourceModal.tsx`
Shared full-report reader, used by both Chat (`pages/Chat.tsx`) and My Data
(`pages/MyData.tsx`). Fetches `getSourceContent(source)` on open, renders
via `<Markdown>` (not plain text — all stored content is Markdown now,
including OCR'd reports). Square-ish modal (`sm:aspect-square`, capped
`max-h-[85vh]`), closes on Escape, backdrop click, or the X button. Has an
external-link button when `source.url` is set (web sources only).

### `components/chat/`
- `Markdown.tsx` — `<Markdown content={string} />`, the shared
  `react-markdown` + `remark-gfm` renderer with custom component overrides
  (styled tables wrapped in `overflow-x-auto` — **don't remove that
  wrapper**, wide tables broke the layout before it was added; see git
  history / §8 for context if you're wondering why it's there).
- `MessageBubble.tsx` — user messages are a plain filled bubble; assistant
  messages have no bubble background, just a left teal rule + `<Markdown>`
  (deliberately reads like a clinical note, not a casual chat UI).
- `TypingIndicator.tsx` — three pulsing dots + optional `label` prop (used
  to show "Searching the web…" during deep search specifically).
- `ModelIndicator.tsx` — renders `GET /health` result as "Provider ·
  model" with a colored dot (teal = reachable, clay = not).
- `SessionList.tsx` — left collapsible panel, "New chat" button + session
  list. Purely presentational; all state lives in `pages/Chat.tsx`.
- `SourcePicker.tsx` — the popover opened by the composer's paperclip.
  Checkbox list of `availableSources`, toggling calls `onToggle(id)` up to
  `Chat.tsx`, which persists via `setSessionSources`. Includes a "+ Add
  more in My Data" link (`react-router-dom` `<Link>`).
- `SourcesPanel.tsx` — right "Grounded on" panel. **Receives only the
  already-filtered (selected) sources as a prop** — it doesn't know about
  "all sources", that filtering happens in `Chat.tsx`
  (`groundedSources = allSources.filter(s => selectedSourceIds.includes(s.id))`).
  Cards are buttons; clicking calls `onOpenSource` up to open `SourceModal`.
- `Composer.tsx` — the input bar. Owns: message text, deep-search toggle
  (one-shot, resets after send), the source-picker popover open/close
  state (closes on outside click via a `mousedown` listener), and the
  mic-recording/transcription state machine (`MediaRecorder` →
  `transcribeAudio` → appends result to the text field, doesn't auto-send).
  Props: `onSend(content, deepSearch)`, `availableSources`,
  `selectedSourceIds`, `onToggleSource`, `disabled`.

### `components/home/`
- `StatusBanner.tsx` — big "Stable"/"Serious" word. Only pulses
  (`animate={{opacity:[1,0.86,1]}}`) when `status === "serious"` — this is
  deliberate per the design brief (motion itself signals urgency; Stable
  stays still).
- `EnvironmentCard.tsx` — temp/condition/humidity/AQI + pollutant chip grid.
  `aqiTone(aqi)` colors the AQI number (teal ≤50, stone ≤100, clay above).
- `TipsCard.tsx` — **generic**, takes `tip`, `heading` (default "Today's
  tip"), `icon` (default `Sparkle`). Reused for both the weather tip and
  the new LLM general tip (`heading="General tip" icon={Lightbulb}`) —
  don't fork a second component for the general tip, extend this one's
  props instead if you need a third variant.
- `AlertCard.tsx` — the knowledge-graph signal card. Renders the two
  symptom nodes connected by a `<Thread>`. Only rendered when
  `data.alert` is non-null (`Home.tsx` guards with `{data.alert && ...}`).

### `components/findcare/`
- `MapView.tsx` — branches on `VITE_TOMTOM_API_KEY` at module load: real
  `TomTomMapView` or `PlaceholderMap` (CSS-positioned dots over a graph-paper
  background, bounds computed from facilities + user location). **Read §8.5
  before touching the real map** — the worker setup here is fragile and
  intentional, not accidental complexity.
  - `TomTomMapView`: constructs one `TomTomMap`, adds a teal `Marker` per
    facility (click → `onSelect`), adds a distinct pulsing dot marker for
    `userLocation` (custom `createUserLocationElement()`, not a default
    pin), and `fitBounds`s to every facility + user location **only when
    `userLocation` changes** (not on every facility-list change — that's
    deliberate, see the effect's dependency array).
- `FacilityCard.tsx`, `SpecialtyChips.tsx`, `TypeFilter.tsx`,
  `LocationControl.tsx` — filter/display components, all presentational,
  state lives in `pages/FindCare.tsx`.

### `components/mydata/`
- `DataCard.tsx` — one grid card. `processing` prop shows a spinner +
  "Processing…" and disables the click (used for the optimistic placeholder
  while an upload is in flight).
- `CategoryFilter.tsx` — the 5-category dropdown (`ChatSourceKind` values).

### `components/profile/Field.tsx`
One label/value row for the definition-list layout. No animation (Profile
is deliberately the calmest page).

### `pages/`
- `Home.tsx` — fetches `getHomeSnapshot()` once on mount. Layout order:
  status banner → (environment card + tips card, connected by one Thread)
  → general-tip card → alert card (conditional). **Don't add a second
  `<Thread>` here** — one per page is the rule.
- `Chat.tsx` — the most stateful page. Owns `sessions`, `activeSessionId`,
  `messages`, `allSources` (every My Data/web card that exists),
  `modelStatus`. Derives `activeSession`/`selectedSourceIds`/`groundedSources`
  from that state rather than tracking them separately (single source of
  truth — see the `useMemo`s at the top of the component). `handleSend`
  optimistically appends the user message, calls `sendSessionMessage`,
  then refreshes both sessions (for updated `sourceIds`/title) and
  `allSources` (in case deep search or a fresh upload added new cards).
- `FindCare.tsx` — fetches all facilities once, does **all filtering
  client-side** (`specialty`, `facilityType`, `radius`, computed
  `distanceKm` via `haversineKm` once `userLocation` is captured — replaces
  the static mock `distanceKm` and re-sorts ascending).
  `handleCaptureLocation` wraps `navigator.geolocation.getCurrentPosition`.
- `MyData.tsx` — fetches `listMyData()` once. `handleFileChange` does the
  optimistic-placeholder-card dance (same pattern as Chat's old upload
  flow): push a temp "Processing…" card, call `uploadMyData`, swap it for
  the real result or remove it + show an error on failure. `category`
  state filters the grid client-side.
- `Profile.tsx` — fetch once, render, no interactivity beyond loading state.

---

## 7. Which LLM does what (all configurable via env, defaults shown)

| Task | Function | Model | Notes |
|---|---|---|---|
| Chat replies | `generate_reply` | `openai/gpt-oss-20b` (Groq) or Ollama | Single-string prompt, not a messages array |
| Auto web-search decision | `decide_web_search` | `openai/gpt-oss-20b` (Groq only) | Real tool-calling, `tool_choice: "auto"` |
| My Data report writing | `generate_report` | `openai/gpt-oss-20b` | Markdown output, `max_tokens` unset (long-form) |
| My Data category classification | `classify_document` | `openai/gpt-oss-20b` | `max_tokens=350` — see §8.3 |
| Home general tip | `generate_general_tip` | `openai/gpt-oss-20b` | `max_tokens=400`, fresh every request, random theme |
| OCR | `ocr.extract_text` | `qwen/qwen3.6-27b` (Groq vision) | Max 3 images/request — hard vendor limit |
| Speech-to-text | `/chat/transcribe` | `whisper-large-v3-turbo` (Groq) | Direct multipart proxy, no local processing |

---

## 8. Design decisions & gotchas (read before "fixing" these)

### 8.1 Why `sources.content` is stored separately from chunks
`_chunk_text` uses 150-char overlap between chunks (needed so retrieval
doesn't miss content that straddles a chunk boundary). Early on, the
`/chat/sources/{id}/content` endpoint reconstructed the full report by
joining all chunks with `"\n\n"` — which **duplicated the overlapping
text**, visibly breaking Markdown tables (a table row would appear twice).
Fixed by storing the full original `content` directly on the `sources` doc
in `_store_source`, and having the content endpoint prefer that field,
falling back to chunk-joining only for legacy docs that predate the fix.
**Don't revert to chunk-joining as the primary path.**

### 8.2 Why grounding is session-scoped, not global
Originally `rag.retrieve()` searched *all* chunks unconditionally — meaning
any document ever uploaded, and any chat message from *any* session, could
leak into any other session's answers. Fixed by adding
`allowed_source_ids` to `retrieve()` and always passing an explicit list
from `chat.py`: the session's own chat history + whatever My Data cards
the user explicitly selected + whatever deep search just found. An
unselected document is now provably invisible to the model — verified live
by asking the same question before/after selecting a card. **If you add a
new caller of `retrieve()`, decide its `allowed_source_ids` deliberately —
don't pass `None` without a reason.**

### 8.3 Why some `max_tokens` values look oddly large for short answers
`openai/gpt-oss-20b` is a reasoning model — it emits an internal
chain-of-thought before the final answer, and that reasoning consumes
`max_tokens` budget *before* any answer tokens. With a low budget (e.g. 20
or 120), the response can hit `finish_reason: "length"` with an **empty**
`content` field while `reasoning` has partial text — confirmed live via a
direct Groq call. `classify_document` (350) and `generate_general_tip`
(400) were both bumped after hitting this in production. **If you add a
new short-output Groq call on this model, budget at least ~300–400
tokens, not the "obviously enough" number you'd expect for a one-line
answer**, or add explicit handling for empty `content`.

### 8.4 Why nothing on Home is ever a hardcoded fallback
`mock_data.HOME_SNAPSHOT` used to include a fake alert (`"kg-1"`,
chest-pain/night-sweats) that displayed whenever Supermemory wasn't
queried. This was misleading — it looked like a real detection. Now:
`HOME_SNAPSHOT["alert"]` is `None` and `["status"]` is `"stable"`, and
`routers/home.py` **always** calls `supermemory_client.detect_alert()`
(which itself already degrades to `None` gracefully with no key) rather
than gating that call behind a key-presence check. The only thing that
still uses `mock_data.HOME_SNAPSHOT` as a fallback is `environment`/`tip`
(weather-based — legitimately fine to show placeholder weather text when
`OPENWEATHER_API_KEY` is absent, since that's clearly a "map preview"-style
placeholder, not a fabricated personal health finding).

### 8.5 The MapLibre/TomTom worker setup is load-bearing, not incidental
`components/findcare/MapView.tsx` does two things that look unnecessary
until you remove them:
1. `import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"`
   + `setWorkerUrl(maplibreWorkerUrl)` at module scope, before any map is
   constructed. MapLibre v6 can't reliably resolve its own worker via
   `import.meta.url` inside a bundler — without this, the map silently
   never paints (style/tiles/sprites all fetch fine, `isStyleLoaded()`
   never becomes `true`, no error event ever fires). This is a documented
   MapLibre v6 + bundler issue, not specific to this app.
2. `vite.config.ts` → `optimizeDeps.exclude: ['maplibre-gl', '@tomtom-org/maps-sdk']`
   — without this, Vite's dev-server dependency pre-bundling can produce a
   second, differently-configured copy of `maplibre-gl` that never receives
   the `setWorkerUrl()` call above.

Also: the old CDN-script-tag approach to loading TomTom's SDK (`<script
src="api.tomtom.com/maps-sdk-for-web/cdn/6.x/...">`) is **dead** — TomTom
retired that endpoint Feb 1, 2026. The app now uses the real npm packages
(`@tomtom-org/maps-sdk`, `maplibre-gl`). Don't reintroduce a CDN script tag.

### 8.6 `qwen/qwen3.6-27b` image limit
See §5 `ocr.py` — 3 images per request is a hard vendor limit for this
specific model, confirmed against a live 400 response, not a
conservative choice. `MAX_PAGES=12` in `ocr.py` controls how many pages of
a long PDF get processed (batched into groups of 3, run concurrently) —
raising it increases upload latency roughly linearly.

### 8.7 Why the composer has no direct file upload anymore
Explicit architecture change, not a regression: uploads happen exclusively
through My Data (richer pipeline — OCR, LLM report, classification). Chat's
paperclip opens `SourcePicker` (select existing cards) instead. See the
"Removed on purpose" note in §5's `routers/chat.py` section.

### 8.8 Heavy Python deps live in `backend/.venv`, not global Python
`sentence-transformers` (pulls in `torch`) and other backend deps were
deliberately installed into a project-local venv instead of the user's
global Python, because the global environment is shared with many other
tools (anthropic, langchain, tensorflow, streamlit, etc.) with conflicting
version pins. Always run the backend via
`backend\.venv\Scripts\python.exe -m uvicorn app.main:app`, or reinstall
`requirements.txt` into the global env at your own risk if you need
`uvicorn app.main:app` to work standalone.

---

## 9. Adding a new feature — where things go

- **New page**: add to `App.tsx` routes + `NavShell.NAV_ITEMS`, create
  `pages/Foo.tsx`, add any new types to `types/index.ts`, add a
  `services/foo.ts` if it needs its own API calls (mock-mode branch
  included), add fixtures to `services/mocks.ts`.
- **New backend data that should ground chat**: route it through
  `rag._store_source` (or one of its wrappers) so it lands in both
  `db.chunks` (retrieval) and `db.sources` (card display), and add a
  matching `supermemory_client.log_*` call so it's also in long-term
  memory. Don't write directly to `db.chunks`/`db.sources` from a new
  router — reuse the existing helpers.
- **New LLM-backed feature**: add the function to `model_router.py`
  (co-locate all Groq/Ollama calls there), remember the reasoning-model
  `max_tokens` gotcha (§8.3), and give it a real Groq-key-absent fallback
  string rather than raising.
- **New env var**: add to `Settings` in `config.py` **and** to
  `.env.example` with a comment explaining what breaks/degrades without it.
