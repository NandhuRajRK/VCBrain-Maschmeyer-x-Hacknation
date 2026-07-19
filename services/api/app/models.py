from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl, model_validator


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def now() -> datetime:
    return datetime.now(timezone.utc)


class SourceType(str, Enum):
    pitch_deck = "pitch_deck"
    financial_model = "financial_model"
    founder_questionnaire = "founder_questionnaire"
    document = "document"
    website = "website"
    founder_linkedin = "founder_linkedin"
    github = "github"
    press = "press"
    hacker_news = "hacker_news"
    product_hunt = "product_hunt"
    arxiv = "arxiv"
    perplexity = "perplexity"
    exa = "exa"
    tavily = "tavily"
    opencorporates = "opencorporates"
    sec_edgar = "sec_edgar"
    patentsview = "patentsview"
    crm_note = "crm_note"
    other = "other"


class SourceCategory(str, Enum):
    github = "github"
    hacker_news = "hacker_news"
    arxiv = "arxiv"
    product_hunt = "product_hunt"
    press = "press"
    pitch_deck = "pitch_deck"
    founder_doc = "founder_doc"


class IngestionStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    parsed = "parsed"
    failed = "failed"


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1)
    website: HttpUrl | None = None
    sector: str | None = None
    stage: str | None = None
    geography: str | None = None
    description: str | None = None


class Company(CompanyCreate):
    id: str = Field(default_factory=lambda: new_id("company"))
    organization_id: str | None = None
    created_at: datetime = Field(default_factory=now)
    field_provenance: dict[str, str] = Field(default_factory=dict)
    field_confidence: dict[str, float] = Field(default_factory=dict)


class CompanyUpdate(BaseModel):
    sector: str | None = None
    stage: str | None = None
    geography: str | None = None
    description: str | None = None


class FundThesis(BaseModel):
    organization_id: str
    sectors: list[str] = Field(default_factory=list)
    stages: list[str] = Field(default_factory=list)
    geographies: list[str] = Field(default_factory=list)
    preferred_models: list[str] = Field(default_factory=list)
    exclusions: list[str] = Field(default_factory=list)
    check_size_min_usd: float = Field(default=100_000, ge=0)
    check_size_max_usd: float = Field(default=1_000_000, ge=0)
    ownership_target_pct: float = Field(default=10, ge=0, le=100)
    risk_appetite: str = "moderate"
    updated_at: datetime = Field(default_factory=now)


class AnalysisJobCreate(BaseModel):
    company_id: str


class AnalysisJobUpdate(BaseModel):
    stage: str
    progress: int = Field(ge=0, le=100)
    status: str = "running"
    error: str | None = None


class AnalysisJob(AnalysisJobUpdate):
    id: str = Field(default_factory=lambda: new_id("analysis_job"))
    company_id: str
    organization_id: str | None = None
    created_by: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    attempts: int = Field(default=0, ge=0)
    max_attempts: int = Field(default=3, ge=1, le=5)
    next_retry_at: datetime | None = None


class WorkHistoryEntry(BaseModel):
    organization: str = Field(min_length=1)
    role: str = Field(min_length=1)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    source_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class EducationHistoryEntry(BaseModel):
    institution: str = Field(min_length=1)
    degree: str | None = None
    field_of_study: str | None = None
    graduation_year: int | None = Field(default=None, ge=1900, le=2100)
    source_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class PriorVentureEntry(BaseModel):
    company_name: str = Field(min_length=1)
    role: str = "Founder"
    founded_year: int | None = Field(default=None, ge=1900, le=2100)
    ended_year: int | None = Field(default=None, ge=1900, le=2100)
    outcome: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)


class FounderBackgroundExtraction(BaseModel):
    headline: str | None = None
    work_history: list[WorkHistoryEntry] = Field(default_factory=list)
    education_history: list[EducationHistoryEntry] = Field(default_factory=list)
    previous_ventures: list[PriorVentureEntry] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)


