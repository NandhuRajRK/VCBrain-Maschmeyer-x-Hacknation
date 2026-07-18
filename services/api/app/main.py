import os

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile

from . import config as config
from .document_parser import LLM_TASKS, parse_document
from .demo import seed_demo
from .models import (
    Claim,
    ClaimStatus,
    CompanyTimeline,
    ConnectorKind,
    Company,
    CompanyCreate,
    DemoSeedResult,
    DecisionReadiness,
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
    VoiceNarrationRequest,
    VoiceIntent,
    VoiceQueryResponse,
    VoiceTextQueryRequest,
)
from .connectors import pull_signals
from .llm import parse_founder_query, parse_voice_command
from .memory import build_timeline, calculate_readiness, refresh_company_memory
from .pipeline import extract_claims, extract_company_update, extract_founders, parse_source
from .provenance import apply_company_update, find_duplicate_source, initialize_company_provenance
from .search import search_founders
from .store import store
from .voice import encode_audio, narrate_text, transcribe_audio

app = FastAPI(title="VC Brain API", version="0.1.0")
MAX_VOICE_AUDIO_BYTES = 25_000_000


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/companies", response_model=Company, status_code=201)
def create_company(payload: CompanyCreate) -> Company:
    company = Company(**payload.model_dump())
    initialize_company_provenance(company)
    store.companies[company.id] = company
    event = TriggerEvent(
        company_id=company.id,
        kind=TriggerKind.new_application,
        message=f"New startup application created for {company.name}.",
    )
    store.trigger_events[event.id] = event
    store.save()
    return company


@app.get("/companies", response_model=list[Company])
def list_companies() -> list[Company]:
    return list(store.companies.values())


@app.post("/sources", response_model=Source, status_code=201)
def create_source(payload: SourceCreate) -> Source:
    if payload.company_id not in store.companies:
        raise HTTPException(status_code=404, detail="Company not found")
    source = Source(**payload.model_dump())
    duplicate = find_duplicate_source(store.company_sources(payload.company_id), source)
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail={"message": "Duplicate source", "existing_source_id": duplicate.id},
        )
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
    duplicate = find_duplicate_source(store.company_sources(company_id), source)
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail={"message": "Duplicate document", "existing_source_id": duplicate.id},
        )
    store.sources[source.id] = source

    segments = [
        Segment(source_id=source.id, heading=chunk.heading, page=chunk.page, text=chunk.text)
        for chunk in parsed.chunks
    ]
    for segment in segments:
        store.segments[segment.id] = segment

    update = extract_company_update(segments, source)
    company = store.company(company_id)
    apply_company_update(company, update, source)

    for founder in extract_founders(company_id, source):
        _upsert_founder(founder)
    _ensure_founder(company_id)
    claims, evidence = extract_claims(company_id, source, segments, store.company_founders(company_id))
    for item in evidence:
        store.evidence[item.id] = item
    for claim in claims:
        store.claims[claim.id] = claim

    refresh_company_memory(store, company_id)
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
        source = Source(
            company_id=payload.company_id,
            source_type=source_type,
            title=signal.title,
            url=signal.url,
            text=signal.text,
            metadata={**signal.metadata, "observed_at": signal.observed_at.isoformat()},
            submitted_at=signal.observed_at,
        )
        duplicate = find_duplicate_source(store.company_sources(payload.company_id), source)
        key = f"{payload.company_id}:{source_type}:{signal.title.lower()}"
        if key in store.sources or duplicate:
            deduped += 1
            continue
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

            update = extract_company_update(segments, source)
            company = store.company(company_id)
            apply_company_update(company, update, source)

            for founder in extract_founders(company_id, source):
                _upsert_founder(founder)

            claims, evidence = extract_claims(company_id, source, segments, store.company_founders(company_id))
            for item in evidence:
                store.evidence[item.id] = item
            for claim in claims:
                store.claims[claim.id] = claim

            source.status = IngestionStatus.parsed
            parsed_segments += len(segments)
            extracted_claims += len(claims)

    _ensure_founder(company_id)
    refresh_company_memory(store, company_id)
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
    _ensure_founder(company_id)
    if not store.company_founder_scores(company_id):
        refresh_company_memory(store, company_id)
        store.save()
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


@app.get("/companies/{company_id}/readiness", response_model=DecisionReadiness)
def get_readiness(company_id: str) -> DecisionReadiness:
    return calculate_readiness(store, company_id)


@app.get("/companies/{company_id}/timeline", response_model=CompanyTimeline)
def get_timeline(company_id: str) -> CompanyTimeline:
    return build_timeline(store, company_id)


@app.get("/companies/{company_id}/claims", response_model=list[Claim])
def get_claims(company_id: str) -> list[Claim]:
    return store.company_claims(company_id)


@app.get("/companies/{company_id}/evidence", response_model=list[Evidence])
def get_evidence(company_id: str) -> list[Evidence]:
    return store.company_evidence(company_id)


