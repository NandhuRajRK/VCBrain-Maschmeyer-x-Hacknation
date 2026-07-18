from fastapi import FastAPI, File, HTTPException, UploadFile

from .document_parser import LLM_TASKS, parse_document
from .models import (
    Claim,
    ConnectorKind,
    Company,
    CompanyCreate,
    DocumentUploadResult,
    Dossier,
    Evidence,
    Founder,
    FounderSearchRequest,
    IngestionRun,
    IngestionStatus,
    Segment,
    SearchMatch,
    Source,
    SourceCreate,
    SourcePullRequest,
    SourcePullResult,
    SourceType,
    TriggerEvent,
    TriggerKind,
    ActivateRequest,
    ActivationDraft,
)
from .connectors import pull_signals
from .pipeline import extract_claims, extract_company_update, extract_founders, parse_source
from .scoring import update_founder_score
from .search import search_founders
from .store import store

app = FastAPI(title="VC Brain API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/companies", response_model=Company, status_code=201)
def create_company(payload: CompanyCreate) -> Company:
    company = Company(**payload.model_dump())
    store.companies[company.id] = company
    event = TriggerEvent(
        company_id=company.id,
        kind=TriggerKind.new_application,
        message=f"New startup application created for {company.name}.",
    )
    store.trigger_events[event.id] = event
    store.save()
    return company


@app.post("/sources", response_model=Source, status_code=201)
def create_source(payload: SourceCreate) -> Source:
    if payload.company_id not in store.companies:
        raise HTTPException(status_code=404, detail="Company not found")
    source = Source(**payload.model_dump())
    store.sources[source.id] = source
    store.save()
    return source


@app.post("/companies/{company_id}/documents", response_model=DocumentUploadResult)
async def upload_document(company_id: str, file: UploadFile = File(...)) -> DocumentUploadResult:
    store.company(company_id)
    content = await file.read()
    parsed = parse_document(file.filename or "upload", content)
    source = Source(
        company_id=company_id,
        source_type=parsed.source_type,
        title=file.filename or "Uploaded document",
        text=parsed.text,
        metadata={
            "filename": file.filename,
            "content_type": file.content_type,
            "file_size": len(content),
            "parser": parsed.parser,
            "warnings": parsed.warnings,
            "llm_ready": True,
            "llm_tasks": LLM_TASKS,
        },
        status=IngestionStatus.parsed,
    )
    store.sources[source.id] = source

    segments = [
        Segment(source_id=source.id, heading=chunk.heading, page=chunk.page, text=chunk.text)
        for chunk in parsed.chunks
    ]
    for segment in segments:
        store.segments[segment.id] = segment

    update = extract_company_update(segments)
    company = store.company(company_id)
    for field, value in update.model_dump(exclude_none=True).items():
        if hasattr(company, field):
            setattr(company, field, value)

    claims, evidence = extract_claims(company_id, source, segments)
    for item in evidence:
        store.evidence[item.id] = item
    for claim in claims:
        store.claims[claim.id] = claim

    store.save()
    return DocumentUploadResult(
        source=source,
        segments=segments,
        warnings=parsed.warnings,
        llm_tasks=LLM_TASKS,
    )


@app.post("/sources/pull", response_model=SourcePullResult)
def pull_sources(payload: SourcePullRequest) -> SourcePullResult:
    company = store.company(payload.company_id)
    query = payload.query or company.name
    connectors = payload.connectors or [
        ConnectorKind.website,
        ConnectorKind.hacker_news,
        ConnectorKind.product_hunt,
        ConnectorKind.arxiv,
        ConnectorKind.perplexity,
        ConnectorKind.exa,
        ConnectorKind.tavily,
        ConnectorKind.opencorporates,
        ConnectorKind.sec_edgar,
        ConnectorKind.patentsview,
    ]
    created: list[Source] = []
    deduped = 0

    website_url = payload.website_url or company.website
    signals = pull_signals(
        connectors,
        query,
        payload.github_user,
        payload.arxiv_query,
        str(website_url) if website_url else None,
    )
    for signal in signals:
        source_type = SourceType(signal.source.value)
        key = f"{payload.company_id}:{source_type}:{signal.title.lower()}"
        if key in store.sources:
            deduped += 1
            continue
        source = Source(
            company_id=payload.company_id,
            source_type=source_type,
            title=signal.title,
            url=signal.url,
            text=signal.text,
            metadata={**signal.metadata, "observed_at": signal.observed_at.isoformat()},
        )
        store.sources[key] = source
        created.append(source)

    if len(created) >= 3:
        event = TriggerEvent(
            company_id=payload.company_id,
            kind=TriggerKind.signal_threshold_crossed,
            message="At least three new sourcing signals were collected.",
            metadata={"created_sources": len(created)},
        )
        store.trigger_events[event.id] = event

    store.save()
    return SourcePullResult(
        company_id=payload.company_id,
        created_sources=created,
        deduped_sources=deduped,
    )


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

    if not store.company_founders(company_id):
        founder = Founder(
            company_id=company_id,
            name=f"{store.company(company_id).name} founder",
        )
        store.founders[f"{company_id}:unknown"] = founder

    for founder in store.company_founders(company_id):
        score = update_founder_score(
            founder,
            store.company_claims(company_id),
            store.company_sources(company_id),
        )
        founder.cold_start = score.cold_start
        store.founder_scores[founder.id] = score
    store.save()

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
        founder_scores=store.company_founder_scores(company_id),
        trigger_events=store.company_trigger_events(company_id),
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


@app.get("/companies/{company_id}/events", response_model=list[TriggerEvent])
def get_events(company_id: str) -> list[TriggerEvent]:
    return store.company_trigger_events(company_id)


@app.post("/founders/search", response_model=list[SearchMatch])
def search_founder_memory(payload: FounderSearchRequest) -> list[SearchMatch]:
    return search_founders(
        payload.query,
        list(store.companies.values()),
        list(store.founders.values()),
        store.founder_scores,
        list(store.claims.values()),
        list(store.sources.values()),
        payload.limit,
    )


@app.post("/founders/activate", response_model=ActivationDraft)
def activate_founder(payload: ActivateRequest) -> ActivationDraft:
    founder = next((item for item in store.founders.values() if item.id == payload.founder_id), None)
    if not founder:
        raise HTTPException(status_code=404, detail="Founder not found")

    company = store.company(founder.company_id)
    claims = store.company_claims(company.id)
    evidence_ids = [evidence_id for claim in claims[:3] for evidence_id in claim.evidence_ids]
    context = payload.context or "your recent founder signals"
    return ActivationDraft(
        founder_id=founder.id,
        company_id=company.id,
        subject=f"{company.name} x Maschmeyer Group",
        message=(
            f"Hi {founder.name},\n\n"
            f"We are mapping exceptional founders for the Maschmeyer Group VC Brain. "
            f"{company.name} stood out because of {context}. "
            "If you are open to it, I would love to compare notes and understand "
            "what you are building next.\n\n"
            "Best,\nNandhu"
        ),
        evidence_ids=evidence_ids,
    )
