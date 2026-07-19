import os

from collections.abc import Generator

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile

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
    CollaborationNote,
    CollaborationNoteCreate,
    CollaborationNoteUpdate,
    CollaborationRole,
    DealActivity,
    DealInvitation,
    DealInvitationCreate,
    DealMember,
    DealMemberCreate,
    DealTask,
    DealTaskCreate,
    DealTaskUpdate,
    DealWorkspace,
    DecisionReadiness,
    DocumentUploadResult,
    Dossier,
    Evidence,
    Founder,
    FounderEnrichmentRequest,
    FounderEnrichmentResult,
    FounderPassport,
    FounderSearchRequest,
    IngestionRun,
    IngestionStatus,
    InvitationStatus,
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
    now,
    OutcomeSimulationInput,
    OutcomeSimulationResult,
)
from .connectors import pull_signals
from .founder_passport import build_founder_passport, enrich_founder_passports
from .llm import parse_founder_query, parse_voice_command
from .memory import build_timeline, calculate_readiness, refresh_company_memory
from .pipeline import extract_claims, extract_company_update, extract_founders, parse_source
from .provenance import apply_company_update, find_duplicate_source, initialize_company_provenance
from .search import search_founders
from .store import store
from .outcomes import simulate_outcome
from .voice import encode_audio, narrate_text, transcribe_audio
from .auth import actor_id, organization_id, require_user
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Iskra API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_VOICE_AUDIO_BYTES = 25_000_000


def collaboration_transaction() -> Generator[None, None, None]:
    """Reload and commit collaboration rows inside one SQLite write lock."""
    with store.db.immediate_transaction() as connection:
        store.reload_collaboration()
        yield
        store.save_collaboration(connection)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/me")
def current_user(claims: dict = Depends(require_user)) -> dict:
    """Stable handoff endpoint for the Clerk-aware frontend."""
    return {
        "user_id": claims.get("sub"),
        "session_id": claims.get("sid"),
        "organization_id": claims.get("org_id"),
        "organization_role": claims.get("org_role"),
        "organization_permissions": claims.get("org_permissions", []),
    }


@app.post("/outcomes/simulate", response_model=OutcomeSimulationResult)
def simulate_outcomes(payload: OutcomeSimulationInput) -> OutcomeSimulationResult:
    return simulate_outcome(payload)


@app.post("/companies/{company_id}/outcomes/simulate", response_model=OutcomeSimulationResult)
def simulate_company_outcomes(
    company_id: str,
    payload: OutcomeSimulationInput,
) -> OutcomeSimulationResult:
    store.company(company_id)
    return simulate_outcome(payload, company_id)