class Founder(BaseModel):
    id: str = Field(default_factory=lambda: new_id("founder"))
    company_id: str
    name: str
    role: str | None = None
    linkedin: HttpUrl | None = None
    github: str | None = None
    headline: str | None = None
    work_history: list[WorkHistoryEntry] = Field(default_factory=list)
    education_history: list[EducationHistoryEntry] = Field(default_factory=list)
    previous_ventures: list[PriorVentureEntry] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    passport_source_ids: list[str] = Field(default_factory=list)
    passport_confidence: float = Field(default=0, ge=0, le=1)
    cold_start: bool = True
    updated_at: datetime = Field(default_factory=now)


class FounderPassport(BaseModel):
    founder_id: str
    company_id: str
    name: str
    current_role: str | None = None
    headline: str | None = None
    work_history: list[WorkHistoryEntry]
    education_history: list[EducationHistoryEntry]
    previous_ventures: list[PriorVentureEntry]
    skills: list[str]
    source_ids: list[str]
    confidence: float = Field(ge=0, le=1)
    coverage: float = Field(ge=0, le=1)
    cold_start: bool
    gaps: list[str]
    updated_at: datetime


class ConnectorKind(str, Enum):
    github = "github"
    hacker_news = "hacker_news"
    product_hunt = "product_hunt"
    arxiv = "arxiv"
    website = "website"
    perplexity = "perplexity"
    exa = "exa"
    tavily = "tavily"
    opencorporates = "opencorporates"
    sec_edgar = "sec_edgar"
    patentsview = "patentsview"


class Signal(BaseModel):
    source: ConnectorKind
    title: str
    url: HttpUrl | None = None
    text: str
    observed_at: datetime = Field(default_factory=now)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SourcePullRequest(BaseModel):
    company_id: str
    connectors: list[ConnectorKind] = Field(default_factory=list)
    query: str | None = None
    github_user: str | None = None
    arxiv_query: str | None = None
    website_url: HttpUrl | None = None
    max_website_pages: int = Field(default=3, ge=1, le=5)


class SourcePullResult(BaseModel):
    company_id: str
    created_sources: list[Source]
    deduped_sources: int


class DiscoveryCandidateStatus(str, Enum):
    new = "new"
    promoted = "promoted"
    dismissed = "dismissed"


class DiscoveryIdentityStatus(str, Enum):
    needs_resolution = "needs_resolution"
    corroborated = "corroborated"


class DiscoveryCandidateKind(str, Enum):
    """The maturity of a public item before it reaches the investor inbox."""

    company = "company"
    research = "research"


class DiscoveryCandidate(BaseModel):
    id: str = Field(default_factory=lambda: new_id("candidate"))
    organization_id: str
    name: str = Field(min_length=1)
    headline: str = Field(min_length=1)
    source_type: ConnectorKind
    source_url: HttpUrl | None = None
    observed_at: datetime = Field(default_factory=now)
    score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    # Older rows did not prove a company identity. Defaulting them to research
    # keeps noisy historical scans out of the company-investigation inbox.
    candidate_kind: DiscoveryCandidateKind = DiscoveryCandidateKind.research
    identity_status: DiscoveryIdentityStatus = DiscoveryIdentityStatus.needs_resolution
    identity_reason: str = "Public signal requires identity resolution."
    why_now: str = Field(min_length=1)
    thesis_terms: list[str] = Field(default_factory=list)
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    status: DiscoveryCandidateStatus = DiscoveryCandidateStatus.new
    company_id: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class DiscoveryRun(BaseModel):
    id: str = Field(default_factory=lambda: new_id("discovery_run"))
    organization_id: str
    queries: list[str] = Field(default_factory=list)
    scanned_sources: int = Field(default=0, ge=0)
    new_candidates: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=now)


class DiscoveryScanResult(BaseModel):
    run: DiscoveryRun
    candidates: list[DiscoveryCandidate] = Field(default_factory=list)
    queries: list[str] = Field(default_factory=list)


