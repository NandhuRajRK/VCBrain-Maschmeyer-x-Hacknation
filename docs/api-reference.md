# API Reference

The backend runs at `http://localhost:8000` by default. FastAPI also exposes
the generated contract at `/docs`, `/redoc`, and `/openapi.json`.

Unless noted otherwise, request and response bodies are JSON. The canonical
response contracts live in [packages/shared/schemas.json](../packages/shared/schemas.json).

## Run the API

```bash
uv sync --group dev
cp .env.example .env
uv run uvicorn services.api.app.main:app --reload
```

## Health and collections

### `GET /health`

Returns `{ "status": "ok" }`.

### `GET /companies`

Lists all stored companies.

### `GET /founders`

Lists all stored founders, including persisted Founder Passport fields.

## Company intake

### `POST /companies`

Creates a company and emits a `new_application` event.

```json
{
  "name": "DemoCo",
  "website": "https://demo.example",
  "sector": "AI infrastructure",
  "stage": "seed",
  "geography": "Berlin",
  "description": "GPU workload routing for AI teams."
}
```

Returns `201 Company`. Profile fields include `field_provenance` and
`field_confidence`.

### `POST /sources`

Registers a source for an existing company. It does not ingest the source until
`POST /companies/{company_id}/ingest` is called.

```json
{
  "company_id": "company_...",
  "source_type": "pitch_deck",
  "title": "Founder deck",
  "text": "Sector: AI infrastructure. Stage: seed.",
  "url": null,
  "metadata": {
    "founders": [
      {
        "name": "Mira Shah",
        "role": "CEO",
        "work_history": [],
        "education_history": [],
        "previous_ventures": []
      }
    ]
  }
}
```

Returns `201 Source`. A duplicate URL or content fingerprint returns `409` with
the existing source ID. Supported detailed source types include documents,
public signals, websites, registries, research, and `other`; the normalized
`source_category` is one of `github`, `hacker_news`, `arxiv`, `product_hunt`,
`press`, `pitch_deck`, or `founder_doc`.

### `POST /companies/{company_id}/documents`

Uploads a pitch deck or founder document as multipart form data:

```bash
curl -X POST http://localhost:8000/companies/company_123/documents \
  -F 'file=@pitch-deck.pdf'
```

Supported formats are `.txt`, `.md`, `.pdf`, `.pptx`, and `.docx`. The response
contains the created source, parsed segments, and follow-up `llm_tasks`.
Duplicate content returns `409`; an unknown company returns `404`.

### `POST /sources/pull`

Runs one or more normalized connectors and queues the returned signals.

```json
{
  "company_id": "company_...",
  "connectors": ["github", "hacker_news", "arxiv"],
  "query": "DemoCo AI",
  "github_user": "demo",
  "arxiv_query": "DemoCo AI",
  "website_url": "https://demo.example"
}
```

Returns `SourcePullResult` with `created_sources` and `deduped_sources`.

### `POST /companies/{company_id}/ingest`

Processes queued sources. It parses segments, extracts claims and evidence,
updates company profile provenance, resolves founders, enriches Founder
Passports, adjudicates claims, refreshes Founder Scores, and persists the
result.

Returns `IngestionRun` with accepted source count, parsed segment count,
extracted claim count, and warnings.

## Dossier and memory

### `GET /companies/{company_id}/dossier`

Returns the complete `Dossier`:

```text
company, founders, sources, segments, claims, evidence,
founder_scores, trigger_events
```

Claims reference evidence through `evidence_ids`. Use the claim status and
verification fields to distinguish supported, disputed, missing, founder-backed,
and independently supported facts.

### `GET /companies/{company_id}/claims`

Returns the company's claim-evidence ledger.

### `GET /companies/{company_id}/evidence`

Returns evidence reachable from the company's claims, including source
independence, freshness, directness, reliability, and confidence reason.

### `GET /companies/{company_id}/founders`

Returns the founders attached to a company.

### `GET /companies/{company_id}/founder-passports`

Returns one `FounderPassport` per founder. Each work, education, or previous
venture fact includes `source_ids` and fact confidence. `gaps` describes what is
unverified; it does not prove the missing history does not exist.

### `GET /founders/{founder_id}/passport`

Returns one Founder Passport. Unknown founders return `404`.

### `GET /companies/{company_id}/readiness`

Returns `DecisionReadiness` with:

- a 0-100 diligence-completeness score
- component scores
- explicit blockers
- contradiction count and cold-start state
- ranked `next_actions` with expected readiness gain

Readiness is not a fourth investment axis.

### `GET /companies/{company_id}/timeline`

Returns the decision flight recorder: immutable Founder Score snapshots and
deltas, claim status changes, trigger events, and current readiness.

### `GET /companies/{company_id}/events`

Returns all trigger events for a company.

## Discovery and outreach

### `POST /founders/search`

Accepts natural-language sourcing criteria and returns ranked `SearchMatch`
objects.

```json
{
  "query": "technical founder, Berlin, AI infrastructure, no prior VC backing",
  "limit": 5
}
```

OpenAI parses the query into structured filters when configured. The fallback
parser keeps the demo functional without a key. Ranking uses matched company
fields, founder traits, evidence quality, and persistent Founder Score signals;
it is not an investment recommendation.

### `POST /founders/activate`

Creates an outbound activation draft for a founder.

```json
{
  "founder_id": "founder_...",
  "context": "Your recent technical and launch signals"
}
```

The draft uses supported claims and prioritizes independently supported
evidence. Disputed evidence is excluded from `evidence_ids`.

## Voice

### `POST /voice/query`

Accepts multipart audio with `audio`, optional `limit`, `speak_response`, and
`voice_id`. Audio is transcribed by OpenAI, routed into a typed intent, and
then executed for founder search or returned as a handoff for Julia's dossier,
memo, decision, or activation views.

The upload limit is 25 MB. Missing OpenAI configuration returns `503`; upstream
transcription failures return `502`.

### `POST /voice/query/text`

Runs the same routing contract without audio, useful for browser tests and
mobile clients before microphone integration.

```json
{
  "transcript": "Find technical founders in Berlin",
  "limit": 5,
  "speak_response": false
}
```

### `POST /voice/narrate`

Accepts `{ "text": "...", "voice_id": "optional" }` and returns
`audio/mpeg` using ElevenLabs. Missing `ELEVENLABS_API_KEY` returns `503`.

## Demo

### `POST /demo/seed?reset=true`

Seeds 10 synthetic companies and founders, sample pitch decks, sourced Founder
Passport histories, claims, evidence, and staged contradictions. Reset is
intended for local demo databases only.

The AetherGrid flow begins with one score snapshot. Ingesting the queued HN
correction creates a contradiction event, a second score snapshot, and a
readiness drop.

## Common errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid request or empty audio. |
| `404` | Company or founder does not exist. |
| `409` | Duplicate source or document. |
| `413` | Voice upload exceeds 25 MB. |
| `422` | FastAPI/Pydantic validation failure. |
| `502` | Upstream OpenAI or ElevenLabs request failed. |
| `503` | Required voice API key is not configured. |
