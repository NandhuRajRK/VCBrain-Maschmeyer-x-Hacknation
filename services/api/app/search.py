from .models import Claim, Company, Founder, FounderScore, SearchMatch, Source


KNOWN_GEOGRAPHIES = {
    "berlin",
    "munich",
    "london",
    "milan",
    "paris",
    "hamburg",
    "zurich",
    "stockholm",
    "dublin",
}

KNOWN_STAGES = {"idea", "pre-seed", "preseed", "seed", "series a"}


def search_founders(
    query: str,
    companies: list[Company],
    founders: list[Founder],
    scores: dict[str, FounderScore],
    claims: list[Claim],
    sources: list[Source],
    limit: int,
) -> list[SearchMatch]:
    tokens = _tokens(query)
    matches: list[SearchMatch] = []

    for founder in founders:
        company = next((item for item in companies if item.id == founder.company_id), None)
        if not company:
            continue
        company_claims = [claim for claim in claims if claim.company_id == company.id]
        company_sources = [source for source in sources if source.company_id == company.id]
        corpus = _corpus(company, founder, company_claims, company_sources)
        match_score, reasons = _score(tokens, query, company, founder, corpus, scores.get(founder.id))
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
    tokens: set[str],
    query: str,
    company: Company,
    founder: Founder,
    corpus: str,
    score: FounderScore | None,
) -> tuple[float, list[str]]:
    value = 0.0
    reasons: list[str] = []

    for token in tokens:
        if token in corpus:
            value += 8.0
    if company.geography and company.geography.lower() in tokens:
        value += 18.0
        reasons.append(f"geography match: {company.geography}")
    if company.stage and company.stage.lower() in tokens:
        value += 14.0
        reasons.append(f"stage match: {company.stage}")
    if company.sector and any(part in corpus for part in tokens):
        value += 10.0
        reasons.append(f"sector context: {company.sector}")
    if "technical" in tokens and (founder.github or "github" in corpus):
        value += 18.0
        reasons.append("technical founder signal")
    if "no prior vc backing" in query.lower() or "no vc" in query.lower():
        value += 8.0
        reasons.append("no prior backing filter treated as preference")
    if score:
        value += min(20.0, score.score * 0.2)
        reasons.append(f"Founder Score {score.score:.0f}")

    return value, reasons or ["keyword match"]


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


def _tokens(query: str) -> set[str]:
    words = {word.strip(".,:;()[]").lower() for word in query.split()}
    tokens = {word for word in words if len(word) > 2}
    tokens.update(item for item in KNOWN_GEOGRAPHIES if item in query.lower())
    tokens.update(item for item in KNOWN_STAGES if item in query.lower())
    return tokens

