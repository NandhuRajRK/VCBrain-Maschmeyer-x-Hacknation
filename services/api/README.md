# API Service

FastAPI service for Nandhu's first slice: company intake, source registration,
basic ingestion status, and dossier readback.

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

