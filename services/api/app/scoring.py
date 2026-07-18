from statistics import mean

from .models import Claim, ClaimKind, ClaimStatus, Evidence, Founder, FounderScore, Source, SourceType, now


def update_founder_score(
    founder: Founder,
    claims: list[Claim],
    sources: list[Source],
    evidence: list[Evidence],
) -> FounderScore:
    linked_ids = {evidence_id for claim in claims for evidence_id in claim.evidence_ids}
    linked_evidence = [item for item in evidence if item.id in linked_ids]
    evidence_count = len(linked_evidence)
    signal_count = len(claims)
    contradiction_count = sum(1 for claim in claims if claim.status == ClaimStatus.disputed)
    evidence_quality = mean(item.confidence for item in linked_evidence) if linked_evidence else 0.0
    evidence_coverage = _evidence_coverage(linked_evidence)
    signal_strength = _signal_strength(sources)
    contradiction_penalty = max(0.55, 1 - contradiction_count * 0.16)
    founder_data_points = _founder_data_points(founder, claims, sources)
    cold_start = founder_data_points < 2
    confidence = round((evidence_quality * 0.7 + evidence_coverage * 0.3) * contradiction_penalty, 3)
    score = round((signal_strength * 0.45 + evidence_quality * 0.35 + evidence_coverage * 0.2) * 100, 1)
    notes = _score_notes(
        cold_start,
        evidence_quality,
        evidence_coverage,
        signal_strength,
        contradiction_count,
        founder_data_points,
    )

    return FounderScore(
        founder_id=founder.id,
        score=score if not cold_start else min(score, 50.0),
        confidence=min(0.95, confidence),
        cold_start=cold_start,
        evidence_count=evidence_count,
        evidence_coverage=round(evidence_coverage, 3),
        contradiction_count=contradiction_count,
        updated_at=now(),
        notes=notes,
    )


def _evidence_coverage(evidence: list[Evidence]) -> float:
    if not evidence:
        return 0.0
    categories = {item.source_independence for item in evidence}
    return min(1.0, len(categories) / 3)


def _signal_strength(sources: list[Source]) -> float:
    categories = [
        _github_quality(sources),
        _launch_quality(sources),
        _research_quality(sources),
        _diligence_quality(sources),
        _registry_quality(sources),
    ]
    active = [value for value in categories if value > 0]
    return round(mean(active), 3) if active else 0.0


def _founder_data_points(founder: Founder, claims: list[Claim], sources: list[Source]) -> int:
    founder_claims = [
        claim
        for claim in claims
        if claim.kind == ClaimKind.founder and (claim.founder_id in {None, founder.id})
    ]
    public_profile_sources = {
        source.id
        for source in sources
        if source.source_type in {SourceType.github, SourceType.founder_linkedin}
    }
    return (
        int(bool(founder.github)) * 2
        + int(bool(founder.linkedin)) * 2
        + min(2, len(founder_claims))
        + min(2, len(public_profile_sources))
    )


def _github_quality(sources: list[Source]) -> float:
    values = []
    for source in sources:
        if source.source_type == SourceType.github:
            repos = int(source.metadata.get("public_repos") or 0)
            followers = int(source.metadata.get("followers") or 0)
            values.append(min(1.0, repos / 25) * 0.65 + min(1.0, followers / 150) * 0.35)
    return max(values, default=0.0)


def _launch_quality(sources: list[Source]) -> float:
    values = []
    for source in sources:
        if source.source_type == SourceType.hacker_news:
            points = int(source.metadata.get("points") or 0)
            comments = int(source.metadata.get("comments") or 0)
            values.append(min(1.0, points / 150) * 0.7 + min(1.0, comments / 60) * 0.3)
        if source.source_type == SourceType.product_hunt:
            votes = int(source.metadata.get("votes") or 0)
            comments = int(source.metadata.get("comments") or 0)
            values.append(0.35 + min(0.45, votes / 400) + min(0.2, comments / 120))
    return max(values, default=0.0)


def _research_quality(sources: list[Source]) -> float:
    count = sum(1 for source in sources if source.source_type in {SourceType.arxiv, SourceType.patentsview})
    return min(1.0, count / 2)


def _diligence_quality(sources: list[Source]) -> float:
    source_types = {SourceType.website, SourceType.perplexity, SourceType.exa, SourceType.tavily}
    count = sum(1 for source in sources if source.source_type in source_types)
    return min(1.0, count / 3)


def _registry_quality(sources: list[Source]) -> float:
    source_types = {SourceType.opencorporates, SourceType.sec_edgar}
    count = sum(1 for source in sources if source.source_type in source_types)
    return min(1.0, count / 2)


def _score_notes(
    cold_start: bool,
    evidence_quality: float,
    evidence_coverage: float,
    signal_strength: float,
    contradiction_count: int,
    founder_data_points: int,
) -> list[str]:
    notes = ["cold_start: limited founder evidence"] if cold_start else ["enough evidence for initial ranking"]
    notes.append(f"average evidence confidence {evidence_quality:.2f}")
    notes.append(f"source coverage {evidence_coverage:.2f}")
    notes.append(f"public signal strength {signal_strength:.2f}")
    notes.append(f"founder data points {founder_data_points}")
    if contradiction_count:
        notes.append(f"{contradiction_count} disputed claim(s) reduce confidence")
    return notes
