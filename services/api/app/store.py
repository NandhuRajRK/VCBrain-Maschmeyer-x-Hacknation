from fastapi import HTTPException

from .models import (
    Claim,
    AnalysisJob,
    ClaimStatusChange,
    CollaborationNote,
    Company,
    DealActivity,
    DealInvitation,
    DealMember,
    DealTask,
    DiscoveryCandidate,
    DiscoveryRun,
    Evidence,
    Founder,
    FounderScore,
    FounderScoreSnapshot,
    FundThesis,
    InternalMemory,
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
        self.deal_members: dict[str, DealMember] = self._load("deal_members")
        self.collaboration_notes: dict[str, CollaborationNote] = self._load("collaboration_notes")
        self.deal_tasks: dict[str, DealTask] = self._load("deal_tasks")
        self.deal_activity: dict[str, DealActivity] = self._load("deal_activity")
        self.deal_invitations: dict[str, DealInvitation] = self._load("deal_invitations")
        self.trigger_events: dict[str, TriggerEvent] = self._load("trigger_events")
        self.fund_theses: dict[str, FundThesis] = self._load("fund_theses")
        self.analysis_jobs: dict[str, AnalysisJob] = self._load("analysis_jobs")
        self.internal_memories: dict[str, InternalMemory] = self._load("internal_memories")
        self.discovery_candidates: dict[str, DiscoveryCandidate] = self._load("discovery_candidates")
        self.discovery_runs: dict[str, DiscoveryRun] = self._load("discovery_runs")

    def _load(self, collection: str):
        return self.db.load_collection(collection, MODEL_COLLECTIONS[collection])

    def save(self) -> None:
        # Collaboration collections are committed only by collaboration_transaction.
        # Keeping them out of this snapshot prevents an ingestion request from
        # overwriting a teammate's newer comment or task.
        collections = (
            ("companies", self.companies),
            ("founders", self.founders),
            ("sources", self.sources),
            ("segments", self.segments),
            ("claims", self.claims),
            ("evidence", self.evidence),
            ("founder_scores", self.founder_scores),
            ("founder_score_history", self.founder_score_history),
            ("claim_status_changes", self.claim_status_changes),
            ("trigger_events", self.trigger_events),
            ("fund_theses", self.fund_theses),
            ("analysis_jobs", self.analysis_jobs),
            ("internal_memories", self.internal_memories),
            ("discovery_candidates", self.discovery_candidates),
            ("discovery_runs", self.discovery_runs),
        )
        with self.db.immediate_transaction() as connection:
            for collection, rows in collections:
                self.db.replace_collection(collection, rows, connection)

    def company_members(self, company_id: str) -> list[DealMember]:
        self.company(company_id)
        return [item for item in self.deal_members.values() if item.company_id == company_id]

    def company_notes(self, company_id: str) -> list[CollaborationNote]:
        self.company(company_id)
        return [item for item in self.collaboration_notes.values() if item.company_id == company_id]

    def company_tasks(self, company_id: str) -> list[DealTask]:
        self.company(company_id)
        return [item for item in self.deal_tasks.values() if item.company_id == company_id]

    def company_activity(self, company_id: str) -> list[DealActivity]:
        self.company(company_id)
        return [item for item in self.deal_activity.values() if item.company_id == company_id]

    def company_invitations(self, company_id: str) -> list[DealInvitation]:
        self.company(company_id)
        return [item for item in self.deal_invitations.values() if item.company_id == company_id]

    def company_internal_memories(self, company_id: str) -> list[InternalMemory]:
        self.company(company_id)
        return [item for item in self.internal_memories.values() if item.company_id == company_id]

    def reload_collaboration(self) -> None:
        self.deal_members = self._load("deal_members")
        self.collaboration_notes = self._load("collaboration_notes")
        self.deal_tasks = self._load("deal_tasks")
        self.deal_activity = self._load("deal_activity")
        self.deal_invitations = self._load("deal_invitations")

    def save_collaboration(self, connection) -> None:
        for collection, rows in (
            ("deal_members", self.deal_members),
            ("collaboration_notes", self.collaboration_notes),
            ("deal_tasks", self.deal_tasks),
            ("deal_activity", self.deal_activity),
            ("deal_invitations", self.deal_invitations),
        ):
            self.db.upsert_collection(collection, rows, connection)

    def company(self, company_id: str) -> Company:
        if company_id not in self.companies:
            raise HTTPException(status_code=404, detail="Company not found")
        return self.companies[company_id]

    def founder(self, founder_id: str) -> Founder:
        founder = next((item for item in self.founders.values() if item.id == founder_id), None)
        if founder is None:
            raise HTTPException(status_code=404, detail="Founder not found")
        return founder

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
