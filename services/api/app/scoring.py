from datetime import datetime, timezone
from typing import Any

from .models import Claim, ClaimKind, Founder, FounderScore, Source, SourceType, now


def update_founder_score(founder: Founder, claims: list[Claim], sources: list[Source]) -> FounderScore:
    evidence_count = sum(1 for claim in claims if claim.kind == ClaimKind.founder)
    signal_count = len(claims)
    github = _github_strength(sources)
    launch = _launch_strength(sources)
    research = _research_strength(sources)
    diligence = _diligence_strength(sources)
    registry = _registry_strength(sources)
    freshness = _freshness_strength(sources)
    cold_start = evidence_count == 0 or signal_count < 3
    raw_score = 25.0 + evidence_count * 8.0 + github + launch + research + diligence + registry + freshness
    score = min(100.0, raw_score)
    confidence = min(0.95, 0.2 + evidence_count * 0.12 + min(signal_count, 8) * 0.06)
    notes = _score_notes(cold_start, github, launch, research, diligence, registry, freshness)

    return FounderScore(
        founder_id=founder.id,
        score=score if not cold_start else min(score, 50.0),
        confidence=confidence,
        cold_start=cold_start,
        evidence_count=evidence_count,
        updated_at=now(),
        notes=notes,
    )


def _github_strength(sources: list[Source]) -> float:
    score = 0.0
    for source in sources:
        if source.source_type != SourceType.github:
            continue
        repos = int(source.metadata.get("public_repos") or 0)
        followers = int(source.metadata.get("followers") or 0)
        score += min(18.0, repos * 0.7 + followers * 0.08)
    return min(score, 22.0)


def _launch_strength(sources: list[Source]) -> float:
    score = 0.0
    for source in sources:
        if source.source_type == SourceType.hacker_news:
            score += min(18.0, int(source.metadata.get("points") or 0) * 0.12)
            score += min(8.0, int(source.metadata.get("comments") or 0) * 0.08)
        if source.source_type == SourceType.product_hunt:
            score += 6.0
    return min(score, 24.0)


def _research_strength(sources: list[Source]) -> float:
    count = sum(
        1
        for source in sources
        if source.source_type in {SourceType.arxiv, SourceType.patentsview}
    )
    return min(14.0, count * 5.0)


def _diligence_strength(sources: list[Source]) -> float:
    source_types = {
        SourceType.website,
        SourceType.perplexity,
        SourceType.exa,
        SourceType.tavily,
    }
    count = sum(1 for source in sources if source.source_type in source_types)
    return min(16.0, count * 4.0)


def _registry_strength(sources: list[Source]) -> float:
    source_types = {SourceType.opencorporates, SourceType.sec_edgar}
    count = sum(1 for source in sources if source.source_type in source_types)
    return min(12.0, count * 6.0)


def _freshness_strength(sources: list[Source]) -> float:
    fresh = 0
    for source in sources:
        observed = _parse_dt(source.metadata.get("observed_at"))
        if observed and (now() - observed).days <= 30:
            fresh += 1
    return min(10.0, fresh * 2.5)


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _score_notes(
    cold_start: bool,
    github: float,
    launch: float,
    research: float,
    diligence: float,
    registry: float,
    freshness: float,
) -> list[str]:
    notes = ["cold_start: limited founder evidence"] if cold_start else ["enough evidence for initial ranking"]
    if github:
        notes.append("github activity contributed")
    if launch:
        notes.append("launch/community traction contributed")
    if research:
        notes.append("research relevance contributed")
    if diligence:
        notes.append("web diligence coverage contributed")
    if registry:
        notes.append("registry or filing verification contributed")
    if freshness:
        notes.append("fresh signals contributed")
    return notes