class DiscoveryPromotionResult(BaseModel):
    candidate: DiscoveryCandidate
    company: Company


class FounderEnrichmentRequest(BaseModel):
    connectors: list[ConnectorKind] = Field(default_factory=list)
    max_sources_per_founder: int = Field(default=1, ge=1, le=3)


class SourceCreate(BaseModel):
    company_id: str
    source_type: SourceType
    title: str = Field(min_length=1)
    url: HttpUrl | None = None
    text: str | None = None
    location: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Source(SourceCreate):
    id: str = Field(default_factory=lambda: new_id("src"))
    status: IngestionStatus = IngestionStatus.queued
    submitted_at: datetime = Field(default_factory=now)
    source_category: SourceCategory = SourceCategory.founder_doc
    content_fingerprint: str | None = None
    duplicate_of_source_id: str | None = None

    @model_validator(mode="after")
    def set_source_category(self) -> "Source":
        self.source_category = _source_category(self.source_type)
        if not self.content_fingerprint:
            value = self.text or (str(self.url) if self.url else None) or self.title
            normalized = " ".join(value.lower().split())
            self.content_fingerprint = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
        return self


def _source_category(source_type: SourceType) -> SourceCategory:
    if source_type == SourceType.github:
        return SourceCategory.github
    if source_type == SourceType.hacker_news:
        return SourceCategory.hacker_news
    if source_type == SourceType.arxiv:
        return SourceCategory.arxiv
    if source_type == SourceType.product_hunt:
        return SourceCategory.product_hunt
    if source_type == SourceType.pitch_deck:
        return SourceCategory.pitch_deck
    if source_type in {
        SourceType.press,
        SourceType.website,
        SourceType.perplexity,
        SourceType.exa,
        SourceType.tavily,
        SourceType.opencorporates,
        SourceType.sec_edgar,
        SourceType.patentsview,
    }:
        return SourceCategory.press
    return SourceCategory.founder_doc


class Segment(BaseModel):
    id: str = Field(default_factory=lambda: new_id("seg"))
    source_id: str
    heading: str | None = None
    page: int | None = None
    text: str


class DocumentUploadResult(BaseModel):
    source: Source
    segments: list[Segment]
    warnings: list[str] = Field(default_factory=list)
    llm_tasks: list[str] = Field(default_factory=list)


class InternalMemoryKind(str, Enum):
    prior_memo = "prior_memo"
    rejected_deal = "rejected_deal"
    portfolio_company = "portfolio_company"
    crm_note = "crm_note"
    email = "email"
    partner_note = "partner_note"
    investment_committee = "investment_committee"


class InternalMemoryCreate(BaseModel):
    kind: InternalMemoryKind
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=50000)
    company_id: str | None = None
    founder_id: str | None = None
    author_name: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class InternalMemory(InternalMemoryCreate):
    id: str = Field(default_factory=lambda: new_id("memory"))
    organization_id: str
    author_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    content_fingerprint: str | None = None

    @model_validator(mode="after")
    def set_fingerprint(self) -> "InternalMemory":
        if not self.content_fingerprint:
            normalized = " ".join(f"{self.title} {self.body}".lower().split())
            self.content_fingerprint = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
        return self


class ClaimKind(str, Enum):
    company = "company"
    founder = "founder"
    traction = "traction"
    market = "market"
    product = "product"
    financial = "financial"


class ClaimStatus(str, Enum):
    extracted = "extracted"
    supported = "supported"
    disputed = "disputed"
    missing_evidence = "missing_evidence"


class ClaimVerification(str, Enum):
    unverified = "unverified"
    source_backed = "source_backed"
    independently_supported = "independently_supported"
    disputed = "disputed"
    missing_evidence = "missing_evidence"


