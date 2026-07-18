# API Service

FastAPI service for Nandhu's slice: company intake, source registration,
parsing, extraction, entity resolution, evidence-backed claims, and dossier
readback.

## Run

```bash
uvicorn app.main:app --reload --app-dir services/api
```

## Current Endpoints

- `GET /health`
- `POST /companies`
- `POST /sources`
- `POST /companies/{company_id}/ingest`
- `GET /companies/{company_id}/dossier`
- `GET /companies/{company_id}/claims`
- `GET /companies/{company_id}/evidence`
- `GET /companies/{company_id}/founders`
