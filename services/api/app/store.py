from fastapi import HTTPException

from .models import Claim, Company, Evidence, Founder, Segment, Source


class Store:
    def __init__(self) -> None:
        self.companies: dict[str, Company] = {}
        self.founders: dict[str, Founder] = {}
        self.sources: dict[str, Source] = {}
        self.segments: dict[str, Segment] = {}
        self.claims: dict[str, Claim] = {}
        self.evidence: dict[str, Evidence] = {}

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


store = Store()