class Evidence(BaseModel):
    id: str = Field(default_factory=lambda: new_id("ev"))
    source_id: str
    segment_id: str
    quote: str
    confidence: float = Field(ge=0, le=1)
    source_reliability: float = Field(default=0.5, ge=0, le=1)
    source_independence: str = "unknown"
    freshness_days: int | None = None
    directness: str = "indirect"
    confidence_reason: str | None = None


class Claim(BaseModel):
    id: str = Field(default_factory=lambda: new_id("claim"))
    company_id: str
    founder_id: str | None = None
    kind: ClaimKind
    text: str
    status: ClaimStatus = ClaimStatus.extracted
    verification: ClaimVerification = ClaimVerification.unverified
    status_reason: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class ExtractedClaim(BaseModel):
    kind: ClaimKind
    text: str = Field(min_length=1)
    confidence: float = Field(default=0.5, ge=0, le=1)


class ContradictionAssessment(BaseModel):
    contradicts: bool
    temporal_difference: bool = False
    confidence: float = Field(default=0.5, ge=0, le=1)
    reason: str


class FounderScore(BaseModel):
    founder_id: str
    score: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    cold_start: bool
    evidence_count: int
    evidence_coverage: float = Field(default=0, ge=0, le=1)
    contradiction_count: int = 0
    updated_at: datetime = Field(default_factory=now)
    notes: list[str] = Field(default_factory=list)


class RankedFounder(BaseModel):
    founder: Founder
    company: Company
    score: FounderScore | None = None
    score_delta: float = 0
    trend: str = "flat"
    internal_memory_count: int = 0


class FounderScoreSnapshot(BaseModel):
    id: str = Field(default_factory=lambda: new_id("score_snapshot"))
    company_id: str
    founder_id: str
    score: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    cold_start: bool
    evidence_count: int
    contradiction_count: int
    score_delta: float = 0
    confidence_delta: float = 0
    reason: str
    created_at: datetime = Field(default_factory=now)


class ClaimStatusChange(BaseModel):
    id: str = Field(default_factory=lambda: new_id("claim_change"))
    company_id: str
    claim_id: str
    previous_status: ClaimStatus
    current_status: ClaimStatus
    previous_verification: ClaimVerification
    current_verification: ClaimVerification
    confidence: float = Field(ge=0, le=1)
    reason: str
    created_at: datetime = Field(default_factory=now)


class DiligenceAction(BaseModel):
    priority: str
    category: str
    title: str
    reason: str
    suggested_source_type: SourceCategory | None = None
    claim_ids: list[str] = Field(default_factory=list)
    expected_readiness_gain: int = Field(default=0, ge=0, le=100)


class DecisionReadiness(BaseModel):
    company_id: str
    score: int = Field(ge=0, le=100)
    status: str
    components: dict[str, float]
    blockers: list[str] = Field(default_factory=list)
    next_actions: list[DiligenceAction] = Field(default_factory=list)
    contradiction_count: int = 0
    cold_start: bool = True
    updated_at: datetime = Field(default_factory=now)


class FounderSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=10, ge=1, le=50)


class ParsedFounderQuery(BaseModel):
    sectors: list[str] = Field(default_factory=list)
    geographies: list[str] = Field(default_factory=list)
    stages: list[str] = Field(default_factory=list)
    founder_traits: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    exclude_prior_vc: bool = False
    confidence: float = Field(default=0.5, ge=0, le=1)


class SearchMatch(BaseModel):
    company: Company
    founder: Founder
    founder_score: FounderScore | None = None
    match_score: float = Field(ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)


class ActivateRequest(BaseModel):
    founder_id: str
    context: str | None = None


class ActivationDraft(BaseModel):
    founder_id: str
    company_id: str
    subject: str
    message: str
    evidence_ids: list[str] = Field(default_factory=list)


class VoiceNarrationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice_id: str | None = None


class VoiceIntent(str, Enum):
    founder_search = "founder_search"
    company_dossier = "company_dossier"
    memo_review = "memo_review"
    decision_review = "decision_review"
    activation = "activation"
    unknown = "unknown"


