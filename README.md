# VC Brain

VC Brain is an AI-first venture operating system for the Maschmeyer Group
HackNation challenge: make an evidence-backed $100,000 investment decision
within 24 hours.

It connects founder discovery, source ingestion, document parsing, claim-level
evidence, founder memory, thesis reasoning, investment memos, decisions, and
voice input into one workflow.

## Documentation

Start with the [documentation hub](docs/README.md).

- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Person A Contract](docs/person-a-contract.md)
- [Person B Contract](docs/person-b-contract.md)
- [Demo Walkthrough](docs/demo-walkthrough.md)
- [Founder Passport](docs/founder-passport.md)
- [Decision Flight Recorder](docs/decision-flight-recorder.md)
- [Voice Mode](docs/voice-mode.md)
- [Shared Schemas](packages/shared/README.md)

## Current Product Flow

```text
create company -> attach or pull sources -> parse and ingest
       -> claims + evidence + founder passport
       -> contradiction checks + Founder Score + readiness
       -> dossier / search / activation / voice
       -> Julia's thesis, three-axis scoring, memo, and decision room
```

Nandhu's branch contains the data and memory layer. Julia's branch owns the
intelligence and dashboard layer. The API dossier and `packages/shared/schemas.json`
are the integration boundary.

## Features Implemented

- FastAPI company and source intake.
- Live or fallback connectors for GitHub, Hacker News, Product Hunt, arXiv,
  websites, Perplexity, Exa, Tavily, OpenCorporates, SEC EDGAR, and PatentsView.
- `.txt`, `.md`, `.pdf`, `.pptx`, and `.docx` parsing into segments.
- Claim-evidence ledger with confidence, freshness, directness, source
  independence, and explicit status.
- Source URL/content deduplication and company-field provenance.
- Founder resolution, cold-start handling, and persistent Founder Scores.
- Founder Passport with sourced employment, education, prior ventures, skills,
  confidence, and evidence gaps.
- Explicit founder-targeted Tavily/Exa enrichment with per-founder result caps.
- Deterministic contradiction detection with optional capped OpenAI adjudication.
- Persistent score snapshots, claim transitions, trigger events, readiness, and
  next-best diligence actions.
- Natural-language founder search and evidence-aware outbound activation drafts.
- OpenAI voice query routing and optional ElevenLabs narration.
- Ten-founder synthetic demo pack with sample decks and staged contradictions.

Julia's layer adds thesis filters, Founder/Market/Idea-vs-Market scoring, Trust
Scores, memos, red-team analysis, decisions, and the React dashboard.

## Quick Start

Requirements: Python 3.11+ and `uv`.

```bash
uv sync --group dev
cp .env.example .env
uv run uvicorn services.api.app.main:app --reload
```

Open the generated API explorer at <http://localhost:8000/docs>.

The backend runs without paid API keys using deterministic parsers and source
fallbacks. Add keys to `.env` only when testing the corresponding live feature.
Keep all keys server-side and never commit `.env`.

## Demo

Use an isolated SQLite file for the demo:

```bash
VCBRAIN_DB_PATH=/tmp/vcbrain-demo.sqlite3 \
uv run python scripts/seed_demo.py --reset
VCBRAIN_DB_PATH=/tmp/vcbrain-demo.sqlite3 \
uv run uvicorn services.api.app.main:app --reload
```

The strongest flow is AetherGrid:

1. Inspect its Founder Passport and initial timeline.
2. Ingest the queued public correction.
3. Show the contradiction, score delta, readiness drop, and next action.
4. Hand the dossier to Julia's decision room.

See [Demo Walkthrough](docs/demo-walkthrough.md) for the full five-minute
narrative.

## Tests

```bash
uv run pytest -q
```

Tests use isolated data and mocked OpenAI behavior. They do not consume live
API credits.

## Persistence

The default SQLite database is `data/processed/vcbrain.sqlite3`. Override it
with `VCBRAIN_DB_PATH`. Local generated data is ignored by git. The current
store is intentionally thin and suitable for the hackathon demo; production
authentication, authorization, migrations, background jobs, and multi-user
tenancy remain future work.

## Branches

- `main`: stable merge target.
- `nandhu`: sourcing, memory, evidence, persistence, search, and voice backend.
- `julia`: thesis, intelligence, memo, decision, and web experience.

Feature work should land on the owner branch first, then be rebased and merged
into `main` as a reviewable, demo-safe change.
