from .models import (
    Claim,
    ClaimKind,
    ClaimStatus,
    CompanyUpdate,
    Evidence,
    ExtractedClaim,
    Founder,
    IngestionStatus,
    Segment,
    Source,
    SourceType,
)
from .evidence import build_evidence
from .llm import extract_claims_from_text


def parse_source(source: Source) -> list[Segment]:
    text = source.text or source.metadata.get("summary") or source.title
    heading = source.source_type.value.replace("_", " ").title()
    return [Segment(source_id=source.id, heading=heading, text=text)]


def extract_company_update(segments: list[Segment]) -> CompanyUpdate:
    text = " ".join(segment.text for segment in segments).lower()
    return CompanyUpdate(
        sector=_find_after(text, "sector:"),
        stage=_find_after(text, "stage:"),
        geography=_find_after(text, "geography:"),
        description=segments[0].text[:240] if segments else None,
    )


def extract_founders(company_id: str, source: Source) -> list[Founder]:
    raw_founders = source.metadata.get("founders", [])
    founders: list[Founder] = []
    for item in raw_founders:
        if isinstance(item, str):
            founders.append(Founder(company_id=company_id, name=item))
        elif isinstance(item, dict) and item.get("name"):
            founders.append(Founder(company_id=company_id, **item))
    return founders


def extract_claims(company_id: str, source: Source, segments: list[Segment]) -> tuple[list[Claim], list[Evidence]]:
    claims: list[Claim] = []
    evidence: list[Evidence] = []
    default_kind = _claim_kind(source.source_type)

    for segment in segments:
        extracted = extract_claims_from_text(segment.text, default_kind)
        for claim in extracted:
            item = build_evidence(source, segment.id, _quote_for_claim(segment.text, claim))
            evidence.append(item)
            status = _claim_status(claim.text)
            confidence = round(min(item.confidence, claim.confidence), 3)
            claims.append(
                Claim(
                    company_id=company_id,
                    kind=claim.kind,
                    text=claim.text,
                    evidence_ids=[item.id],
                    status=status,
                    confidence=round(confidence * 0.55, 3) if status == ClaimStatus.disputed else confidence,
                )
            )

    return claims, evidence


def _quote_for_claim(text: str, claim: ExtractedClaim) -> str:
    if claim.text in text:
        return claim.text[:320]
    return text[:320]


def _claim_status(text: str) -> ClaimStatus:
    lowered = text.lower()
    if "contradiction" in lowered or " not " in lowered or "only " in lowered:
        return ClaimStatus.disputed
    return ClaimStatus.supported


def _claim_kind(source_type: SourceType) -> ClaimKind:
    if source_type in {SourceType.financial_model}:
        return ClaimKind.financial
    if source_type in {SourceType.founder_linkedin, SourceType.github}:
        return ClaimKind.founder
    if source_type in {SourceType.website, SourceType.pitch_deck}:
        return ClaimKind.product
    return ClaimKind.company


def _find_after(text: str, marker: str) -> str | None:
    if marker not in text:
        return None
    value = text.split(marker, 1)[1].split(".", 1)[0].split("\n", 1)[0].strip()
    return value[:80] or None
