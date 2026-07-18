import re

from .evidence import build_evidence
from .llm import extract_claims_from_text, extract_company_profile
from .models import (
    Claim,
    ClaimKind,
    ClaimStatus,
    CompanyUpdate,
    Evidence,
    ExtractedClaim,
    Founder,
    Segment,
    Source,
    SourceType,
)


def parse_source(source: Source) -> list[Segment]:
    text = source.text or source.metadata.get("summary") or source.title
    heading = source.source_type.value.replace("_", " ").title()
    return [Segment(source_id=source.id, heading=heading, text=text)]


def extract_company_update(segments: list[Segment], source: Source | None = None) -> CompanyUpdate:
    text = "\n".join(segment.text for segment in segments)
    metadata = source.metadata if source else {}
    labeled_update = CompanyUpdate(
        sector=metadata.get("sector") or _find_label(text, "sector"),
        stage=metadata.get("stage") or _find_label(text, "stage"),
        geography=metadata.get("geography") or _find_label(text, "geography"),
        description=metadata.get("description"),
    )
    needs_profile_extraction = any(
        getattr(labeled_update, field) is None for field in ("sector", "stage", "geography")
    )
    llm_update = extract_company_profile(text) if text.strip() and needs_profile_extraction else None
    return CompanyUpdate(
        sector=labeled_update.sector or (llm_update.sector if llm_update else None),
        stage=labeled_update.stage or (llm_update.stage if llm_update else None),
        geography=labeled_update.geography or (llm_update.geography if llm_update else None),
        description=metadata.get("description")
        or (llm_update.description if llm_update else None)
        or (segments[0].text[:240] if segments else None),
    )


def extract_founders(company_id: str, source: Source) -> list[Founder]:
    founders: list[Founder] = []
    for item in source.metadata.get("founders", []):
        founder = _founder_from_metadata(company_id, item)
        if founder:
            founders.append(founder)

    handle = source.metadata.get("handle")
    if not founders and handle and source.source_type == SourceType.github:
        founders.append(Founder(company_id=company_id, name=str(handle), role="Founder", github=str(handle)))

    if not founders:
        founders.extend(_founders_from_text(company_id, source.text or ""))
    return _unique_founders(founders)


def extract_claims(
    company_id: str,
    source: Source,
    segments: list[Segment],
    founders: list[Founder] | None = None,
) -> tuple[list[Claim], list[Evidence]]:
    claims: list[Claim] = []
    evidence: list[Evidence] = []
    default_kind = _claim_kind(source.source_type)

    for segment in segments:
        extracted = extract_claims_from_text(segment.text, default_kind)
        for claim in extracted:
            item = build_evidence(source, segment.id, _quote_for_claim(segment.text, claim))
            evidence.append(item)
            claims.append(
                Claim(
                    company_id=company_id,
                    founder_id=_match_founder_id(claim, founders or []),
                    kind=claim.kind,
                    text=claim.text,
                    status=ClaimStatus.extracted,
                    evidence_ids=[item.id],
                    confidence=_claim_confidence(claim, item),
                )
            )

    return claims, evidence


def resolve_claim_statuses(claims: list[Claim], evidence: list[Evidence]) -> None:
    evidence_by_id = {item.id: item for item in evidence}
    for claim in claims:
        linked = [evidence_by_id[item] for item in claim.evidence_ids if item in evidence_by_id]
        if not linked or len(linked) != len(claim.evidence_ids):
            claim.status = ClaimStatus.missing_evidence
            claim.confidence = round(min(claim.confidence, 0.25), 3)
        else:
            claim.status = ClaimStatus.supported

    for index, left in enumerate(claims):
        for right in claims[index + 1 :]:
            if left.status == ClaimStatus.missing_evidence or right.status == ClaimStatus.missing_evidence:
                continue
            if _contradicts(left, right):
                left.status = ClaimStatus.disputed
                right.status = ClaimStatus.disputed


