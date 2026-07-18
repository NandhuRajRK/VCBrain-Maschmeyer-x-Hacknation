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

Cold-start founders are never hidden. They are returned with `cold_start: true`
and low confidence so the memo layer can flag evidence gaps explicitly.

## Live API Keys

The system can run without keys, but these unlock richer evidence:

- `PRODUCT_HUNT_TOKEN`
- `PERPLEXITY_API_KEY`
- `EXA_API_KEY`
- `TAVILY_API_KEY`
- `OPENCORPORATES_API_TOKEN`

GitHub, Hacker News, arXiv, website fetches, SEC ticker lookup, and PatentsView
search surfaces can run without project-specific credentials.
