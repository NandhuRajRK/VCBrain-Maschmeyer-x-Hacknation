# API Service

FastAPI service for Nandhu's slice: company intake, source registration,
parsing, extraction, entity resolution, evidence-backed claims, and dossier
readback. Source connectors currently normalize GitHub, Hacker News,
Product Hunt, and arXiv-style signals into the agreed source schema without
requiring API keys.

## Run

```bash
uvicorn app.main:app --reload --app-dir services/api
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

## Person A Scope

- Deduplicates pulled sources by company, connector, and title.
- Timestamps signals with `observed_at` and sources with `submitted_at`.
- Updates founder scores after ingestion and persists them to
  `data/processed/founder_scores.json`.
- Marks cold-start founders explicitly when evidence is sparse.
- Emits trigger events for new applications and signal threshold crossings.
- Parses uploaded `.txt`, `.md`, `.pdf`, `.pptx`, and `.docx` files into
  evidence-ready segments with LLM follow-up tasks attached.
