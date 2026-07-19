import os

from collections.abc import Generator

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse

from . import config as config
from .document_parser import LLM_TASKS, parse_document
from .demo import seed_demo
from .models import (
    Claim,
    AnalysisJob,
    AnalysisJobCreate,
    AnalysisJobUpdate,
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
    DiscoveryCandidate,
    DiscoveryCandidateKind,
    DiscoveryCandidateStatus,
    DiscoveryPromotionResult,
    DiscoveryScanResult,
    DealWorkspace,
    DecisionReadiness,
    DocumentUploadResult,
    Dossier,
    Evidence,
    Founder,
    FundThesis,
    FounderEnrichmentRequest,
    FounderEnrichmentResult,
    FounderPassport,
    FounderSearchRequest,
    IngestionRun,
    IngestionStatus,
    InternalMemory,
    InternalMemoryCreate,
    InternalMemoryKind,
    InvitationStatus,
    Segment,
    SearchMatch,
    RankedFounder,
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
    OpportunityDraft,
    OpportunityIntentRequest,
)
from .connectors import pull_signals
from .discovery import run_discovery_scan
from .founder_passport import build_founder_passport, enrich_founder_passports
from .llm import parse_founder_query, parse_opportunity_intent, parse_voice_command
from .memory import build_timeline, calculate_readiness, refresh_company_memory
from .pipeline import extract_claims, extract_company_update, extract_founders, parse_source
from .provenance import apply_company_update, find_duplicate_source, initialize_company_provenance
from .search import search_founders
from .store import store
from .outcomes import simulate_outcome
from .voice import encode_audio, narrate_text, transcribe_audio
from .auth import actor_id, auth_context, organization_id
from .jobs import enqueue_analysis_job
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Iskra API", version="0.1.0")
_cors_origins = [item.strip() for item in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_VOICE_AUDIO_BYTES = 25_000_000


@app.middleware("http")
async def enforce_company_tenant(request: Request, call_next):
    """Hide company-scoped resources outside the active Clerk organization."""
    parts = request.url.path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "companies" and parts[1] in store.companies:
        company = store.companies[parts[1]]
        try:
            request_org = organization_id(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        if company.organization_id and company.organization_id != request_org:
            return JSONResponse(status_code=404, content={"detail": "Company not found"})
        if os.getenv("CLERK_SECRET_KEY") and not company.organization_id:
            return JSONResponse(status_code=403, content={"detail": "Company is not assigned to an organization"})
    return await call_next(request)


def collaboration_transaction() -> Generator[None, None, None]:
    """Reload and commit collaboration rows inside one SQLite write lock."""
    with store.db.immediate_transaction() as connection:
        store.reload_collaboration()
        yield
        store.save_collaboration(connection)


def _authorize_company_access(company_id: str, request: Request) -> Company:
    """Apply the organization boundary to routes without a company URL middleware check."""
    company = store.company(company_id)
    request_org = organization_id(request)
    if company.organization_id and company.organization_id != request_org:
        raise HTTPException(status_code=404, detail="Company not found")
    if os.getenv("CLERK_SECRET_KEY") and not company.organization_id:
        raise HTTPException(status_code=403, detail="Company is not assigned to an organization")
    return company


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/me")
def current_user(request: Request) -> dict:
    """Stable handoff endpoint for the Clerk-aware frontend."""
    claims = auth_context(request)
    return {
        "user_id": claims.get("user_id"),
        "session_id": claims.get("session_id"),
        "organization_id": claims.get("organization_id"),
        "organization_role": claims.get("org_role"),
        "organization_permissions": claims.get("org_permissions", []),
    }


def _thesis_organization(request: Request) -> str:
    return organization_id(request) or "demo-org"


@app.get("/thesis", response_model=FundThesis)
def get_thesis(request: Request) -> FundThesis:
    organization = _thesis_organization(request)
    return store.fund_theses.get(organization) or FundThesis(organization_id=organization)


@app.put("/thesis", response_model=FundThesis)
def save_thesis(payload: FundThesis, request: Request) -> FundThesis:
    organization = _thesis_organization(request)
    thesis = payload.model_copy(update={"organization_id": organization, "updated_at": now()})
    store.fund_theses[organization] = thesis
    store.save()
    return thesis


@app.get("/discovery/candidates", response_model=list[DiscoveryCandidate])
def list_discovery_candidates(request: Request) -> list[DiscoveryCandidate]:
    organization = _thesis_organization(request)
    return sorted(
        [
            item
            for item in store.discovery_candidates.values()
            if item.organization_id == organization and item.candidate_kind == DiscoveryCandidateKind.company
        ],
        key=lambda item: (item.status != DiscoveryCandidateStatus.new, -item.score, item.created_at),
    )


@app.post("/discovery/scan", response_model=DiscoveryScanResult)
def scan_discovery(request: Request) -> DiscoveryScanResult:
    organization = _thesis_organization(request)
    thesis = store.fund_theses.get(organization) or FundThesis(organization_id=organization)
    run, candidates = run_discovery_scan(store, organization, thesis)
    store.save()
    return DiscoveryScanResult(run=run, candidates=candidates, queries=run.queries)


@app.post("/discovery/candidates/{candidate_id}/promote", response_model=DiscoveryPromotionResult, status_code=201)
def promote_discovery_candidate(candidate_id: str, request: Request) -> DiscoveryPromotionResult:
    candidate = store.discovery_candidates.get(candidate_id)
    if not candidate or candidate.organization_id != _thesis_organization(request):
        raise HTTPException(status_code=404, detail="Discovery candidate not found")
    if candidate.candidate_kind != DiscoveryCandidateKind.company:
        raise HTTPException(status_code=409, detail="This public signal is research, not a company lead")
    if candidate.company_id:
        return DiscoveryPromotionResult(candidate=candidate, company=store.company(candidate.company_id))

    company = Company(
        name=candidate.name,
        organization_id=candidate.organization_id,
        description=candidate.headline,
    )
    initialize_company_provenance(company, "public_discovery")
    store.companies[company.id] = company
    source = Source(
        company_id=company.id,
        source_type=SourceType(candidate.source_type.value),
        title=candidate.headline,
        url=candidate.source_url,
        text=candidate.why_now,
        metadata={**candidate.source_metadata, "discovery_candidate_id": candidate.id, "discovered_at": candidate.observed_at.isoformat()},
    )
    store.sources[source.id] = source
    candidate.status = DiscoveryCandidateStatus.promoted
    candidate.company_id = company.id
    candidate.updated_at = now()
    _ingest_company(company.id)
    store.save()
    return DiscoveryPromotionResult(candidate=candidate, company=company)


@app.get("/analysis-jobs", response_model=list[AnalysisJob])
def list_analysis_jobs(request: Request) -> list[AnalysisJob]:
    request_org = organization_id(request)
    jobs = list(store.analysis_jobs.values())
    if request_org:
        jobs = [job for job in jobs if job.organization_id == request_org]
    return sorted(jobs, key=lambda job: job.updated_at, reverse=True)


@app.get("/usage")
def workspace_usage(request: Request) -> dict:
    request_org = organization_id(request)
    jobs = list(store.analysis_jobs.values())
    if request_org:
        jobs = [job for job in jobs if job.organization_id == request_org]
    limit = max(1, int(os.getenv("VCBRAIN_ANALYSIS_CREDIT_LIMIT", "100")))
    used = len(jobs)
    return {"used": used, "limit": limit, "remaining": max(0, limit - used), "label": "Analysis credits"}


@app.post("/analysis-jobs", response_model=AnalysisJob, status_code=201)
def create_analysis_job(payload: AnalysisJobCreate, request: Request) -> AnalysisJob:
    company = _authorize_company_access(payload.company_id, request)
    request_org = organization_id(request)
    if company.organization_id and company.organization_id != request_org:
        raise HTTPException(status_code=404, detail="Company not found")
    job = AnalysisJob(
        company_id=company.id,
        organization_id=company.organization_id,
        created_by=actor_id(request),
        stage="creating",
        progress=8,
    )
    store.analysis_jobs[job.id] = job
    store.save()
    return job


@app.patch("/analysis-jobs/{job_id}", response_model=AnalysisJob)
def update_analysis_job(job_id: str, payload: AnalysisJobUpdate, request: Request) -> AnalysisJob:
    job = store.analysis_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    request_org = organization_id(request)
    _authorize_company_access(job.company_id, request)
    if job.organization_id and job.organization_id != request_org:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    job.stage = payload.stage
    job.progress = payload.progress
    job.status = payload.status
    job.error = payload.error
    job.updated_at = now()
    store.save()
    return job


@app.post("/analysis-jobs/{job_id}/run", response_model=AnalysisJob, status_code=202)
def run_analysis_job(job_id: str, request: Request) -> AnalysisJob:
    job = store.analysis_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    request_org = organization_id(request)
    _authorize_company_access(job.company_id, request)
    if job.organization_id and job.organization_id != request_org:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    if job.status == "running" and job.stage != "creating":
        return job
    job.status = "running"
    job.stage = "queued"
    job.progress = 10
    job.attempts += 1
    job.updated_at = now()
    store.save()
    enqueue_analysis_job(lambda: _execute_analysis_job(job.id))
    return job


@app.post("/analysis-jobs/{job_id}/retry", response_model=AnalysisJob, status_code=202)
def retry_analysis_job(job_id: str, request: Request) -> AnalysisJob:
    job = store.analysis_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    if job.attempts >= job.max_attempts:
        raise HTTPException(status_code=409, detail="This analysis has reached its retry limit")
    return run_analysis_job(job_id, request)


@app.post("/outcomes/simulate", response_model=OutcomeSimulationResult)
def simulate_outcomes(payload: OutcomeSimulationInput, request: Request) -> OutcomeSimulationResult:
    auth_context(request)
    return simulate_outcome(payload)


@app.post("/companies/{company_id}/outcomes/simulate", response_model=OutcomeSimulationResult)
def simulate_company_outcomes(
    company_id: str,
    payload: OutcomeSimulationInput,
    request: Request,
) -> OutcomeSimulationResult:
    _authorize_company_access(company_id, request)
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
    _validate_note_parent(company_id, payload.parent_id)
    note = CollaborationNote(company_id=company_id, organization_id=store.company(company_id).organization_id, author_id=actor, **payload.model_dump())
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
    _validate_note_parent(company_id, payload.parent_id)
    note.body = payload.body
    note.claim_ids = payload.claim_ids
    note.evidence_ids = payload.evidence_ids
    note.anchor = payload.anchor
    note.mentions = payload.mentions
    note.parent_id = payload.parent_id
    note.status = payload.status
    note.position_x = payload.position_x
    note.position_y = payload.position_y
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
    task = DealTask(company_id=company_id, organization_id=store.company(company_id).organization_id, creator_id=actor, **payload.model_dump())
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


def _validate_note_parent(company_id: str, parent_id: str | None) -> None:
    if parent_id:
        parent = store.collaboration_notes.get(parent_id)
        if not parent or parent.company_id != company_id:
            raise HTTPException(status_code=404, detail="Parent comment not found")


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
        organization_id=store.company(company_id).organization_id,
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
def list_companies(request: Request) -> list[Company]:
    request_org = organization_id(request)
    if not request_org:
        return list(store.companies.values())
    return [company for company in store.companies.values() if company.organization_id == request_org]


@app.post("/sources", response_model=Source, status_code=201)
def create_source(payload: SourceCreate, request: Request) -> Source:
    _authorize_company_access(payload.company_id, request)
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


def _memory_organization(request: Request) -> str:
    return organization_id(request) or "demo-org"


def _validate_memory_links(payload: InternalMemoryCreate, request: Request) -> tuple[str, Company | None]:
    organization = _memory_organization(request)
    company = _authorize_company_access(payload.company_id, request) if payload.company_id else None
    if company and company.organization_id and company.organization_id != organization:
        raise HTTPException(status_code=404, detail="Company not found")
    if payload.founder_id:
        founder = store.founder(payload.founder_id)
        _authorize_company_access(founder.company_id, request)
        if company and founder.company_id != company.id:
            raise HTTPException(status_code=422, detail="Founder must belong to the selected company")
        if founder.company_id and store.company(founder.company_id).organization_id not in {None, organization}:
            raise HTTPException(status_code=404, detail="Founder not found")
    return organization, company


@app.get("/internal-memory", response_model=list[InternalMemory])
def list_internal_memory(
    request: Request,
    company_id: str | None = None,
    kind: InternalMemoryKind | None = None,
) -> list[InternalMemory]:
    organization = _memory_organization(request)
    rows = [item for item in store.internal_memories.values() if item.organization_id == organization]
    if company_id:
        rows = [item for item in rows if item.company_id == company_id]
    if kind:
        rows = [item for item in rows if item.kind == kind]
    return sorted(rows, key=lambda item: item.updated_at, reverse=True)


@app.post("/internal-memory", response_model=InternalMemory, status_code=201)
def create_internal_memory(payload: InternalMemoryCreate, request: Request) -> InternalMemory:
    organization, _ = _validate_memory_links(payload, request)
    duplicate = next(
        (item for item in store.internal_memories.values()
         if item.organization_id == organization and item.content_fingerprint == InternalMemory(**payload.model_dump(), organization_id=organization, author_id=actor_id(request)).content_fingerprint),
        None,
    )
    if duplicate:
        raise HTTPException(status_code=409, detail={"message": "This internal memory already exists", "existing_memory_id": duplicate.id})
    memory = InternalMemory(
        organization_id=organization,
        author_id=actor_id(request),
        **payload.model_dump(),
    )
    store.internal_memories[memory.id] = memory
    store.save()
    return memory


@app.get("/companies/{company_id}/internal-memory", response_model=list[InternalMemory])
def get_company_internal_memory(company_id: str, request: Request) -> list[InternalMemory]:
    company = _authorize_company_access(company_id, request)
    organization = _memory_organization(request)
    if company.organization_id and company.organization_id != organization:
        raise HTTPException(status_code=404, detail="Company not found")
    return sorted(store.company_internal_memories(company_id), key=lambda item: item.updated_at, reverse=True)


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
def pull_sources(payload: SourcePullRequest, request: Request) -> SourcePullResult:
    company = _authorize_company_access(payload.company_id, request)
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
    try:
        signals = pull_signals(
            connectors,
            query,
            payload.github_user,
            payload.arxiv_query,
            str(website_url) if website_url else None,
            payload.max_website_pages,
        )
    except TypeError:
        # Keeps lightweight connector fakes and older integrations compatible.
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
def ingest_company(company_id: str, request: Request) -> IngestionRun:
    _authorize_company_access(company_id, request)
    return _ingest_company(company_id)


def _ingest_company(company_id: str) -> IngestionRun:
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


def _execute_analysis_job(job_id: str) -> None:
    job = store.analysis_jobs.get(job_id)
    if not job:
        return
    try:
        job.stage = "ingesting"
        job.progress = 35
        job.updated_at = now()
        store.save()
        _ingest_company(job.company_id)
        job.stage = "complete"
        job.progress = 100
        job.status = "complete"
        job.error = None
    except Exception as exc:
        job.status = "failed"
        job.stage = "failed"
        job.progress = min(job.progress, 90)
        job.error = f"Analysis could not finish: {type(exc).__name__}"
    job.updated_at = now()
    store.save()


@app.get("/companies/{company_id}/dossier", response_model=Dossier)
def get_dossier(company_id: str, request: Request) -> Dossier:
    _authorize_company_access(company_id, request)
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
def get_readiness(company_id: str, request: Request) -> DecisionReadiness:
    _authorize_company_access(company_id, request)
    return calculate_readiness(store, company_id)


@app.get("/companies/{company_id}/timeline", response_model=CompanyTimeline)
def get_timeline(company_id: str, request: Request) -> CompanyTimeline:
    _authorize_company_access(company_id, request)
    return build_timeline(store, company_id)


@app.get("/companies/{company_id}/claims", response_model=list[Claim])
def get_claims(company_id: str, request: Request) -> list[Claim]:
    _authorize_company_access(company_id, request)
    return store.company_claims(company_id)


@app.get("/companies/{company_id}/evidence", response_model=list[Evidence])
def get_evidence(company_id: str, request: Request) -> list[Evidence]:
    _authorize_company_access(company_id, request)
    return store.company_evidence(company_id)


@app.get("/companies/{company_id}/founders", response_model=list[Founder])
def get_founders(company_id: str, request: Request) -> list[Founder]:
    _authorize_company_access(company_id, request)
    return store.company_founders(company_id)


@app.get("/companies/{company_id}/founder-passports", response_model=list[FounderPassport])
def get_founder_passports(company_id: str, request: Request) -> list[FounderPassport]:
    _authorize_company_access(company_id, request)
    return [build_founder_passport(founder) for founder in store.company_founders(company_id)]


@app.post("/companies/{company_id}/founder-passports/enrich", response_model=FounderEnrichmentResult)
def enrich_company_founders(
    company_id: str,
    payload: FounderEnrichmentRequest,
    request: Request,
) -> FounderEnrichmentResult:
    _authorize_company_access(company_id, request)
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
    ingestion = _ingest_company(company_id)
    return FounderEnrichmentResult(
        company_id=company_id,
        founder_ids=[founder.id for founder in founders],
        connectors=connectors,
        created_sources=created,
        deduped_sources=deduped,
        ingestion=ingestion,
    )


@app.get("/founders/{founder_id}/passport", response_model=FounderPassport)
def get_founder_passport(founder_id: str, request: Request) -> FounderPassport:
    founder = store.founder(founder_id)
    _authorize_company_access(founder.company_id, request)
    return build_founder_passport(founder)


@app.get("/founders", response_model=list[Founder])
def list_founders(request: Request) -> list[Founder]:
    request_org = organization_id(request)
    founders = list(store.founders.values())
    if request_org:
        founders = [founder for founder in founders if (store.company(founder.company_id).organization_id == request_org)]
    return founders


@app.get("/founders/ranked", response_model=list[RankedFounder])
def ranked_founders(request: Request, limit: int = 50) -> list[RankedFounder]:
    request_org = organization_id(request)
    rows: list[RankedFounder] = []
    for founder in store.founders.values():
        company = store.company(founder.company_id)
        if request_org and company.organization_id != request_org:
            continue
        score = store.founder_scores.get(founder.id)
        history = sorted(
            (item for item in store.founder_score_history.values() if item.founder_id == founder.id),
            key=lambda item: item.created_at,
            reverse=True,
        )
        delta = history[0].score_delta if history else 0
        trend = "up" if delta > 0.5 else "down" if delta < -0.5 else "flat"
        rows.append(RankedFounder(
            founder=founder,
            company=company,
            score=score,
            score_delta=delta,
            trend=trend,
            internal_memory_count=len(store.company_internal_memories(company.id)),
        ))
    rows.sort(key=lambda row: (row.score.score if row.score else -1, row.score.confidence if row.score else -1), reverse=True)
    return rows[: max(1, min(limit, 100))]


def _founder_enrichment_query(founder_name: str, company_name: str) -> str:
    return (
        f'"{founder_name}" founder {company_name} '
        "career education previous startup work history"
    )


@app.get("/companies/{company_id}/events", response_model=list[TriggerEvent])
def get_events(company_id: str, request: Request) -> list[TriggerEvent]:
    _authorize_company_access(company_id, request)
    return store.company_trigger_events(company_id)


@app.post("/founders/search", response_model=list[SearchMatch])
def search_founder_memory(payload: FounderSearchRequest, request: Request) -> list[SearchMatch]:
    request_org = organization_id(request)
    companies = list(store.companies.values())
    if request_org:
        companies = [company for company in companies if company.organization_id == request_org]
    company_ids = {company.id for company in companies}
    return search_founders(
        payload.query,
        companies,
        [founder for founder in store.founders.values() if founder.company_id in company_ids],
        {key: value for key, value in store.founder_scores.items() if value.founder_id in {founder.id for founder in store.founders.values() if founder.company_id in company_ids}},
        [claim for claim in store.claims.values() if claim.company_id in company_ids],
        [source for source in store.sources.values() if source.company_id in company_ids],
        [evidence for evidence in store.evidence.values() if store.sources.get(evidence.source_id) and store.sources[evidence.source_id].company_id in company_ids],
        payload.limit,
    )


@app.post("/founders/activate", response_model=ActivationDraft)
def activate_founder(payload: ActivateRequest, request: Request) -> ActivationDraft:
    founder = next((item for item in store.founders.values() if item.id == payload.founder_id), None)
    if not founder:
        raise HTTPException(status_code=404, detail="Founder not found")

    _authorize_company_access(founder.company_id, request)
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
            "Best,\nThe Iskra team"
        ),
        evidence_ids=evidence_ids,
    )