class VoiceCommand(BaseModel):
    intent: VoiceIntent
    query: str = Field(min_length=1)
    confidence: float = Field(default=0.5, ge=0, le=1)


class VoiceTextQueryRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=2000)
    speak_response: bool = False
    voice_id: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class VoiceQueryResponse(BaseModel):
    transcript: str
    command: VoiceCommand
    parsed_query: ParsedFounderQuery | None = None
    results: list[SearchMatch] = Field(default_factory=list)
    response_text: str
    audio_available: bool = False
    audio_base64: str | None = None


class DemoSeedResult(BaseModel):
    companies: int
    founders: int
    claims: int
    evidence: int


class TriggerKind(str, Enum):
    new_application = "new_application"
    signal_threshold_crossed = "signal_threshold_crossed"
    contradiction_detected = "contradiction_detected"
    score_changed = "score_changed"
    cold_start_resolved = "cold_start_resolved"
    decision_ready = "decision_ready"


class TriggerEvent(BaseModel):
    id: str = Field(default_factory=lambda: new_id("event"))
    company_id: str
    kind: TriggerKind
    message: str
    created_at: datetime = Field(default_factory=now)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Dossier(BaseModel):
    company: Company
    founders: list[Founder]
    sources: list[Source]
    segments: list[Segment]
    claims: list[Claim]
    evidence: list[Evidence]
    founder_scores: list[FounderScore]
    trigger_events: list[TriggerEvent]


class CompanyTimeline(BaseModel):
    company_id: str
    score_snapshots: list[FounderScoreSnapshot]
    claim_changes: list[ClaimStatusChange]
    trigger_events: list[TriggerEvent]
    readiness: DecisionReadiness


class IngestionRun(BaseModel):
    company_id: str
    accepted_sources: int
    parsed_segments: int
    extracted_claims: int
    status: IngestionStatus


class FounderEnrichmentResult(BaseModel):
    company_id: str
    founder_ids: list[str]
    connectors: list[ConnectorKind]
    created_sources: list[Source]
    deduped_sources: int
    ingestion: IngestionRun


class CollaborationRole(str, Enum):
    partner = "partner"
    associate = "associate"
    analyst = "analyst"
    observer = "observer"


class CollaborationStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    done = "done"


class DealMemberCreate(BaseModel):
    user_id: str = Field(min_length=1)
    display_name: str | None = None
    role: CollaborationRole = CollaborationRole.analyst


class DealMember(DealMemberCreate):
    id: str = Field(default_factory=lambda: new_id("member"))
    company_id: str
    organization_id: str | None = None
    added_at: datetime = Field(default_factory=now)


class CollaborationNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=12000)
    claim_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    anchor: str | None = Field(default=None, max_length=200)
    mentions: list[str] = Field(default_factory=list, max_length=20)
    parent_id: str | None = None
    status: str = Field(default="open", pattern="^(open|resolved)$")
    position_x: float | None = Field(default=None, ge=0)
    position_y: float | None = Field(default=None, ge=0)


class CollaborationNoteUpdate(CollaborationNoteCreate):
    version: int = Field(ge=1)


class CollaborationNote(CollaborationNoteCreate):
    id: str = Field(default_factory=lambda: new_id("note"))
    company_id: str
    organization_id: str | None = None
    author_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    version: int = 1


class DealTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    assignee_id: str | None = None
    due_at: datetime | None = None


class DealTaskUpdate(BaseModel):
    status: CollaborationStatus | None = None
    assignee_id: str | None = None
    due_at: datetime | None = None
    version: int = Field(ge=1)


class DealTask(DealTaskCreate):
    id: str = Field(default_factory=lambda: new_id("task"))
    company_id: str
    organization_id: str | None = None
    creator_id: str
    status: CollaborationStatus = CollaborationStatus.open
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    version: int = 1


