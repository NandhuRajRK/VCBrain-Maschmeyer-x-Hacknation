from fastapi import FastAPI, HTTPException

from .models import (
    Company,
    CompanyCreate,
    Dossier,
    IngestionRun,
    IngestionStatus,
    Segment,
    Source,
    SourceCreate,
)
from .store import store

app = FastAPI(title="VC Brain API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/companies", response_model=Company, status_code=201)
def create_company(payload: CompanyCreate) -> Company:
    company = Company(**payload.model_dump())
    store.companies[company.id] = company
    return company


@app.post("/sources", response_model=Source, status_code=201)
def create_source(payload: SourceCreate) -> Source:
    if payload.company_id not in store.companies:
        raise HTTPException(status_code=404, detail="Company not found")
    source = Source(**payload.model_dump())
    store.sources[source.id] = source
    return source


@app.post("/companies/{company_id}/ingest", response_model=IngestionRun)
def ingest_company(company_id: str) -> IngestionRun:
    sources = store.company_sources(company_id)
    for source in sources:
        if source.status == IngestionStatus.queued:
            source.status = IngestionStatus.parsed
            store.segments[f"{source.id}:summary"] = Segment(
                source_id=source.id,
                heading="Source summary",
                text=f"{source.title} is registered for diligence.",
            )
    return IngestionRun(
        company_id=company_id,
        accepted_sources=len(sources),
        status=IngestionStatus.parsed,
    )


@app.get("/companies/{company_id}/dossier", response_model=Dossier)
def get_dossier(company_id: str) -> Dossier:
    return Dossier(
        company=store.company(company_id),
        sources=store.company_sources(company_id),
        segments=store.company_segments(company_id),
    )