@app.get("/companies/{company_id}/founders", response_model=list[Founder])
def get_founders(company_id: str) -> list[Founder]:
    return store.company_founders(company_id)


@app.get("/founders", response_model=list[Founder])
def list_founders() -> list[Founder]:
    return list(store.founders.values())


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
        list(store.evidence.values()),
        payload.limit,
    )


@app.post("/founders/activate", response_model=ActivationDraft)
def activate_founder(payload: ActivateRequest) -> ActivationDraft:
    founder = next((item for item in store.founders.values() if item.id == payload.founder_id), None)
    if not founder:
        raise HTTPException(status_code=404, detail="Founder not found")

    company = store.company(founder.company_id)
    claims = store.company_claims(company.id)
    usable_claims = sorted(
        (claim for claim in claims if claim.status == ClaimStatus.supported),
        key=lambda claim: (
            claim.verification.value != "independently_supported",
            -claim.confidence,
        ),
    )[:3]
    evidence_ids = [evidence_id for claim in usable_claims for evidence_id in claim.evidence_ids]
    evidence_context = "; ".join(claim.text for claim in usable_claims[:2])
    context = payload.context or evidence_context or "your recent founder signals"
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


@app.post("/voice/narrate")
def narrate(payload: VoiceNarrationRequest) -> Response:
    audio = narrate_text(payload.text, payload.voice_id)
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'inline; filename="vcbrain-narration.mp3"'},
    )


@app.post("/voice/query", response_model=VoiceQueryResponse)
async def query_by_voice(
    audio: UploadFile = File(...),
    speak_response: bool = Form(False),
    voice_id: str | None = Form(None),
    limit: int = Form(10),
) -> VoiceQueryResponse:
    if not 1 <= limit <= 50:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 50")
    content = await audio.read(MAX_VOICE_AUDIO_BYTES + 1)
    if len(content) > MAX_VOICE_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio input exceeds the 25 MB limit")
    transcript = transcribe_audio(content, audio.filename or "voice.webm", audio.content_type)
    return _run_voice_query(transcript, limit, speak_response, voice_id)


@app.post("/voice/query/text", response_model=VoiceQueryResponse)
def query_by_text(payload: VoiceTextQueryRequest) -> VoiceQueryResponse:
    return _run_voice_query(payload.transcript, payload.limit, payload.speak_response, payload.voice_id)


def _run_voice_query(
    transcript: str,
    limit: int,
    speak_response: bool,
    voice_id: str | None,
) -> VoiceQueryResponse:
    command = parse_voice_command(transcript)
    parsed_query = None
    results: list[SearchMatch] = []
    if command.intent == VoiceIntent.founder_search:
        parsed_query = parse_founder_query(command.query)
        results = search_founders(
            command.query,
            list(store.companies.values()),
            list(store.founders.values()),
            store.founder_scores,
            list(store.claims.values()),
            list(store.sources.values()),
            list(store.evidence.values()),
            limit,
            parsed_query=parsed_query,
        )
    response_text = _voice_response_text(command.intent, results)
    audio_base64 = None
    if speak_response and os.getenv("ELEVENLABS_API_KEY"):
        audio_base64 = encode_audio(narrate_text(response_text, voice_id))
    return VoiceQueryResponse(
        transcript=transcript,
        command=command,
        parsed_query=parsed_query,
        results=results,
        response_text=response_text,
        audio_available=audio_base64 is not None,
        audio_base64=audio_base64,
    )


def _voice_response_text(intent: VoiceIntent, results: list[SearchMatch]) -> str:
    if intent == VoiceIntent.founder_search:
        if not results:
            return "I could not find a matching founder in the current memory."
        names = ", ".join(f"{item.founder.name} at {item.company.name}" for item in results[:3])
        return f"I found {len(results)} founder match{'es' if len(results) != 1 else ''}. Top results: {names}."
    labels = {
        VoiceIntent.company_dossier: "company dossier",
        VoiceIntent.memo_review: "investment memo",
        VoiceIntent.decision_review: "investment decision",
        VoiceIntent.activation: "founder outreach",
        VoiceIntent.unknown: "VC Brain action",
    }
    return f"I routed this to the {labels[intent]} view for the workspace to handle."


@app.post("/demo/seed", response_model=DemoSeedResult)
def seed_demo_data(reset: bool = True) -> DemoSeedResult:
    return seed_demo(reset=reset)


def _upsert_founder(founder: Founder) -> Founder:
    key = f"{founder.company_id}:{founder.name.lower()}"
    existing = store.founders.get(key)
    if not existing:
        store.founders[key] = founder
        return founder
    if founder.role and not existing.role:
        existing.role = founder.role
    if founder.linkedin and not existing.linkedin:
        existing.linkedin = founder.linkedin
    if founder.github and not existing.github:
        existing.github = founder.github
    return existing


def _ensure_founder(company_id: str) -> Founder:
    founders = store.company_founders(company_id)
    if founders:
        return founders[0]
    company = store.company(company_id)
    return _upsert_founder(Founder(company_id=company_id, name=f"{company.name} founder", role="Founder"))
