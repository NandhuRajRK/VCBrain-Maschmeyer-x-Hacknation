from .models import (
    ClaimKind,
    ClaimStatus,
    ClaimStatusChange,
    CompanyTimeline,
    DecisionReadiness,
    DiligenceAction,
    FounderScoreSnapshot,
    SourceCategory,
    TriggerEvent,
    TriggerKind,
)
from .pipeline import resolve_claim_statuses
from .scoring import update_founder_score
from .store import Store


REQUIRED_CLAIM_KINDS = {
    ClaimKind.founder,
    ClaimKind.market,
    ClaimKind.product,
    ClaimKind.traction,
    ClaimKind.financial,
}


def refresh_company_memory(target: Store, company_id: str) -> DecisionReadiness:
    claims = target.company_claims(company_id)
    before = {
        claim.id: (claim.status, claim.verification)
        for claim in claims
    }
    resolve_claim_statuses(claims, target.company_evidence(company_id))

    newly_disputed: list[str] = []
    for claim in claims:
        previous_status, previous_verification = before[claim.id]
        if (previous_status, previous_verification) == (claim.status, claim.verification):
            continue
        change = ClaimStatusChange(
            company_id=company_id,
            claim_id=claim.id,
            previous_status=previous_status,
            current_status=claim.status,
            previous_verification=previous_verification,
            current_verification=claim.verification,
            confidence=claim.confidence,
            reason=claim.status_reason or "Claim evidence state changed.",
        )
        target.claim_status_changes[change.id] = change
        if claim.status == ClaimStatus.disputed:
            newly_disputed.append(claim.id)

    if newly_disputed:
        signature = ":".join(sorted(newly_disputed))
        _emit_once(
            target,
            TriggerEvent(
                company_id=company_id,
                kind=TriggerKind.contradiction_detected,
                message=f"Contradictory evidence detected across {len(newly_disputed)} claim(s).",
                metadata={"claim_ids": newly_disputed, "signature": signature},
            ),
        )

    for founder in target.company_founders(company_id):
        previous = target.founder_scores.get(founder.id)
        score = update_founder_score(
            founder,
            claims,
            target.company_sources(company_id),
            target.company_evidence(company_id),
        )
        founder.cold_start = score.cold_start
        target.founder_scores[founder.id] = score

        changed = previous is None or any(
            (
                previous.score != score.score,
                previous.confidence != score.confidence,
                previous.cold_start != score.cold_start,
                previous.evidence_count != score.evidence_count,
                previous.contradiction_count != score.contradiction_count,
            )
        )
        if not changed:
            continue

        score_delta = round(score.score - previous.score, 1) if previous else 0
        confidence_delta = round(score.confidence - previous.confidence, 3) if previous else 0
        snapshot = FounderScoreSnapshot(
            company_id=company_id,
            founder_id=founder.id,
            score=score.score,
            confidence=score.confidence,
            cold_start=score.cold_start,
            evidence_count=score.evidence_count,
            contradiction_count=score.contradiction_count,
            score_delta=score_delta,
            confidence_delta=confidence_delta,
            reason=_score_change_reason(previous, score),
        )
        target.founder_score_history[snapshot.id] = snapshot

        if previous:
            _emit_once(
                target,
                TriggerEvent(
                    company_id=company_id,
                    kind=TriggerKind.score_changed,
                    message=(
                        f"Founder Score changed by {score_delta:+.1f}; "
                        f"confidence changed by {confidence_delta:+.3f}."
                    ),
                    metadata={
                        "founder_id": founder.id,
                        "score": score.score,
                        "score_delta": score_delta,
                        "confidence_delta": confidence_delta,
                        "snapshot_id": snapshot.id,
                        "signature": snapshot.id,
                    },
                ),
            )
            if previous.cold_start and not score.cold_start:
                _emit_once(
                    target,
                    TriggerEvent(
                        company_id=company_id,
                        kind=TriggerKind.cold_start_resolved,
                        message="Enough founder evidence arrived to resolve cold-start status.",
                        metadata={"founder_id": founder.id, "signature": founder.id},
                    ),
                )

    readiness = calculate_readiness(target, company_id)
    if readiness.score >= 75 and not readiness.blockers:
        _emit_once(
            target,
            TriggerEvent(
                company_id=company_id,
                kind=TriggerKind.decision_ready,
                message=f"Diligence readiness reached {readiness.score}/100.",
                metadata={"score": readiness.score, "signature": "decision_ready"},
            ),
        )
    return readiness


