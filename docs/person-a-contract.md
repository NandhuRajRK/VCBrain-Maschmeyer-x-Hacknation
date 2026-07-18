# Person A Contract

Nandhu owns the sourcing and memory side of the system.

## Source Pull

`POST /sources/pull`

Inputs:

- `company_id`
- `connectors`: `github`, `hacker_news`, `product_hunt`, `arxiv`, `website`,
  `perplexity`, `exa`, `tavily`, `opencorporates`, `sec_edgar`, `patentsview`
- `query`
- `github_user`
- `arxiv_query`
- `website_url`

Output:

- `created_sources`
- `deduped_sources`

## Document Upload

`POST /companies/{company_id}/documents`

Accepts pitch decks and founder documents. Supported formats:

- `.txt`
- `.md`
- `.pdf`
- `.pptx`
- `.docx`

The endpoint stores the upload as a source, parses it into segments with
page/slide-like references where available, creates initial claims/evidence,
and attaches `llm_tasks` metadata for later LLM extraction.

## Ingestion

`POST /companies/{company_id}/ingest`

The ingestion run parses queued sources, extracts basic claims, links evidence,
resolves founder duplicates by company and name, creates cold-start founders
when needed, updates founder scores, and persists score history.

Evidence includes:

- `source_reliability`
- `source_independence`
- `freshness_days`
- `directness`
- `confidence_reason`

Founder Score is a memory signal derived from evidence confidence, evidence
coverage, public signals, and contradiction penalties. It is not Julia's
3-axis investment score.

## Dossier Fields For Person B

`GET /companies/{company_id}/dossier`

Person B can consume:

- `company`
- `founders`
- `sources`
- `claims`
- `evidence`
- `founder_scores`
- `trigger_events`

Useful platform endpoints:

- `GET /companies`
- `GET /founders`
- `POST /demo/seed`
- `POST /voice/narrate`
- `POST /voice/query`
- `POST /voice/query/text`

## Environment

Put real keys in a local `.env` file copied from `.env.example`.

Required for richer demo modes:

- `OPENAI_API_KEY`
- `OPENAI_TRANSCRIPTION_MODEL`
- `TAVILY_API_KEY`
- `ELEVENLABS_API_KEY`

Do not commit `.env`; it is already ignored.

Cold-start founders are never hidden. They are returned with `cold_start: true`
and low confidence so the memo layer can flag evidence gaps explicitly.

## Search And Activation

`POST /founders/search`

Accepts a natural-language query such as:

```text
technical founder, Berlin, AI infra, no prior VC backing
```

Returns ranked `SearchMatch` objects with company, founder, score, match score,
and reasons.

When `OPENAI_API_KEY` is set, the query is parsed with OpenAI into structured
filters (`ParsedFounderQuery`) before ranking. Without a key, the same endpoint
uses a deterministic fallback parser. Ranking is based on matched filters,
evidence coverage, and Founder Score confidence rather than LLM-generated
investment judgment.

`POST /founders/activate`

Accepts a `founder_id` and returns a personalized outreach draft tied to the
stored evidence IDs.

`POST /voice/query` accepts browser or mobile audio, transcribes it with OpenAI,
routes the request through a dedicated voice-command prompt, and returns the
shared `VoiceQueryResponse` contract. Founder-search requests execute against
memory; dossier, memo, decision, and activation requests return typed handoffs
for Julia's corresponding views. `POST /voice/query/text` is the same contract
for UI tests or clients that already have a transcript.

## Demo Data

`data/samples/founders.json` contains 10 founders:

- rich signal profiles
- medium signal profiles
- cold-start profiles

The sample deck files live in `data/samples/decks/`, with seeded contradictions
for testing the claim/evidence ledger.

## Live API Keys

The system can run without keys, but these unlock richer evidence:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `PRODUCT_HUNT_TOKEN`
- `PERPLEXITY_API_KEY`
- `EXA_API_KEY`
- `TAVILY_API_KEY`
- `OPENCORPORATES_API_TOKEN`

GitHub, Hacker News, arXiv, website fetches, SEC ticker lookup, and PatentsView
search surfaces can run without project-specific credentials.