@app.post("/voice/narrate")
def narrate(payload: VoiceNarrationRequest, request: Request) -> Response:
    auth_context(request)
    audio = narrate_text(payload.text, payload.voice_id)
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'inline; filename="vcbrain-narration.mp3"'},
    )


@app.post("/voice/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...)) -> dict[str, str]:
    auth_context(request)
    content = await audio.read()
    if len(content) > MAX_VOICE_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio input exceeds the 25 MB limit")
    return {"transcript": transcribe_audio(content, audio.filename or "iskra.webm", audio.content_type)}


@app.post("/voice/query", response_model=VoiceQueryResponse)
async def query_by_voice(
    request: Request,
    audio: UploadFile = File(...),
    speak_response: bool = Form(False),
    voice_id: str | None = Form(None),
    limit: int = Form(10),
) -> VoiceQueryResponse:
    auth_context(request)
    if not 1 <= limit <= 50:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 50")
    content = await audio.read(MAX_VOICE_AUDIO_BYTES + 1)
    if len(content) > MAX_VOICE_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio input exceeds the 25 MB limit")
    transcript = transcribe_audio(content, audio.filename or "voice.webm", audio.content_type)
    return _run_voice_query(transcript, limit, speak_response, voice_id, request)


@app.post("/voice/query/text", response_model=VoiceQueryResponse)
def query_by_text(payload: VoiceTextQueryRequest, request: Request) -> VoiceQueryResponse:
    auth_context(request)
    return _run_voice_query(payload.transcript, payload.limit, payload.speak_response, payload.voice_id, request)


def _run_voice_query(
    transcript: str,
    limit: int,
    speak_response: bool,
    voice_id: str | None,
    request: Request,
) -> VoiceQueryResponse:
    command = parse_voice_command(transcript)
    parsed_query = None
    results: list[SearchMatch] = []
    if command.intent == VoiceIntent.founder_search:
        parsed_query = parse_founder_query(command.query)
        request_org = organization_id(request)
        companies = list(store.companies.values())
        if request_org:
            companies = [company for company in companies if company.organization_id == request_org]
        company_ids = {company.id for company in companies}
        founders = [founder for founder in store.founders.values() if founder.company_id in company_ids]
        results = search_founders(
            command.query,
            companies,
            founders,
            {key: value for key, value in store.founder_scores.items() if value.founder_id in {founder.id for founder in founders}},
            [claim for claim in store.claims.values() if claim.company_id in company_ids],
            [source for source in store.sources.values() if source.company_id in company_ids],
            [evidence for evidence in store.evidence.values() if store.sources.get(evidence.source_id) and store.sources[evidence.source_id].company_id in company_ids],
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
def seed_demo_data(request: Request, reset: bool = True) -> DemoSeedResult:
    if os.getenv("CLERK_SECRET_KEY") or os.getenv("APP_ENV", "").lower() == "production":
        raise HTTPException(status_code=404, detail="Demo seed is disabled in deployed environments")
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


from .models import AssistantQueryRequest, AssistantResponse, ChatTitleRequest, ChatTitleResponse
from .llm import answer_portfolio_question, generate_chat_title


@app.post("/assistant/query", response_model=AssistantResponse)
def assistant_query(payload: AssistantQueryRequest, request: Request) -> AssistantResponse:
    auth_context(request)
    history = [{"role": m.role, "content": m.content} for m in payload.history]
    answer = answer_portfolio_question(payload.question, payload.context, history)
    if answer is None:
        return AssistantResponse(answer=_assistant_fallback(payload.context), grounded=False)
    return AssistantResponse(answer=answer.strip(), grounded=True)


@app.post("/assistant/title", response_model=ChatTitleResponse)
def assistant_title(payload: ChatTitleRequest, request: Request) -> ChatTitleResponse:
    auth_context(request)
    title = generate_chat_title(payload.question)
    return ChatTitleResponse(title=title or payload.question.strip()[:80])


@app.post("/assistant/opportunity-intent", response_model=OpportunityDraft)
def assistant_opportunity_intent(payload: OpportunityIntentRequest, request: Request) -> OpportunityDraft:
    auth_context(request)
    return parse_opportunity_intent(payload.request)


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
