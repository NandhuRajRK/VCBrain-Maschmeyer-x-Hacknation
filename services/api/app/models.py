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


class Company(CompanyCreate):
    id: str = Field(default_factory=lambda: new_id("company"))
    created_at: datetime = Field(default_factory=now)


class SourceCreate(BaseModel):
    company_id: str
    source_type: SourceType
    title: str = Field(min_length=1)
    url: HttpUrl | None = None
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


class Dossier(BaseModel):
    company: Company
    sources: list[Source]
    segments: list[Segment]


class IngestionRun(BaseModel):
    company_id: str
    accepted_sources: int
    status: IngestionStatus

