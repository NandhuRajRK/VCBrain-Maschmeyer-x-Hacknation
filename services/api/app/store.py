from fastapi import HTTPException

from .models import Company, Segment, Source


class Store:
    def __init__(self) -> None:
        self.companies: dict[str, Company] = {}
        self.sources: dict[str, Source] = {}
        self.segments: dict[str, Segment] = {}

    def company(self, company_id: str) -> Company:
        if company_id not in self.companies:
            raise HTTPException(status_code=404, detail="Company not found")
        return self.companies[company_id]

    def company_sources(self, company_id: str) -> list[Source]:
        self.company(company_id)
        return [source for source in self.sources.values() if source.company_id == company_id]

    def company_segments(self, company_id: str) -> list[Segment]:
        source_ids = {source.id for source in self.company_sources(company_id)}
        return [segment for segment in self.segments.values() if segment.source_id in source_ids]


store = Store()

