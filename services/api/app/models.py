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
    website = "website"
    founder_linkedin = "founder_linkedin"
    github = "github"
    press = "press"
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


class Claim(BaseModel):
    id: str = Field(default_factory=lambda: new_id("claim"))
    company_id: str
    kind: ClaimKind
    text: str
    status: ClaimStatus = ClaimStatus.supported
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class Dossier(BaseModel):
    company: Company
    founders: list[Founder]
    sources: list[Source]
    segments: list[Segment]
    claims: list[Claim]
    evidence: list[Evidence]


class IngestionRun(BaseModel):
    company_id: str
    accepted_sources: int
    parsed_segments: int
    extracted_claims: int
    status: IngestionStatus
