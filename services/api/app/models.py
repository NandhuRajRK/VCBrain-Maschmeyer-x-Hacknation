from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl


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
    created_at: datetime = Field(default_factory=now)


class CompanyUpdate(BaseModel):
    sector: str | None = None
    stage: str | None = None
    geography: str | None = None
    description: str | None = None


class Founder(BaseModel):
    id: str = Field(default_factory=lambda: new_id("founder"))
    company_id: str
    name: str
    role: str | None = None
    linkedin: HttpUrl | None = None
    github: str | None = None
    cold_start: bool = True
    updated_at: datetime = Field(default_factory=now)


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


class SourcePullResult(BaseModel):
    company_id: str
    created_sources: list[Source]
    deduped_sources: int


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
    kind: ClaimKind
    text: str
    status: ClaimStatus = ClaimStatus.supported
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


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


class TriggerKind(str, Enum):
    new_application = "new_application"
    signal_threshold_crossed = "signal_threshold_crossed"


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


class IngestionRun(BaseModel):
    company_id: str
    accepted_sources: int
    parsed_segments: int
    extracted_claims: int
    status: IngestionStatus
