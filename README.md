# Iskra: The VC Brain

Iskra is an AI-first venture operating system built for HackNation's
**Maschmeyer Group - The VC Brain** challenge. The goal is to help an investment
team reach an evidence-backed decision on a **$100,000 investment within 24
hours**.

The product connects founder discovery, application intake, public-source
research, document parsing, claim-level evidence, thesis fit, three-axis
scoring, investment memos, team collaboration, and voice interaction in one
workspace.

## Why Iskra

Traditional early-stage diligence is fragmented across decks, search tabs,
spreadsheets, CRM notes, and partner conversations. Iskra turns those inputs
into a traceable decision system:

```text
application, deck, public signal, or investor note
                         |
                         v
             normalized sources and evidence
                         |
                         v
       claims, contradictions, founder memory, readiness
                         |
                         v
        thesis fit, three independent scores, memo, decision
                         |
                         v
          collaborative deal workspace and Iskra assistant
```

Every material conclusion can be traced back to a source, claim, and confidence
reason. Missing evidence stays visible instead of being filled with invented
certainty.

## Hackathon Highlights

- Source ingestion from GitHub, Hacker News, Product Hunt, arXiv, websites,
  Tavily, Exa, Perplexity, company registries, SEC EDGAR, and patents.
- PDF, PowerPoint, Word, spreadsheet, Markdown, and text ingestion.
- Claim-evidence ledger with confidence, freshness, directness, source
  independence, and contradiction states.
- Persistent Founder Scores and evidence-backed Founder Passports.
- Explicit cold-start handling for founders with sparse public data.
- Configurable fund thesis across sector, stage, geography, check size,
  ownership target, and risk appetite.
- Founder, Market, and Idea-vs-Market scores kept independent rather than
  hidden inside an average.
- Investment memo, red-team analysis, decision-flip conditions, and decision
  readiness.
- Natural-language founder discovery and evidence-aware outreach drafting.
- Iskra text, dictation, and dialogue modes with OpenAI transcription and
  optional ElevenLabs narration.
- Organization-scoped workspaces, comments, tasks, invitations, and enterprise
  SSO through Clerk.
- Interactive outcome simulator for growth, churn, margin, runway, dilution,
  valuation, MOIC, and expected return.
- Synthetic demo portfolio with ten founder profiles, pitch materials, cold
  starts, and seeded contradictions.

## Stack

- **Web:** Next.js 16, React 19, TypeScript, Three.js, Radix UI
- **API:** FastAPI, Pydantic, SQLite
- **AI:** OpenAI structured outputs and transcription; optional ElevenLabs TTS
- **Identity:** Clerk Organizations with SAML/OIDC enterprise connections
- **Data:** shared JSON schemas plus typed API adapters

## Run Locally

Requirements: Python 3.11+, `uv`, Node.js 20+, and npm.

```bash
cp .env.example .env
uv sync --group dev
uv run uvicorn services.api.app.main:app --reload
```

In a second terminal:

```bash
cd apps/web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open <http://localhost:3000>. The FastAPI explorer is available at
<http://localhost:8000/docs>.

The demo works without paid API keys by using deterministic fallbacks and
synthetic evidence. Add keys to `.env` only for the live integrations you want
to demonstrate. Secrets remain server-side and `.env` is ignored by git.

## Seed the Demo

Use a separate SQLite file to keep the demo repeatable:

```bash
VCBRAIN_DB_PATH=/tmp/iskra-demo.sqlite3 uv run python scripts/seed_demo.py --reset
VCBRAIN_DB_PATH=/tmp/iskra-demo.sqlite3 uv run uvicorn services.api.app.main:app --reload
```

The primary scenario is AetherGrid: ingest a deck, inspect the founder history,
add an independent correction, and watch the contradiction alter confidence,
readiness, score history, and next diligence actions.

See the [demo walkthrough](docs/demo-walkthrough.md) and
[manual validation guide](docs/demo-fixtures/MANUAL_E2E_TEST.md).

## Test

```bash
uv run pytest -q
cd apps/web
npx tsc --noEmit
npm run lint
```

Automated backend tests use isolated storage and mocked model behavior, so they
do not consume live API credits.

## Documentation

- [Submission overview](docs/INTRO.md)
- [Architecture](docs/architecture.md)
- [API reference](docs/api-reference.md)
- [Demo walkthrough](docs/demo-walkthrough.md)
- [LLM and prompt design](docs/llm-prompts.md)
- [Voice modes](docs/voice-mode.md)
- [Authentication and enterprise SSO](docs/clerk-integration.md)
- [Collaboration model](docs/collaboration-api.md)
- [Shared schemas](packages/shared/README.md)

The complete documentation index is in [docs/README.md](docs/README.md).

## Hackathon Scope

Iskra is a working hackathon prototype, not investment advice. The evidence
model, collaboration boundary, and deterministic fallbacks are designed for a
reliable live demo. A production deployment would add managed Postgres, durable
job workers, observability, rate limiting, secret management, and formal model
evaluation before handling real investment decisions.
