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
- `GET /companies/{company_id}/readiness`
- `GET /companies/{company_id}/timeline`
- `GET /companies/{company_id}/claims`
- `GET /companies/{company_id}/evidence`
- `GET /companies/{company_id}/founders`
- `GET /companies/{company_id}/events`
- `POST /founders/search`
- `POST /founders/activate`
- `POST /voice/narrate`
- `POST /voice/query`
- `POST /voice/query/text`
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
- `OPENAI_MODEL` defaults to `gpt-4o-mini`
- `OPENAI_TRANSCRIPTION_MODEL` defaults to `gpt-4o-mini-transcribe`
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

`OPENAI_API_KEY` enables structured company-profile extraction during ingestion
and structured parsing for `POST /founders/search`.
Without it, the endpoint uses a deterministic parser for demo stability.
Company fields prefer explicit source metadata and labels, then use the
dedicated profile prompt for unstructured text. Prompt text is use-case-specific
and lives in `services/api/app/prompts.py`.

`OPENAI_API_KEY` also enables `POST /voice/query`, which accepts browser/mobile
audio, transcribes it, routes the command, and returns a reusable typed response.
`POST /voice/query/text` accepts the same flow after client-side transcription.
`ELEVENLABS_API_KEY` optionally adds base64 MP3 narration to the same response;
`POST /voice/narrate` remains available for arbitrary text.

## Person A Scope

- Deduplicates sources per company by normalized URL and content fingerprint,
  with connector/title matching retained for pulled-signal compatibility.
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

## Data Contract

Ingestion emits one evidence object per extracted claim and links it through
`Claim.evidence_ids`. Claim confidence combines extraction quality, source
reliability, quote coverage, and directness. Claims are then resolved to
`supported`, `disputed`, or `missing_evidence` when evidence links and
cross-source comparisons are available.

Founder metadata is resolved from document metadata and text, including name,
role, LinkedIn, and GitHub. A founder is marked `cold_start` when the pipeline
has fewer than two founder data points, and that state is returned
with the persisted Founder Score. Every source has a connector-specific
`source_type`, one of the seven-value canonical `source_category` values, and a
`submitted_at` timestamp. The detailed type preserves the independence and
reliability signals used by scoring.

Readiness is a diligence-completeness score, not an investment score. It
returns blockers and next-best evidence actions. The timeline preserves claim
verification changes, Founder Score snapshots, and causal trigger events so a
new source can explain exactly why confidence changed.

## Demo Seed

```bash
uv run --with fastapi --with pypdf --with python-docx --with python-pptx python scripts/seed_demo.py --reset
```

Set `VCBRAIN_DB_PATH` to isolate local, test, or deployed SQLite files.

The same seed flow is available through `POST /demo/seed`.