def calculate_readiness(target: Store, company_id: str) -> DecisionReadiness:
    company = target.company(company_id)
    claims = target.company_claims(company_id)
    evidence = target.company_evidence(company_id)
    scores = target.company_founder_scores(company_id)

    profile_fields = [company.sector, company.stage, company.geography, company.description]
    profile = sum(bool(value) for value in profile_fields) / len(profile_fields)
    supported_kinds = {claim.kind for claim in claims if claim.status == ClaimStatus.supported}
    claim_coverage = len(supported_kinds & REQUIRED_CLAIM_KINDS) / len(REQUIRED_CLAIM_KINDS)
    independence = len({item.source_independence for item in evidence}) / 3 if evidence else 0
    resolution = (
        sum(claim.status in {ClaimStatus.supported, ClaimStatus.disputed} for claim in claims) / len(claims)
        if claims
        else 0
    )
    founder_memory = max((score.confidence for score in scores), default=0)
    contradiction_count = sum(claim.status == ClaimStatus.disputed for claim in claims)
    cold_start = not scores or any(score.cold_start for score in scores)

    components = {
        "company_profile": round(profile, 3),
        "claim_coverage": round(claim_coverage, 3),
        "source_independence": round(min(1.0, independence), 3),
        "claim_resolution": round(resolution, 3),
        "founder_memory": round(founder_memory, 3),
    }
    weighted = profile * 15 + claim_coverage * 25 + min(1.0, independence) * 25 + resolution * 20
    weighted += founder_memory * 15
    weighted -= min(20, contradiction_count * 4)
    readiness_score = max(0, min(100, round(weighted)))

    blockers: list[str] = []
    actions: list[DiligenceAction] = []
    missing_profile = [
        label
        for label, value in zip(("sector", "stage", "geography", "description"), profile_fields)
        if not value
    ]
    if missing_profile:
        blockers.append(f"Missing company profile fields: {', '.join(missing_profile)}")
        actions.append(
            DiligenceAction(
                priority="high",
                category="company",
                title="Complete the company profile",
                reason=f"The decision lens is missing {', '.join(missing_profile)}.",
                suggested_source_type=SourceCategory.founder_doc,
                expected_readiness_gain=min(15, len(missing_profile) * 4),
            )
        )

    missing_kinds = REQUIRED_CLAIM_KINDS - supported_kinds
    for kind in sorted(missing_kinds, key=lambda item: item.value):
        blockers.append(_missing_claim_blocker(kind))
        actions.append(_action_for_missing_kind(kind))

    if "third_party" not in {item.source_independence for item in evidence}:
        blockers.append("External corroboration is missing: current evidence is founder-provided or company-owned.")
        actions.append(
            DiligenceAction(
                priority="high",
                category="evidence",
                title="Add external corroboration",
                reason="Add one independent source such as GitHub activity, a press article, HN/Product Hunt traction, arXiv research, or a company registry record.",
                suggested_source_type=SourceCategory.press,
                expected_readiness_gain=12,
            )
        )

    disputed = [claim for claim in claims if claim.status == ClaimStatus.disputed]
    if disputed:
        blockers.append(f"{len(disputed)} disputed claim(s) require resolution")
        actions.append(
            DiligenceAction(
                priority="high",
                category="contradiction",
                title="Resolve the highest-impact contradiction",
                reason="A decision should not rely on claims with conflicting evidence.",
                suggested_source_type=SourceCategory.press,
                claim_ids=[claim.id for claim in disputed],
                expected_readiness_gain=min(16, len(disputed) * 4),
            )
        )

    if cold_start:
        blockers.append("Founder evidence is provisional: little independent track-record data is available.")
        actions.append(
            DiligenceAction(
                priority="medium",
                category="founder",
                title="Verify founder history",
                reason="Add a LinkedIn, GitHub, work-history, education, prior-venture, work-sample, or reference source.",
                suggested_source_type=SourceCategory.github,
                expected_readiness_gain=10,
            )
        )

    status = "decision_ready" if readiness_score >= 75 and not blockers else "diligence_in_progress"
    if readiness_score < 45:
        status = "insufficient_evidence"
    actions.sort(key=lambda item: (item.priority != "high", -item.expected_readiness_gain))
    return DecisionReadiness(
        company_id=company_id,
        score=readiness_score,
        status=status,
        components=components,
        blockers=blockers,
        next_actions=actions,
        contradiction_count=contradiction_count,
        cold_start=cold_start,
    )