def _claim_confidence(claim: ExtractedClaim, evidence: Evidence) -> float:
    text = claim.text.strip()
    text_quality = min(1.0, 0.35 + min(0.25, len(text) / 240) + (0.2 if any(char.isdigit() for char in text) else 0))
    quote_coverage = min(1.0, len(text) / max(len(evidence.quote), 1))
    value = claim.confidence * 0.55 + evidence.confidence * 0.3 + text_quality * 0.1 + quote_coverage * 0.05
    return round(min(1.0, value), 3)


def _contradicts(left: Claim, right: Claim) -> bool:
    related_kinds = {left.kind, right.kind}
    if left.kind != right.kind and related_kinds != {ClaimKind.financial, ClaimKind.traction}:
        return False
    overlap = _topic_tokens(left.text) & _topic_tokens(right.text)
    if not overlap:
        return False
    left_numbers = set(re.findall(r"\b\d+(?:\.\d+)?\b", left.text))
    right_numbers = set(re.findall(r"\b\d+(?:\.\d+)?\b", right.text))
    numeric_conflict = bool(left_numbers and right_numbers and left_numbers != right_numbers)
    negation = any(term in f" {left.text.lower()} {right.text.lower()} " for term in [" not ", " only ", " no ", " without "])
    return (numeric_conflict and len(overlap) >= 1) or (negation and len(overlap) >= 2)


def _topic_tokens(text: str) -> set[str]:
    stopwords = {"the", "and", "for", "with", "from", "has", "have", "says", "this", "that", "are", "was", "not"}
    tokens = set()
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9-]+", text.lower()):
        if len(token) < 4 or token in stopwords:
            continue
        tokens.add(token[:-1] if token.endswith("s") else token)
    return tokens


def _quote_for_claim(text: str, claim: ExtractedClaim) -> str:
    if claim.text in text:
        return claim.text[:320]
    return text[:320]


def _match_founder_id(claim: ExtractedClaim, founders: list[Founder]) -> str | None:
    lowered = claim.text.lower()
    for founder in founders:
        if founder.name.lower() in lowered:
            return founder.id
    if claim.kind == ClaimKind.founder and len(founders) == 1:
        return founders[0].id
    return None


def _founder_from_metadata(company_id: str, item: object) -> Founder | None:
    if isinstance(item, str):
        return Founder(company_id=company_id, name=item, role="Founder")
    if not isinstance(item, dict) or not item.get("name"):
        return None
    return Founder(
        company_id=company_id,
        name=str(item["name"]),
        role=item.get("role") or "Founder",
        linkedin=item.get("linkedin"),
        github=item.get("github"),
    )


def _founders_from_text(company_id: str, text: str) -> list[Founder]:
    patterns = [
        re.compile(r"\b(?P<role>(?i:founder|co-founder|ceo|cto|cfo|cpo))\s*[:\-]\s*(?P<name>[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3})"),
        re.compile(r"\b(?P<name>[A-Z][A-Za-z'-]+(?:\s+[A-Za-z'-]+){1,3})\s*[,\-]\s*(?P<role>CEO|CTO|CFO|CPO|Founder|Co-founder)\b"),
    ]
    return [
        Founder(company_id=company_id, name=match.group("name").strip(), role=match.group("role").title())
        for pattern in patterns
        for match in pattern.finditer(text)
    ]


def _unique_founders(founders: list[Founder]) -> list[Founder]:
    unique: dict[str, Founder] = {}
    for founder in founders:
        unique.setdefault(founder.name.lower(), founder)
    return list(unique.values())


def _claim_kind(source_type: SourceType) -> ClaimKind:
    if source_type == SourceType.financial_model:
        return ClaimKind.financial
    if source_type in {SourceType.founder_linkedin, SourceType.github}:
        return ClaimKind.founder
    return ClaimKind.company


def _find_label(text: str, label: str) -> str | None:
    match = re.search(rf"\b{re.escape(label)}\s*:\s*([^\.\n]+)", text, flags=re.IGNORECASE)
    return match.group(1).strip()[:80] if match else None
