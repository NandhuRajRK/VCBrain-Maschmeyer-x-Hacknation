from .models import Claim, ClaimKind, Founder, FounderScore, now


def update_founder_score(founder: Founder, claims: list[Claim]) -> FounderScore:
    evidence_count = sum(1 for claim in claims if claim.kind == ClaimKind.founder)
    signal_count = len(claims)
    cold_start = evidence_count < 2 and signal_count < 4
    score = min(100.0, 35.0 + evidence_count * 12.0 + signal_count * 3.0)
    confidence = min(0.95, 0.2 + evidence_count * 0.18 + signal_count * 0.05)
    notes = ["cold_start: limited founder evidence"] if cold_start else ["enough evidence for initial ranking"]

    return FounderScore(
        founder_id=founder.id,
        score=score if not cold_start else min(score, 50.0),
        confidence=confidence,
        cold_start=cold_start,
        evidence_count=evidence_count,
        updated_at=now(),
        notes=notes,
    )
