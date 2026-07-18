# API Service

FastAPI service for Nandhu's slice: company intake, source registration,
parsing, extraction, entity resolution, evidence-backed claims, and dossier
readback. Source connectors normalize public signals, search/research APIs,
registries, filings, patents, websites, and uploaded founder documents into
the agreed source schema.

## Run

```bash
uv sync --group dev
cp .env.example .env
uv run uvicorn services.api.app.main:app --reload
```

## Current Endpoints

- `GET /health`
- `POST /companies`
- `POST /sources`
- `POST /companies/{company_id}/documents`
- `POST /sources/pull`
- `POST /companies/{company_id}/ingest`
- `GET /companies/{company_id}/dossier`
- `GET /companies/{company_id}/claims`
- `GET /companies/{company_id}/evidence`
- `GET /companies/{company_id}/founders`
- `GET /companies/{company_id}/events`
- `POST /founders/search`
- `POST /founders/activate`
- `POST /voice/narrate`
- `GET /companies`
- `GET /founders`
- `POST /demo/seed`

## Source Connectors

`POST /sources/pull` supports:

- `github`
- `hacker_news`
- `product_hunt`
- `arxiv`
- `website`
- `perplexity`
- `exa`
- `tavily`
- `opencorporates`
- `sec_edgar`
- `patentsview`

Optional API keys:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` defaults to `gpt-5`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID` defaults to `JBFqnCBsd6RMkjVDRZzb`
- `ELEVENLABS_MODEL_ID` defaults to `eleven_multilingual_v2`
- `PRODUCT_HUNT_TOKEN`
- `PERPLEXITY_API_KEY`
- `EXA_API_KEY`
- `TAVILY_API_KEY`
- `OPENCORPORATES_API_TOKEN`

Missing keys do not break the demo. The connector records a fallback/search
surface instead, so the dossier still shows evidence gaps explicitly.

`OPENAI_API_KEY` enables structured parsing for `POST /founders/search`.
Without it, the endpoint uses a deterministic parser for demo stability.
Prompt text is use-case-specific and lives in `services/api/app/prompts.py`.

`ELEVENLABS_API_KEY` enables `POST /voice/narrate`, which returns an MP3 audio
narration for any supplied text. This can later power a voice mode for outreach,
memo readouts, or mobile/web playback.

## Person A Scope

- Deduplicates pulled sources by company, connector, and title.
- Timestamps signals with `observed_at` and sources with `submitted_at`.
- Updates founder scores after ingestion and persists them to
  SQLite at `data/processed/vcbrain.sqlite3`.
- Marks cold-start founders explicitly when evidence is sparse.
- Emits trigger events for new applications and signal threshold crossings.
- Parses uploaded `.txt`, `.md`, `.pdf`, `.pptx`, and `.docx` files into
  evidence-ready segments with LLM follow-up tasks attached.
- Seeds 10 demo founder profiles, 3 decks, and contradictions from
  `data/samples/`.
- Supports NL-style founder search and an outbound activation draft.

## Demo Seed

```bash
uv run --with fastapi --with pypdf --with python-docx --with python-pptx python scripts/seed_demo.py --reset
```

Set `VCBRAIN_DB_PATH` to isolate local, test, or deployed SQLite files.

The same seed flow is available through `POST /demo/seed`.