class DealActivity(BaseModel):
    id: str = Field(default_factory=lambda: new_id("activity"))
    company_id: str
    organization_id: str | None = None
    actor_id: str
    action: str
    entity_type: str
    entity_id: str
    summary: str
    created_at: datetime = Field(default_factory=now)


class DealWorkspace(BaseModel):
    company_id: str
    organization_id: str | None = None
    members: list[DealMember] = Field(default_factory=list)
    notes: list[CollaborationNote] = Field(default_factory=list)
    tasks: list[DealTask] = Field(default_factory=list)
    activity: list[DealActivity] = Field(default_factory=list)
    invitations: list["DealInvitation"] = Field(default_factory=list)


class InvitationStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    revoked = "revoked"


class DealInvitationCreate(BaseModel):
    invited_user_id: str = Field(min_length=1)
    display_name: str | None = None
    role: CollaborationRole = CollaborationRole.analyst


class DealInvitation(DealInvitationCreate):
    id: str = Field(default_factory=lambda: new_id("invite"))
    company_id: str
    organization_id: str
    invited_by: str
    status: InvitationStatus = InvitationStatus.pending
    created_at: datetime = Field(default_factory=now)
    accepted_at: datetime | None = None


class DealInvitationAccept(BaseModel):
    pass


class OutcomeSimulationInput(BaseModel):
    initial_investment_usd: float = Field(default=100_000, gt=0)
    entry_valuation_usd: float = Field(default=5_000_000, gt=0, description="Pre-money valuation")
    starting_mrr_usd: float = Field(default=25_000, ge=0)
    monthly_growth_pct: float = Field(default=10, ge=-99, le=200)
    monthly_churn_pct: float = Field(default=2, ge=0, le=100)
    gross_margin_pct: float = Field(default=70, ge=0, le=100)
    monthly_burn_usd: float = Field(default=100_000, ge=0)
    cash_on_hand_usd: float = Field(default=1_000_000, ge=0)
    months_to_next_round: int = Field(default=12, ge=1, le=60)
    next_round_raise_usd: float = Field(default=2_000_000, gt=0)
    target_next_round_dilution_pct: float = Field(default=20, gt=0, lt=100)
    exit_months: int = Field(default=60, ge=1, le=120)
    exit_revenue_multiple: float = Field(default=8, ge=0, le=100)
    exit_probability: float = Field(default=0.15, ge=0, le=1)


class OutcomeScenario(BaseModel):
    label: str
    next_round_projected_mrr_usd: float
    projected_mrr_usd: float
    projected_arr_usd: float
    runway_months: float | None
    required_next_round_pre_money_usd: float
    post_round_ownership_pct: float
    exit_value_usd: float
    expected_return_usd: float
    expected_moic: float


class OutcomeSimulationResult(BaseModel):
    company_id: str | None = None
    initial_ownership_pct: float
    effective_monthly_growth_pct: float
    next_round_projected_mrr_usd: float
    projected_mrr_usd: float
    projected_arr_usd: float
    monthly_gross_profit_usd: float
    runway_months: float | None
    cash_flow_positive: bool
    required_next_round_pre_money_usd: float
    next_round_post_money_usd: float
    post_round_ownership_pct: float
    exit_value_usd: float
    expected_return_usd: float
    expected_moic: float
    scenarios: list[OutcomeScenario]


class AssistantMessage(BaseModel):
    role: str
    content: str


class AssistantQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    context: str = Field(default="", max_length=20000)
    history: list[AssistantMessage] = Field(default_factory=list)


class AssistantResponse(BaseModel):
    answer: str
    grounded: bool


class ChatTitleRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ChatTitleResponse(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class OpportunityIntentRequest(BaseModel):
    request: str = Field(min_length=1, max_length=3000)


class OpportunityDraft(BaseModel):
    should_create: bool = False
    name: str | None = None
    website: str | None = None
    sector: str | None = None
    stage: str | None = None
    geography: str | None = None
    description: str | None = None
    confidence: float = Field(default=0.5, ge=0, le=1)
