from .llm import parse_founder_query
from .models import Claim, Company, Founder, FounderScore, ParsedFounderQuery, SearchMatch, Source


MATCH_WEIGHT = 70.0
EVIDENCE_WEIGHT = 20.0
MEMORY_WEIGHT = 10.0


def search_founders(
    query: str,
    companies: list[Company],
    founders: list[Founder],
    scores: dict[str, FounderScore],
    claims: list[Claim],
    sources: list[Source],
    limit: int,
) -> list[SearchMatch]:
    parsed = parse_founder_query(query)
    matches: list[SearchMatch] = []

    for founder in founders:
        company = next((item for item in companies if item.id == founder.company_id), None)
        if not company:
            continue
        company_claims = [claim for claim in claims if claim.company_id == company.id]
        company_sources = [source for source in sources if source.company_id == company.id]
        corpus = _corpus(company, founder, company_claims, company_sources)
        match_score, reasons = _score(parsed, company, founder, corpus, scores.get(founder.id), company_sources)
        if match_score:
            matches.append(
                SearchMatch(
                    company=company,
                    founder=founder,
                    founder_score=scores.get(founder.id),
                    match_score=min(100.0, match_score),
                    reasons=reasons,
                )
            )

    return sorted(matches, key=lambda item: item.match_score, reverse=True)[:limit]


def _score(
    parsed: ParsedFounderQuery,
    company: Company,
    founder: Founder,
    corpus: str,
    score: FounderScore | None,
    sources: list[Source],
) -> tuple[float, list[str]]:
    possible = 0
    matched = 0
    reasons: list[str] = []

    possible += len(parsed.geographies)
    if company.geography and _matches_any(company.geography, parsed.geographies):
        matched += 1
        reasons.append(f"geography match: {company.geography}")

    possible += len(parsed.stages)
    if company.stage and _matches_any(company.stage, parsed.stages):
        matched += 1
        reasons.append(f"stage match: {company.stage}")

    possible += len(parsed.sectors)
    if company.sector and _matches_any(company.sector, parsed.sectors):
        matched += 1
        reasons.append(f"sector context: {company.sector}")

    possible += len(parsed.founder_traits)
    if "technical" in parsed.founder_traits and (founder.github or "github" in corpus):
        matched += 1
        reasons.append("technical founder signal")

    keyword_matches = sum(1 for keyword in parsed.keywords if keyword in corpus)
    possible += min(5, len(parsed.keywords))
    matched += min(5, keyword_matches)
    if keyword_matches:
        reasons.append(f"{keyword_matches} keyword matches")

    if parsed.exclude_prior_vc:
        possible += 1
        if not _mentions_prior_backing(corpus):
            matched += 1
            reasons.append("no prior VC backing found in memory")

    if possible == 0:
        return 0.0, []

    field_score = (matched / possible) * MATCH_WEIGHT
    evidence_score = _evidence_score(sources)
    memory_score = min(MEMORY_WEIGHT, score.confidence * MEMORY_WEIGHT) if score else 0.0
    if score:
        reasons.append(f"Founder memory confidence {score.confidence:.2f}")

    value = field_score + evidence_score + memory_score
    return value, reasons


def _corpus(company: Company, founder: Founder, claims: list[Claim], sources: list[Source]) -> str:
    values = [
        company.name,
        company.sector,
        company.stage,
        company.geography,
        company.description,
        founder.name,
        founder.role,
        founder.github,
    ]
    values.extend(claim.text for claim in claims)
    values.extend(source.title for source in sources)
    values.extend(source.text or "" for source in sources)
    return " ".join(value or "" for value in values).lower()


def _matches_any(value: str, filters: list[str]) -> bool:
    normalized = value.lower()
    return any(item.lower() in normalized or normalized in item.lower() for item in filters)


def _mentions_prior_backing(corpus: str) -> bool:
    return any(term in corpus for term in ["vc backed", "venture backed", "investor:", "lead investor"])


def _evidence_score(sources: list[Source]) -> float:
    if not sources:
        return 0.0
    independent_sources = {source.source_type for source in sources}
    live_sources = sum(1 for source in sources if source.metadata.get("fetch_status") == "live")
    coverage = min(1.0, len(independent_sources) / 4)
    freshness = min(1.0, live_sources / max(1, len(sources)))
    return (coverage * 0.7 + freshness * 0.3) * EVIDENCE_WEIGHT
