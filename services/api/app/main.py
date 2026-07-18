from fastapi import FastAPI, HTTPException

from .models import (
    Claim,
    Company,
    CompanyCreate,
    Dossier,
    Evidence,
    Founder,
    IngestionRun,
    IngestionStatus,
    Source,
    SourceCreate,
)
from .pipeline import extract_claims, extract_company_update, extract_founders, parse_source
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
    parsed_segments = 0
    extracted_claims = 0

    for source in sources:
        if source.status == IngestionStatus.queued:
            segments = parse_source(source)
            for segment in segments:
                store.segments[segment.id] = segment

            update = extract_company_update(segments)
            company = store.company(company_id)
            for field, value in update.model_dump(exclude_none=True).items():
                if hasattr(company, field):
                    setattr(company, field, value)

            for founder in extract_founders(company_id, source):
                key = f"{company_id}:{founder.name.lower()}"
                store.founders.setdefault(key, founder)

            claims, evidence = extract_claims(company_id, source, segments)
            for item in evidence:
                store.evidence[item.id] = item
            for claim in claims:
                store.claims[claim.id] = claim

            source.status = IngestionStatus.parsed
            parsed_segments += len(segments)
            extracted_claims += len(claims)

    return IngestionRun(
        company_id=company_id,
        accepted_sources=len(sources),
        parsed_segments=parsed_segments,
        extracted_claims=extracted_claims,
        status=IngestionStatus.parsed,
    )


@app.get("/companies/{company_id}/dossier", response_model=Dossier)
def get_dossier(company_id: str) -> Dossier:
    return Dossier(
        company=store.company(company_id),
        founders=store.company_founders(company_id),
        sources=store.company_sources(company_id),
        segments=store.company_segments(company_id),
        claims=store.company_claims(company_id),
        evidence=store.company_evidence(company_id),
    )


@app.get("/companies/{company_id}/claims", response_model=list[Claim])
def get_claims(company_id: str) -> list[Claim]:
    return store.company_claims(company_id)


@app.get("/companies/{company_id}/evidence", response_model=list[Evidence])
def get_evidence(company_id: str) -> list[Evidence]:
    return store.company_evidence(company_id)


@app.get("/companies/{company_id}/founders", response_model=list[Founder])
def get_founders(company_id: str) -> list[Founder]:
    return store.company_founders(company_id)
