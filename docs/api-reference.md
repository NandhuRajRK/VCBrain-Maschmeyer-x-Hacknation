# API Reference

The FastAPI service runs at `http://localhost:8000` by default. Interactive,
schema-generated documentation is available at `/docs`; this page groups the
routes by product workflow.

## Start the API

```bash
uv sync --group dev
cp .env.example .env
uv run uvicorn services.api.app.main:app --reload
```

## Authentication

When Clerk is configured, send the session token with every request:

```http
Authorization: Bearer <clerk-session-token>
```

The API derives the user and active organization from the verified token. In
local development without Clerk, the service uses a demo identity; optional
`X-Actor-Id` and `X-Organization-Id` headers can represent collaborators.

## Health and Identity

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health check |
| `GET` | `/auth/me` | Normalized user, session, organization, role, and permissions |
| `GET` | `/usage` | Organization analysis-credit usage |

## Fund Thesis

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/thesis` | Load the active organization's thesis |
| `PUT` | `/thesis` | Save thesis filters and investment parameters |

The thesis includes sectors, stages, geographies, preferred business models,
exclusions, check-size range, ownership target, and risk appetite.

## Companies and Analysis Jobs

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/companies` | Create an organization-scoped company |
| `GET` | `/companies` | List visible companies |
| `POST` | `/analysis-jobs` | Create a persisted analysis job |
| `GET` | `/analysis-jobs` | List organization analysis jobs |
| `PATCH` | `/analysis-jobs/{job_id}` | Update job stage, progress, or error |
| `POST` | `/analysis-jobs/{job_id}/run` | Queue an analysis run |
| `POST` | `/analysis-jobs/{job_id}/retry` | Retry a failed job within its retry limit |

Create a company:

```json
{
  "name": "AetherGrid",
  "website": "https://example.com",
  "sector": "AI infrastructure",
  "stage": "seed",
  "geography": "Berlin",
  "description": "Routes inference jobs across available GPU capacity."
}
```

Only `name` is required. Missing company fields can be extracted later from
documents or sources while retaining field-level provenance.

## Documents and Sources

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/sources` | Register a normalized source |
| `POST` | `/companies/{company_id}/documents` | Upload and segment a document |
| `POST` | `/sources/pull` | Pull selected public/search connectors |
| `POST` | `/companies/{company_id}/ingest` | Process queued sources |

Document uploads accept `.txt`, `.md`, `.pdf`, `.pptx`, `.docx`, `.csv`, and
supported spreadsheet/image inputs. The response includes the source,
segments, warnings, and any follow-up extraction tasks.

Source pull example:

```json
{
  "company_id": "company_123",
  "connectors": ["github", "hacker_news", "tavily"],
  "query": "AetherGrid GPU inference Berlin",
  "github_user": "example-founder",
  "max_website_pages": 3
}
```

Supported connector values are `github`, `hacker_news`, `product_hunt`,
`arxiv`, `website`, `perplexity`, `exa`, `tavily`, `opencorporates`,
`sec_edgar`, and `patentsview`.

Sources are deduplicated per company by normalized URL and content fingerprint.
Duplicate registration returns `409`.

## Dossier, Evidence, and Memory

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/companies/{company_id}/dossier` | Full company, founder, source, claim, evidence, and score bundle |
| `GET` | `/companies/{company_id}/claims` | Typed claim ledger |
| `GET` | `/companies/{company_id}/evidence` | Evidence linked to company claims |
| `GET` | `/companies/{company_id}/readiness` | Diligence completeness, blockers, and next actions |
| `GET` | `/companies/{company_id}/timeline` | Score snapshots, claim transitions, and trigger events |
| `GET` | `/companies/{company_id}/events` | Company trigger events |
| `GET` | `/internal-memory` | List organization VC memory, optionally filtered by kind |
| `POST` | `/internal-memory` | Add a prior memo, CRM note, partner note, or related memory |
| `GET` | `/companies/{company_id}/internal-memory` | Company-scoped VC memory |

Claim kinds are `company`, `founder`, `traction`, `market`, `product`, and
`financial`. Claim states are `extracted`, `supported`, `disputed`, and
`missing_evidence`.

Evidence records expose `source_id`, `segment_id`, quote, confidence, source
reliability, independence, freshness, directness, and a confidence reason.

