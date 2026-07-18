# Person A Contract

Nandhu owns the sourcing and memory side of the system.

## Source Pull

`POST /sources/pull`

Inputs:

- `company_id`
- `connectors`: `github`, `hacker_news`, `product_hunt`, `arxiv`
- `query`
- `github_user`
- `arxiv_query`

Output:

- `created_sources`
- `deduped_sources`

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
