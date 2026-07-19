# Iskra API

FastAPI backend for the HackNation Maschmeyer Group **The VC Brain** submission.
It handles company intake, document and source ingestion, evidence resolution,
founder memory, analysis jobs, collaboration, outcomes, assistant requests, and
voice transport.

See the [API reference](../../docs/api-reference.md) and
[architecture](../../docs/architecture.md) for the full system contract.

## Run

```bash
cp .env.example .env
uv sync --group dev
uv run uvicorn services.api.app.main:app --reload
```

Open <http://localhost:8000/docs> for generated OpenAPI documentation.

## Core Route Groups

- identity, usage, and organization thesis
- companies and persisted analysis jobs
- source registration, connector pulls, and document parsing
- dossier, claims, evidence, readiness, and timeline
- Founder Passports, ranked founders, search, and activation
- VC memory, comments, tasks, members, and invitations
- outcome simulation
- Iskra assistant, opportunity intent, transcription, and narration
- synthetic demo seeding

## Integrations

Optional environment keys enable OpenAI, ElevenLabs, Product Hunt, Tavily, Exa,
Perplexity, and OpenCorporates. GitHub, Hacker News, arXiv, websites, SEC EDGAR,
and patent search use public surfaces where available.

Missing credentials do not break the core demo. Connectors return explicit
fallback/search records, deterministic parsers remain available, and the UI can
show the resulting evidence gap.

For a live-key walkthrough, see the root README's
[live integrations section](../../README.md#use-live-api-integrations). Restart
the API after changing `.env`; the web client only needs `NEXT_PUBLIC_API_URL`.

Founder-specific Tavily or Exa enrichment is an explicit endpoint with a result
cap. Ordinary ingestion does not silently spend search credits.

## Documents

The parser handles text, Markdown, PDF, PowerPoint, Word, Excel, and common
image formats. Image OCR is optional and reports a warning when local Tesseract
is unavailable. Every parsed unit becomes an evidence-addressable segment.

## Persistence and Tenancy

The default SQLite path is `data/processed/vcbrain.sqlite3`; override it with
`VCBRAIN_DB_PATH`. Organization-scoped routes enforce the Clerk organization
boundary. Collaboration updates use optimistic versions and immediate
transactions.

## Test

```bash
uv run pytest -q
```

Tests use isolated databases and mocked paid integrations, so they do not
consume API credits.