VC memory kinds are `prior_memo`, `rejected_deal`, `portfolio_company`,
`crm_note`, `email`, `partner_note`, and `investment_committee`. Memory records
remain separate from public evidence and are deduplicated by content.

## Founders

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/founders` | List visible founders |
| `GET` | `/founders/ranked` | Rank founders by persistent score and trend |
| `GET` | `/companies/{company_id}/founders` | List company founders |
| `GET` | `/companies/{company_id}/founder-passports` | Company Founder Passports |
| `GET` | `/founders/{founder_id}/passport` | One Founder Passport |
| `POST` | `/companies/{company_id}/founder-passports/enrich` | Explicit Tavily or Exa founder research |
| `POST` | `/founders/search` | Natural-language founder discovery |
| `POST` | `/founders/activate` | Evidence-aware outreach draft |

Founder search example:

```json
{
  "query": "technical AI infrastructure founders in Berlin",
  "limit": 5
}
```

Search parses explicit criteria into structured filters and ranks matches using
profile fit, evidence quality, and Founder Score signals. It is not an
investment recommendation.

Founder enrichment is an explicit, credit-controlled operation:

```json
{
  "connectors": ["tavily"],
  "max_sources_per_founder": 1
}
```

## Collaboration

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/companies/{company_id}/collaboration` | Members, notes, tasks, and activity |
| `POST` | `/companies/{company_id}/collaborators` | Add a workspace member |
| `POST` | `/companies/{company_id}/collaboration/notes` | Create an evidence-linked comment |
| `PATCH` | `/companies/{company_id}/collaboration/notes/{note_id}` | Reply, edit, or resolve a comment |
| `POST` | `/companies/{company_id}/collaboration/tasks` | Create a diligence task |
| `PATCH` | `/companies/{company_id}/collaboration/tasks/{task_id}` | Update task state or assignment |
| `POST` | `/companies/{company_id}/invitations` | Invite an organization user |
| `GET` | `/companies/{company_id}/invitations` | List deal invitations |
| `POST` | `/invitations/{invitation_id}/accept` | Accept an invitation |

Notes can reference claim and evidence IDs. Version fields provide optimistic
concurrency; stale updates return `409` rather than replacing a teammate's work.

## Outcome Simulation

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/outcomes/simulate` | Stateless scenario simulation |
| `POST` | `/companies/{company_id}/outcomes/simulate` | Company-linked scenario simulation |

Inputs cover investment amount, entry valuation, MRR, growth, churn, margin,
burn, cash, next-round timing and dilution, exit timing, revenue multiple, and
exit probability. The response includes runway, next-round valuation,
ownership, expected return, MOIC, and bear/base/bull scenarios.

## Iskra Assistant and Voice

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/assistant/query` | Evidence-grounded portfolio Q&A |
| `POST` | `/assistant/title` | Generate a short chat title |
| `POST` | `/assistant/opportunity-intent` | Parse a request to create an analysis |
| `POST` | `/voice/transcribe` | Transcribe browser/mobile audio |
| `POST` | `/voice/query` | Transcribe and route a spoken command |
| `POST` | `/voice/query/text` | Route an existing transcript |
| `POST` | `/voice/narrate` | Generate optional ElevenLabs MP3 narration |

`/voice/query` accepts multipart audio and returns a typed intent. The upload
limit is 25 MB. `/voice/query/text` follows the same routing contract without
an audio upload.

Assistant queries receive explicit portfolio context and recent message
history. Attached files are marked as unverified context until ingested through
the evidence pipeline.

## Demo Data

`POST /demo/seed?reset=true` loads ten synthetic companies and founders,
supporting documents, Founder Passports, claims, evidence, and staged
contradictions. Reset is intended only for an isolated demo database.

## Common Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid operation or missing organization requirement |
| `401` | Missing or invalid configured authentication |
| `403` | Authenticated but not permitted for the organization or resource |
| `404` | Resource is unavailable in the active organization |
| `409` | Duplicate content, stale collaboration version, or retry limit |
| `413` | Audio upload exceeds the configured limit |
| `422` | Request validation failed |
| `502` | Upstream model or voice provider failed |
| `503` | A required live integration is not configured |
