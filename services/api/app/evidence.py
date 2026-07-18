from datetime import datetime, timezone

from .models import Evidence, Source, SourceType, now


FOUNDER_PROVIDED = {
    SourceType.pitch_deck,
    SourceType.financial_model,
    SourceType.founder_questionnaire,
    SourceType.document,
    SourceType.crm_note,
}

COMPANY_OWNED = {SourceType.website, SourceType.github}

THIRD_PARTY = {
    SourceType.hacker_news,
    SourceType.product_hunt,
    SourceType.arxiv,
    SourceType.perplexity,
    SourceType.exa,
    SourceType.tavily,
    SourceType.opencorporates,
    SourceType.sec_edgar,
    SourceType.patentsview,
    SourceType.press,
}

RELIABILITY = {
    SourceType.sec_edgar: 0.95,
    SourceType.opencorporates: 0.92,
    SourceType.arxiv: 0.86,
    SourceType.patentsview: 0.82,
    SourceType.github: 0.78,
    SourceType.product_hunt: 0.72,
    SourceType.website: 0.68,
    SourceType.hacker_news: 0.64,
    SourceType.exa: 0.62,
    SourceType.tavily: 0.62,
    SourceType.perplexity: 0.6,
    SourceType.financial_model: 0.58,
    SourceType.pitch_deck: 0.54,
    SourceType.founder_questionnaire: 0.52,
    SourceType.document: 0.5,
    SourceType.crm_note: 0.48,
}


def build_evidence(source: Source, segment_id: str, quote: str) -> Evidence:
    reliability = RELIABILITY.get(source.source_type, 0.45)
    independence = source_independence(source)
    freshness_days = _freshness_days(source)
    directness = _directness(quote)
    confidence = evidence_confidence(reliability, independence, freshness_days, directness)
    return Evidence(
        source_id=source.id,
        segment_id=segment_id,
        quote=quote,
        confidence=confidence,
        source_reliability=reliability,
        source_independence=independence,
        freshness_days=freshness_days,
        directness=directness,
        confidence_reason=_reason(reliability, independence, freshness_days, directness),
    )


def source_independence(source: Source) -> str:
    if source.source_type in THIRD_PARTY:
        return "third_party"
    if source.source_type in COMPANY_OWNED:
        return "company_owned"
    if source.source_type in FOUNDER_PROVIDED:
        return "founder_provided"
    return "unknown"


def evidence_confidence(
    reliability: float,
    independence: str,
    freshness_days: int | None,
    directness: str,
) -> float:
    independence_factor = {
        "third_party": 1.0,
        "company_owned": 0.82,
        "founder_provided": 0.68,
        "unknown": 0.55,
    }[independence]
    directness_factor = {"direct": 1.0, "inferred": 0.76, "indirect": 0.62}[directness]
    freshness_factor = _freshness_factor(freshness_days)
    return round(reliability * independence_factor * directness_factor * freshness_factor, 3)


def _freshness_days(source: Source) -> int | None:
    value = source.metadata.get("observed_at") or source.submitted_at.isoformat()
    try:
        observed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None
    return max(0, (now() - observed).days)


def _freshness_factor(days: int | None) -> float:
    if days is None:
        return 0.75
    if days <= 30:
        return 1.0
    if days <= 180:
        return 0.85
    if days <= 365:
        return 0.7
    return 0.55


def _directness(text: str) -> str:
    lowered = text.lower()
    direct_terms = ["arr", "mrr", "revenue", "customer", "pilot", "signed", "github", "patent", "filing"]
    if any(term in lowered for term in direct_terms):
        return "direct"
    if any(term in lowered for term in ["research", "mentions", "surface", "signal"]):
        return "inferred"
    return "indirect"


def _reason(reliability: float, independence: str, freshness_days: int | None, directness: str) -> str:
    freshness = "unknown freshness" if freshness_days is None else f"{freshness_days} days old"
    return (
        f"{directness} evidence from {independence} source; "
        f"source reliability {reliability:.2f}; {freshness}"
    )
