# Architecture

Iskra is a monorepo with a Next.js investor workspace, a FastAPI diligence API,
shared wire schemas, synthetic demo data, and contract-focused tests.

## System Map

```text
Browser
  Next.js workspace
  dashboard, analysis queue, company review, thesis, Iskra chat/voice
        |
        | typed HTTP + Clerk bearer token
        v
FastAPI
  intake | connectors | parsing | evidence | memory | intelligence
  collaboration | outcomes | voice | assistant | analysis jobs
        |
        +---- OpenAI: structured extraction, reasoning, transcription
        +---- ElevenLabs: optional spoken responses
        +---- Public/search APIs: GitHub, HN, arXiv, Tavily, Exa, and others
        |
        v
SQLite
  organization-scoped companies, sources, claims, evidence, scores,
  passports, jobs, comments, tasks, theses, and VC memory
```

## Repository Layout

```text
apps/web/               Next.js investor workspace
services/api/app/       FastAPI routes and domain logic
packages/shared/        Shared JSON wire schemas
data/samples/           Synthetic founders and pitch materials
docs/                   Submission and technical documentation
scripts/                Demo seeding utilities
tests/                  API, persistence, collaboration, and outcome tests
```

## Diligence Pipeline

### 1. Intake

`POST /companies` creates an organization-scoped company. Documents uploaded to
`POST /companies/{id}/documents` become timestamped sources and page-, slide-,
sheet-, or section-level segments.

Sources are deduplicated by normalized URL and content fingerprint. Duplicate
content returns `409`, preventing the same evidence from inflating confidence.

### 2. Source enrichment

`POST /sources/pull` runs selected connectors. Every connector returns a common
signal shape, so public APIs, search providers, registry lookups, websites, and
synthetic fallbacks enter the same ingestion path.

Live connectors include GitHub, Hacker News, Product Hunt, arXiv, websites,
Tavily, Exa, Perplexity, OpenCorporates, SEC EDGAR, and PatentsView. Missing
credentials produce an explicit fallback or search surface instead of crashing
the demo.

### 3. Claims and evidence

Ingestion creates multiple typed claims from each useful segment. Claim kinds
are `company`, `founder`, `product`, `traction`, `market`, and `financial`.
Each claim links to one or more evidence records through `evidence_ids`.

Evidence quality records:

- source reliability and independence
- direct versus indirect support
- freshness and observation time
- extraction confidence and its reason
- the supporting quote or segment

Claims transition between `extracted`, `supported`, `disputed`, and
`missing_evidence`. Deterministic comparison handles common temporal and unit
differences; a capped OpenAI referee handles ambiguous pairs when configured.

### 4. Founder memory

Founder entities are resolved by normalized identity. A Founder Passport stores
source-linked employment, education, previous ventures, outcomes, skills, and
explicit gaps. Duplicate facts are merged and corroborating source IDs increase
confidence.

The persistent Founder Score updates when new evidence arrives. Cold-start
founders remain eligible for review, but the API marks their evidence coverage
and confidence explicitly.

### 5. Investment intelligence

The web intelligence layer consumes the dossier and applies:

- configurable thesis hard and soft filters
- independent Founder, Market, and Idea-vs-Market scores
- evidence confidence, freshness, and independence adjustments
- risk detection and trend direction
- memo, SWOT, red-team reasoning, and decision-flip conditions

The three axes are never averaged into one hidden score. Decision readiness is
a separate measure of whether enough evidence exists to decide.

### 6. Collaboration and memory

Companies, analyses, theses, comments, tasks, invitations, and VC memory are
scoped by `organization_id`. Contextual comments can link to claims and evidence.
Optimistic versions and SQLite immediate transactions prevent silent concurrent
overwrites.

VC memory stores prior memos, rejected-deal history, portfolio context, CRM or
email notes, partner notes, and investment committee records. These records are
kept distinct from public evidence so provenance remains clear.

## Persistence

The default database is `data/processed/vcbrain.sqlite3`. Set
`VCBRAIN_DB_PATH` to isolate local, test, and demo runs. Pydantic records are
stored as JSON payloads in a compact SQLite collection table, with transactional
helpers for multi-record collaboration updates.

Analysis jobs are persisted so the UI can recover progress after a refresh.
The hackathon implementation runs jobs inside the API process; a production
deployment should move them to a durable queue and worker pool.

## AI Boundaries

OpenAI is used for tasks where language understanding materially helps:
structured claim extraction, company and founder normalization, contradiction
adjudication, natural-language search, assistant answers, opportunity intake,
chat titles, and transcription. Every use case has a dedicated system prompt
and a constrained output contract.

Deterministic paths remain available for core demo workflows, and costly calls
are capped. Attached files are treated as context until they pass through the
evidence pipeline.

## Authentication and Isolation

Clerk provides user sessions and organization membership. The API verifies the
token and maps `sub`, `org_id`, role, and permissions into a provider-neutral
identity context. Cross-organization company access is rejected without
revealing whether the resource exists.

When Clerk is not configured, development uses an explicit demo identity.
`APP_ENV=production` fails closed if authentication is missing.

## Hackathon Reliability Choices

- Synthetic fixtures keep the core story deterministic.
- Connector and model failures become visible evidence gaps.
- API keys never enter browser code.
- Voice uploads are size-limited.
- Organization boundaries are enforced by the API, not only the UI.
- Tests isolate persistence and mock paid model behavior.

For production, replace local SQLite and in-process jobs with managed storage,
durable workers, observability, rate limits, secret management, migrations, and
formal model-quality evaluation.
