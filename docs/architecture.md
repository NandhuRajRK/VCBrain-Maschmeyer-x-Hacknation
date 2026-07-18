# Architecture

## Product Shape

VC Brain turns an application or public founder signal into a traceable
decision input:

```text
application / source pull / document
                |
                v
        FastAPI intake layer
                |
                +--> source deduplication + provenance
                +--> PDF/PPTX/DOCX/text parsing
                +--> segments -> claims -> evidence links
                +--> founder resolution + Founder Passport
                |
                v
        company memory refresh
                |
                +--> persistent Founder Score
                +--> claim verification and contradictions
                +--> score snapshots and trigger events
                +--> decision readiness and next actions
                |
                v
        dossier / timeline / readiness / search / activation / voice
                |
                v
        Julia's thesis, three-axis scoring, memo, decision, and UI layer
```

## Repository Layout

```text
services/api/app/       FastAPI routes and data-side domain logic
packages/shared/        Shared wire schemas for API and web clients
data/samples/           Safe synthetic founder and pitch-deck fixtures
docs/                   Product, architecture, contracts, and demo notes
tests/                  API smoke and contract tests
scripts/                Small local demo utilities
```

The current branch contains the backend and shared contracts. The web client is
Julia's owned surface and is integrated separately.

## Main Data Flow

### 1. Intake

`POST /companies` creates a company and emits a `new_application` trigger. The
company profile records field-level provenance and confidence. Application
values are authoritative over weaker later source updates.

`POST /sources` registers a source without processing it. Sources are scoped to
one company and receive a normalized content fingerprint. A matching URL or
fingerprint returns `409` instead of creating duplicate evidence.

`POST /sources/pull` runs selected connectors and stores returned signals as
queued sources. Pull-time title compatibility deduplication is retained in
addition to URL and content deduplication.

### 2. Parsing and extraction

Uploaded `.txt`, `.md`, `.pdf`, `.pptx`, and `.docx` files become `Source` plus
page/slide-like `Segment` records. Each extracted claim gets its own `Evidence`
record and the claim's `evidence_ids` point back to it.

Claim kinds are `company`, `founder`, `traction`, `market`, `product`, and
`financial`. Claim confidence combines extraction quality, quote coverage,
source reliability, independence, freshness, and directness.

### 3. Founder memory

Founder entities are resolved by company and normalized name. A generated
placeholder founder is upgraded in place when a real founder appears later.

The Founder Passport stores sourced work history, education, previous ventures,
skills, public profiles, fact confidence, and explicit gaps. Structured founder
metadata is used first. Unstructured biographies can use the dedicated OpenAI
passport prompt.

### 4. Truth layer

Claims move through `extracted`, `supported`, `disputed`, and
`missing_evidence`. Verification distinguishes founder/company-backed claims
from independently supported claims. Contradiction detection understands
dates, growth over time, subsets, pilots versus customers, and explicit
negations. OpenAI adjudication is optional and capped; deterministic logic is
the fallback.

### 5. Memory and decision readiness

Ingestion refreshes the persisted Founder Score and records an immutable score
snapshot only when meaningful values change. Trigger events include:

- `new_application`
- `signal_threshold_crossed`
- `contradiction_detected`
- `score_changed`
- `cold_start_resolved`
- `decision_ready`

Decision readiness is separate from Julia's investment score. It measures
whether the dossier has enough profile coverage, claim coverage, independent
evidence, resolved claims, and founder memory to support a decision. It returns
blockers and ranked next evidence actions.

## Connectors

The connector layer supports:

| Connector | Behavior |
| --- | --- |
| GitHub | Live public profile lookup when `github_user` is supplied. |
| Hacker News | Live Algolia story search. |
| Product Hunt | Live GraphQL search with `PRODUCT_HUNT_TOKEN`; otherwise a search surface fallback. |
| arXiv | Live Atom API search. |
| Website | Live HTML fetch and text extraction. |
| Perplexity | Live web-grounded diligence with `PERPLEXITY_API_KEY`; otherwise a fallback source. |
| Exa | Live semantic search with `EXA_API_KEY`; otherwise a fallback source. |
| Tavily | Live web search with `TAVILY_API_KEY`; otherwise a fallback source. |
| OpenCorporates | Live registry lookup, optionally with `OPENCORPORATES_API_TOKEN`. |
| SEC EDGAR | Live company ticker lookup. |
| PatentsView | Search surface URL for patent and inventor research. |

Every connector returns the same normalized `Signal` shape. Missing credentials
do not crash the demo; they create explicit fallback/search-surface sources so
the evidence gap remains visible.

## Persistence

The default store is SQLite at `data/processed/vcbrain.sqlite3`. It stores
Pydantic records as JSON payloads in a small collection/key table. Collections
include companies, founders, sources, segments, claims, evidence, current
Founder Scores, score history, claim status changes, and trigger events.

Set `VCBRAIN_DB_PATH` to isolate local, test, or demo databases. The demo reset
clears application collections and reseeds synthetic data. This persistence
layer is intentionally thin for the hackathon; authentication, migrations,
multi-user tenancy, and background job orchestration are not implemented.

## LLM Boundaries

OpenAI is used only for structured tasks that benefit from language
understanding: source claims, company profiles, natural-language search,
contradiction adjudication, founder background extraction, and voice
transcription/routing. Each task has its own system prompt and JSON schema.

Julia's investment reasoning remains a separate ownership boundary. Her future
OpenAI prompts should consume the dossier, preserve claim IDs, and never replace
the source evidence with invented rationale.

## Security and Operational Notes

- Keep all API keys in a local `.env`; never expose them to the browser or commit
  them.
- Use the small configured OpenAI model during development.
- Live connector calls have short timeouts and deterministic fallbacks.
- Voice uploads are capped at 25 MB.
- This is a hackathon prototype and has no authentication, authorization,
  request rate limiting, or production secret manager yet.