def build_timeline(target: Store, company_id: str) -> CompanyTimeline:
    return CompanyTimeline(
        company_id=company_id,
        score_snapshots=sorted(target.company_score_history(company_id), key=lambda item: item.created_at),
        claim_changes=sorted(target.company_claim_changes(company_id), key=lambda item: item.created_at),
        trigger_events=sorted(target.company_trigger_events(company_id), key=lambda item: item.created_at),
        readiness=calculate_readiness(target, company_id),
    )


def _action_for_missing_kind(kind: ClaimKind) -> DiligenceAction:
    guidance = {
        ClaimKind.founder: ("Verify founder history", "Add a LinkedIn, GitHub, work-history, education, prior-venture, work-sample, or reference source.", SourceCategory.github, 8),
        ClaimKind.market: ("Validate the market", "Add market size, customer demand, competitive context, or another independently sourced market signal.", SourceCategory.press, 8),
        ClaimKind.product: ("Verify the product", "Request a product walkthrough or technical document that demonstrates the stated product capability.", SourceCategory.founder_doc, 6),
        ClaimKind.traction: ("Verify traction", "Add one customer, usage, revenue, retention, or launch metric with a supporting source.", SourceCategory.press, 10),
        ClaimKind.financial: ("Verify financials", "Add a financial model, revenue proof point, cap table, or fundraising document.", SourceCategory.founder_doc, 10),
    }
    title, reason, source_type, gain = guidance[kind]
    return DiligenceAction(
        priority="high" if kind in {ClaimKind.traction, ClaimKind.financial} else "medium",
        category=kind.value,
        title=title,
        reason=reason,
        suggested_source_type=source_type,
        expected_readiness_gain=gain,
    )


def _missing_claim_blocker(kind: ClaimKind) -> str:
    return {
        ClaimKind.founder: "Founder evidence gap: no supported claim verifies career history, education, prior ventures, or execution track record.",
        ClaimKind.market: "Market evidence gap: no supported claim validates demand, market size, or competitive context.",
        ClaimKind.product: "Product evidence gap: no supported claim verifies what the product does or how it works.",
        ClaimKind.traction: "Traction evidence gap: no supported claim verifies customers, usage, revenue, or retention.",
        ClaimKind.financial: "Financial evidence gap: no supported claim verifies revenue, burn, runway, or fundraising terms.",
    }[kind]


def _score_change_reason(previous, current) -> str:
    if previous is None:
        return "Initial Founder Score snapshot."
    reasons = []
    if previous.evidence_count != current.evidence_count:
        reasons.append(f"evidence count {previous.evidence_count} -> {current.evidence_count}")
    if previous.contradiction_count != current.contradiction_count:
        reasons.append(
            f"disputed claims {previous.contradiction_count} -> {current.contradiction_count}"
        )
    if previous.cold_start != current.cold_start:
        reasons.append(f"cold-start {previous.cold_start} -> {current.cold_start}")
    return "; ".join(reasons) or "Evidence quality changed."


def _emit_once(target: Store, event: TriggerEvent) -> None:
    signature = event.metadata.get("signature")
    duplicate = any(
        existing.company_id == event.company_id
        and existing.kind == event.kind
        and existing.metadata.get("signature") == signature
        for existing in target.trigger_events.values()
    )
    if not duplicate:
        target.trigger_events[event.id] = event
