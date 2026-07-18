from .models import Company, CompanyUpdate, Source, SourceType


PROFILE_FIELDS = ("sector", "stage", "geography", "description")

SOURCE_PROFILE_PRIORITY = {
    SourceType.sec_edgar: 0.95,
    SourceType.opencorporates: 0.92,
    SourceType.founder_questionnaire: 0.9,
    SourceType.financial_model: 0.9,
    SourceType.pitch_deck: 0.88,
    SourceType.website: 0.82,
    SourceType.document: 0.75,
    SourceType.press: 0.72,
    SourceType.exa: 0.7,
    SourceType.tavily: 0.7,
    SourceType.perplexity: 0.68,
    SourceType.github: 0.65,
    SourceType.arxiv: 0.62,
    SourceType.product_hunt: 0.6,
    SourceType.hacker_news: 0.55,
    SourceType.crm_note: 0.5,
}


def initialize_company_provenance(company: Company, label: str = "application") -> None:
    for field in PROFILE_FIELDS:
        if getattr(company, field) and field not in company.field_provenance:
            company.field_provenance[field] = label
            company.field_confidence[field] = 1.0


def apply_company_update(company: Company, update: CompanyUpdate, source: Source) -> None:
    priority = SOURCE_PROFILE_PRIORITY.get(source.source_type, 0.45)
    for field, value in update.model_dump(exclude_none=True).items():
        if field not in PROFILE_FIELDS or not value:
            continue
        current = getattr(company, field)
        current_priority = company.field_confidence.get(field, 0)
        if current and priority < current_priority:
            continue
        setattr(company, field, value)
        company.field_provenance[field] = source.id
        company.field_confidence[field] = priority


def find_duplicate_source(sources: list[Source], candidate: Source) -> Source | None:
    candidate_url = str(candidate.url).rstrip("/") if candidate.url else None
    for source in sources:
        if source.company_id != candidate.company_id or source.id == candidate.id:
            continue
        source_url = str(source.url).rstrip("/") if source.url else None
        if candidate_url and source_url == candidate_url:
            return source
        if candidate.content_fingerprint and source.content_fingerprint == candidate.content_fingerprint:
            return source
    return None