@app.get("/companies/{company_id}/collaboration", response_model=DealWorkspace)
def get_collaboration_workspace(
    company_id: str,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> DealWorkspace:
    _authorize_collaborator(company_id, request)
    return DealWorkspace(
        company_id=company_id,
        organization_id=store.company(company_id).organization_id,
        members=store.company_members(company_id),
        notes=sorted(store.company_notes(company_id), key=lambda item: item.created_at),
        tasks=sorted(store.company_tasks(company_id), key=lambda item: item.created_at),
        activity=sorted(store.company_activity(company_id), key=lambda item: item.created_at),
        invitations=store.company_invitations(company_id),
    )


@app.post("/companies/{company_id}/collaborators", response_model=DealMember, status_code=201)
def add_collaborator(
    company_id: str,
    payload: DealMemberCreate,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> DealMember:
    actor = _authorize_collaborator(company_id, request)
    member = next(
        (item for item in store.company_members(company_id) if item.user_id == payload.user_id),
        None,
    )
    if member:
        member.display_name = payload.display_name
        member.role = payload.role
    else:
        member = DealMember(
            company_id=company_id,
            organization_id=store.company(company_id).organization_id,
            **payload.model_dump(),
        )
        store.deal_members[member.id] = member
    _record_activity(company_id, actor, "collaborator_added", "member", member.id, f"Added {member.user_id} to the deal")
    return member


@app.post("/companies/{company_id}/collaboration/notes", response_model=CollaborationNote, status_code=201)
def add_collaboration_note(
    company_id: str,
    payload: CollaborationNoteCreate,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> CollaborationNote:
    actor = _authorize_collaborator(company_id, request)
    _validate_collaboration_links(company_id, payload.claim_ids, payload.evidence_ids)
    note = CollaborationNote(company_id=company_id, author_id=actor, **payload.model_dump())
    store.collaboration_notes[note.id] = note
    _record_activity(company_id, note.author_id, "note_added", "note", note.id, "Added a deal note")
    return note


@app.patch("/companies/{company_id}/collaboration/notes/{note_id}", response_model=CollaborationNote)
def update_collaboration_note(
    company_id: str,
    note_id: str,
    payload: CollaborationNoteUpdate,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> CollaborationNote:
    _authorize_collaborator(company_id, request)
    note = store.collaboration_notes.get(note_id)
    if not note or note.company_id != company_id:
        raise HTTPException(status_code=404, detail="Collaboration note not found")
    if note.version != payload.version:
        raise HTTPException(status_code=409, detail="Note changed; refresh before editing")
    _validate_collaboration_links(company_id, payload.claim_ids, payload.evidence_ids)
    note.body = payload.body
    note.claim_ids = payload.claim_ids
    note.evidence_ids = payload.evidence_ids
    note.version += 1
    note.updated_at = now()
    _record_activity(company_id, actor_id(request), "note_updated", "note", note.id, "Updated a deal note")
    return note


@app.post("/companies/{company_id}/collaboration/tasks", response_model=DealTask, status_code=201)
def add_deal_task(
    company_id: str,
    payload: DealTaskCreate,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> DealTask:
    actor = _authorize_collaborator(company_id, request)
    task = DealTask(company_id=company_id, creator_id=actor, **payload.model_dump())
    store.deal_tasks[task.id] = task
    _record_activity(company_id, task.creator_id, "task_added", "task", task.id, task.title)
    return task


@app.patch("/companies/{company_id}/collaboration/tasks/{task_id}", response_model=DealTask)
def update_deal_task(
    company_id: str,
    task_id: str,
    payload: DealTaskUpdate,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> DealTask:
    actor = _authorize_collaborator(company_id, request)
    task = store.deal_tasks.get(task_id)
    if not task or task.company_id != company_id:
        raise HTTPException(status_code=404, detail="Deal task not found")
    if task.version != payload.version:
        raise HTTPException(status_code=409, detail="Task changed; refresh before editing")
    changes = payload.model_dump(exclude={"version"}, exclude_none=True)
    for field, value in changes.items():
        setattr(task, field, value)
    task.version += 1
    task.updated_at = now()
    _record_activity(company_id, actor, "task_updated", "task", task.id, task.title)
    return task


@app.post("/companies/{company_id}/invitations", response_model=DealInvitation, status_code=201)
def create_deal_invitation(
    company_id: str,
    payload: DealInvitationCreate,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> DealInvitation:
    actor = _authorize_collaborator(company_id, request)
    company = store.company(company_id)
    if not company.organization_id:
        raise HTTPException(status_code=400, detail="An organization is required for invitations")
    if any(
        item.invited_user_id == payload.invited_user_id and item.status == InvitationStatus.pending
        for item in store.company_invitations(company_id)
    ):
        raise HTTPException(status_code=409, detail="A pending invitation already exists")
    invitation = DealInvitation(
        company_id=company_id,
        organization_id=company.organization_id,
        invited_by=actor,
        **payload.model_dump(),
    )
    store.deal_invitations[invitation.id] = invitation
    _record_activity(company_id, actor, "invitation_created", "invitation", invitation.id, "Invited a teammate to the deal")
    return invitation


@app.get("/companies/{company_id}/invitations", response_model=list[DealInvitation])
def list_deal_invitations(
    company_id: str,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> list[DealInvitation]:
    _authorize_collaborator(company_id, request)
    return store.company_invitations(company_id)


@app.post("/invitations/{invitation_id}/accept", response_model=DealMember)
def accept_deal_invitation(
    invitation_id: str,
    request: Request,
    _: None = Depends(collaboration_transaction),
) -> DealMember:
    invitation = store.deal_invitations.get(invitation_id)
    if not invitation or invitation.status != InvitationStatus.pending:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if organization_id(request) != invitation.organization_id or actor_id(request) != invitation.invited_user_id:
        raise HTTPException(status_code=404, detail="Invitation not found")
    company = store.company(invitation.company_id)
    member = next(
        (item for item in store.company_members(company.id) if item.user_id == invitation.invited_user_id),
        None,
    )
    if not member:
        member = DealMember(
            company_id=company.id,
            organization_id=invitation.organization_id,
            user_id=invitation.invited_user_id,
            display_name=invitation.display_name,
            role=invitation.role,
        )
        store.deal_members[member.id] = member
    invitation.status = InvitationStatus.accepted
    invitation.accepted_at = now()
    _record_activity(company.id, invitation.invited_user_id, "invitation_accepted", "invitation", invitation.id, "Joined the deal workspace")
    return member


def _validate_collaboration_links(company_id: str, claim_ids: list[str], evidence_ids: list[str]) -> None:
    claim_map = {claim.id: claim for claim in store.company_claims(company_id)}
    evidence_map = {evidence.id: evidence for evidence in store.company_evidence(company_id)}
    if any(item not in claim_map for item in claim_ids):
        raise HTTPException(status_code=422, detail="Every claim must belong to this deal")
    if any(item not in evidence_map for item in evidence_ids):
        raise HTTPException(status_code=422, detail="Every evidence item must belong to this deal")


def _authorize_collaborator(company_id: str, request: Request) -> str:
    """Bootstrap the first teammate, then enforce workspace membership."""
    company = store.company(company_id)
    actor = actor_id(request)
    request_org = organization_id(request)
    if company.organization_id and company.organization_id != request_org:
        raise HTTPException(status_code=404, detail="Deal workspace not found")
    if not company.organization_id and os.getenv("CLERK_SECRET_KEY"):
        raise HTTPException(status_code=403, detail="Deal is not assigned to an organization")
    if not company.organization_id and request_org:
        company.organization_id = request_org
    members = store.company_members(company_id)
    if not members:
        member = DealMember(
            company_id=company_id,
            organization_id=company.organization_id,
            user_id=actor,
            display_name=request.headers.get("X-Actor-Name"),
            role=CollaborationRole.partner,
        )
        store.deal_members[member.id] = member
        return actor
    if not any(
        member.user_id == actor and member.organization_id == company.organization_id
        for member in members
    ):
        raise HTTPException(status_code=403, detail="You are not a member of this deal workspace")
    return actor


def _record_activity(
    company_id: str,
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
) -> DealActivity:
    activity = DealActivity(
        company_id=company_id,
        actor_id=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
    )
    store.deal_activity[activity.id] = activity
    return activity


@app.post("/companies", response_model=Company, status_code=201)
def create_company(payload: CompanyCreate, request: Request) -> Company:
    company = Company(organization_id=organization_id(request), **payload.model_dump())
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
    enrich_founder_passports(store.company_founders(company_id), source)
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
            enrich_founder_passports(store.company_founders(company_id), source)

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


@app.get("/companies/{company_id}/founder-passports", response_model=list[FounderPassport])
def get_founder_passports(company_id: str) -> list[FounderPassport]:
    return [build_founder_passport(founder) for founder in store.company_founders(company_id)]


@app.post("/companies/{company_id}/founder-passports/enrich", response_model=FounderEnrichmentResult)
def enrich_company_founders(
    company_id: str,
    payload: FounderEnrichmentRequest,
) -> FounderEnrichmentResult:
    store.company(company_id)
    founders = store.company_founders(company_id)
    if not founders:
        raise HTTPException(status_code=400, detail="Ingest a founder source before enrichment")

    connectors = payload.connectors or [ConnectorKind.tavily]
    unsupported = [connector.value for connector in connectors if connector not in {ConnectorKind.tavily, ConnectorKind.exa}]
    if unsupported:
        raise HTTPException(
            status_code=422,
            detail=f"Founder enrichment supports tavily and exa only: {', '.join(unsupported)}",
        )

    created: list[Source] = []
    deduped = 0
    company = store.company(company_id)
    for founder in founders:
        query = _founder_enrichment_query(founder.name, company.name)
        for connector in connectors:
            signals = pull_signals([connector], query)
            for signal in signals[: payload.max_sources_per_founder]:
                source = Source(
                    company_id=company_id,
                    source_type=SourceType(signal.source.value),
                    title=signal.title,
                    url=signal.url,
                    text=signal.text,
                    metadata={
                        **signal.metadata,
                        "founder_enrichment": True,
                        "founder_name": founder.name,
                        "founders": [{"name": founder.name, "github": founder.github}],
                        "observed_at": signal.observed_at.isoformat(),
                        "search_query": query,
                    },
                    submitted_at=signal.observed_at,
                )
                duplicate = find_duplicate_source(store.company_sources(company_id), source)
                if duplicate:
                    deduped += 1
                    continue
                store.sources[source.id] = source
                created.append(source)

    store.save()
    ingestion = ingest_company(company_id)
    return FounderEnrichmentResult(
        company_id=company_id,
        founder_ids=[founder.id for founder in founders],
        connectors=connectors,
        created_sources=created,
        deduped_sources=deduped,
        ingestion=ingestion,
    )


@app.get("/founders/{founder_id}/passport", response_model=FounderPassport)
def get_founder_passport(founder_id: str) -> FounderPassport:
    return build_founder_passport(store.founder(founder_id))


@app.get("/founders", response_model=list[Founder])
def list_founders() -> list[Founder]:
    return list(store.founders.values())


def _founder_enrichment_query(founder_name: str, company_name: str) -> str:
    return (
        f'"{founder_name}" founder {company_name} '
        "career education previous startup work history"
    )


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
            f"We are mapping exceptional founders for the Maschmeyer Group Iskra. "
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
        VoiceIntent.unknown: "Iskra action",
    }
    return f"I routed this to the {labels[intent]} view for the workspace to handle."


@app.post("/demo/seed", response_model=DemoSeedResult)
def seed_demo_data(reset: bool = True) -> DemoSeedResult:
    return seed_demo(reset=reset)


def _upsert_founder(founder: Founder) -> Founder:
    key = f"{founder.company_id}:{founder.name.lower()}"
    existing = store.founders.get(key)
    if not existing:
        company = store.company(founder.company_id)
        placeholder_key = f"{founder.company_id}:{company.name.lower()} founder"
        placeholder = store.founders.pop(placeholder_key, None)
        if placeholder:
            placeholder.name = founder.name
            existing = placeholder
            store.founders[key] = existing
        else:
            store.founders[key] = founder
            return founder
    if founder.role and (not existing.role or existing.role == "Founder"):
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


def _refresh_founder_scores(company_id: str) -> None:
    for founder in store.company_founders(company_id):
        score = update_founder_score(
            founder,
            store.company_claims(company_id),
            store.company_sources(company_id),
            store.company_evidence(company_id),
        )
        founder.cold_start = score.cold_start
        store.founder_scores[founder.id] = score


from .models import AssistantQueryRequest, AssistantResponse
from .llm import answer_portfolio_question


@app.post("/assistant/query", response_model=AssistantResponse)
def assistant_query(payload: AssistantQueryRequest) -> AssistantResponse:
    history = [{"role": m.role, "content": m.content} for m in payload.history]
    answer = answer_portfolio_question(payload.question, payload.context, history)
    if answer is None:
        return AssistantResponse(answer=_assistant_fallback(payload.context), grounded=False)
    return AssistantResponse(answer=answer.strip(), grounded=True)


def _assistant_fallback(context: str) -> str:
    if not context.strip():
        return (
            "I cannot see the portfolio yet. Open the dashboard so the companies load, "
        "then ask me again."
        )
    return (
        "The language model is not configured on this API service, so I cannot answer in "
        "natural language yet. Set OPENAI_API_KEY on the service and I will reason across the "
        "whole portfolio. Until then, the dashboard filters and sortable columns cover most questions."
    )
