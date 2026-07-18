from fastapi import HTTPException

from .models import (
    Claim,
    ClaimStatusChange,
    Company,
    Evidence,
    Founder,
    FounderScore,
    FounderScoreSnapshot,
    Segment,
    Source,
    TriggerEvent,
)
from .persistence import JsonSqliteStore, MODEL_COLLECTIONS


class Store:
    def __init__(self) -> None:
        self.db = JsonSqliteStore()
        self.companies: dict[str, Company] = self._load("companies")
        self.founders: dict[str, Founder] = self._load("founders")
        self.sources: dict[str, Source] = self._load("sources")
        self.segments: dict[str, Segment] = self._load("segments")
        self.claims: dict[str, Claim] = self._load("claims")
        self.evidence: dict[str, Evidence] = self._load("evidence")
        self.founder_scores: dict[str, FounderScore] = self._load("founder_scores")
        self.founder_score_history: dict[str, FounderScoreSnapshot] = self._load("founder_score_history")
        self.claim_status_changes: dict[str, ClaimStatusChange] = self._load("claim_status_changes")
        self.trigger_events: dict[str, TriggerEvent] = self._load("trigger_events")

    def _load(self, collection: str):
        return self.db.load_collection(collection, MODEL_COLLECTIONS[collection])

    def save(self) -> None:
        self.db.save_collection("companies", self.companies)
        self.db.save_collection("founders", self.founders)
        self.db.save_collection("sources", self.sources)
        self.db.save_collection("segments", self.segments)
        self.db.save_collection("claims", self.claims)
        self.db.save_collection("evidence", self.evidence)
        self.db.save_collection("founder_scores", self.founder_scores)
        self.db.save_collection("founder_score_history", self.founder_score_history)
        self.db.save_collection("claim_status_changes", self.claim_status_changes)
        self.db.save_collection("trigger_events", self.trigger_events)

    def company(self, company_id: str) -> Company:
        if company_id not in self.companies:
            raise HTTPException(status_code=404, detail="Company not found")
        return self.companies[company_id]

    def company_sources(self, company_id: str) -> list[Source]:
        self.company(company_id)
        return [source for source in self.sources.values() if source.company_id == company_id]

    def company_founders(self, company_id: str) -> list[Founder]:
        self.company(company_id)
        return [founder for founder in self.founders.values() if founder.company_id == company_id]

    def company_segments(self, company_id: str) -> list[Segment]:
        source_ids = {source.id for source in self.company_sources(company_id)}
        return [segment for segment in self.segments.values() if segment.source_id in source_ids]

    def company_claims(self, company_id: str) -> list[Claim]:
        self.company(company_id)
        return [claim for claim in self.claims.values() if claim.company_id == company_id]

    def company_evidence(self, company_id: str) -> list[Evidence]:
        evidence_ids = {
            evidence_id
            for claim in self.company_claims(company_id)
            for evidence_id in claim.evidence_ids
        }
        return [item for item in self.evidence.values() if item.id in evidence_ids]

    def company_founder_scores(self, company_id: str) -> list[FounderScore]:
        founder_ids = {founder.id for founder in self.company_founders(company_id)}
        return [score for score in self.founder_scores.values() if score.founder_id in founder_ids]

    def company_trigger_events(self, company_id: str) -> list[TriggerEvent]:
        self.company(company_id)
        return [event for event in self.trigger_events.values() if event.company_id == company_id]

    def company_score_history(self, company_id: str) -> list[FounderScoreSnapshot]:
        self.company(company_id)
        return [item for item in self.founder_score_history.values() if item.company_id == company_id]

    def company_claim_changes(self, company_id: str) -> list[ClaimStatusChange]:
        self.company(company_id)
        return [item for item in self.claim_status_changes.values() if item.company_id == company_id]


store = Store()
