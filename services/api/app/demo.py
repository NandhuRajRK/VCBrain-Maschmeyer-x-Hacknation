import json
from pathlib import Path

from .document_parser import parse_document
from .memory import refresh_company_memory
from .models import Company, DemoSeedResult, Founder, IngestionStatus, Segment, Source, SourceType
from .pipeline import extract_claims
from .provenance import initialize_company_provenance
from .store import Store, store


ROOT = Path(__file__).resolve().parents[3]
SAMPLES = ROOT / "data" / "samples"


def seed_demo(reset: bool = True, target: Store = store) -> DemoSeedResult:
    if reset:
        clear_store(target)

    profiles = json.loads((SAMPLES / "founders.json").read_text())
    for profile in profiles:
        company = Company(
            name=profile["company"],
            website=profile.get("website"),
            sector=profile["sector"],
            stage=profile["stage"],
            geography=profile["geography"],
            description=f"{profile['company']} is a {profile['sector']} startup.",
        )
        founder = Founder(
            company_id=company.id,
            name=profile["founder"],
            role="Founder",
            github=profile.get("github"),
            cold_start=profile["level"] == "cold",
        )
        initialize_company_provenance(company, "demo_seed")
        target.companies[company.id] = company
        target.founders[f"{company.id}:{founder.name.lower()}"] = founder

        _add_deck(target, company, founder, profile)
        _add_note(target, company.id, "Traction note", profile["traction"])
        refresh_company_memory(target, company.id)
        if profile.get("contradiction"):
            contradiction_type = (
                SourceType.hacker_news
                if "hn " in profile["contradiction"].lower()
                else SourceType.founder_questionnaire
            )
            _queue_note(
                target,
                company.id,
                "Incoming contradiction signal",
                profile["contradiction"],
                contradiction_type,
            )

    target.save()
    return DemoSeedResult(
        companies=len(target.companies),
        founders=len(target.founders),
        claims=len(target.claims),
        evidence=len(target.evidence),
    )


def clear_store(target: Store = store) -> None:
    target.companies.clear()
    target.founders.clear()
    target.sources.clear()
    target.segments.clear()
    target.claims.clear()
    target.evidence.clear()
    target.founder_scores.clear()
    target.founder_score_history.clear()
    target.claim_status_changes.clear()
    target.trigger_events.clear()


def _add_deck(target: Store, company: Company, founder: Founder, profile: dict) -> None:
    filename = profile["deck"]
    normalized_company = company.name.lower().replace(" ", "")
    normalized_filename = filename.lower().replace("_", "").replace("-", "")
    uses_own_deck = normalized_company in normalized_filename
    if uses_own_deck:
        content = (SAMPLES / "decks" / filename).read_bytes()
        title = filename
    else:
        title = f"{company.name.lower()}_pitch.md"
        content = (
            f"Company: {company.name}.\n"
            f"Founder: {founder.name}.\n"
            f"Sector: {company.sector}.\n"
            f"Stage: {company.stage}.\n"
            f"Geography: {company.geography}.\n"
            f"Product: {company.name} builds a {company.sector} platform.\n"
            f"Market: Organizations adopting {company.sector} products.\n"
            f"Traction: {profile['traction']}\n"
        ).encode("utf-8")
    parsed = parse_document(title, content)
    source = Source(
        company_id=company.id,
        source_type=SourceType.pitch_deck,
        title=title,
        text=parsed.text,
        metadata={
            "filename": title,
            "parser": parsed.parser,
            "demo_seed": True,
            "generated_for_profile": not uses_own_deck,
        },
        status=IngestionStatus.parsed,
    )
    target.sources[source.id] = source
    segments = [
        Segment(source_id=source.id, heading=chunk.heading, page=chunk.page, text=chunk.text)
        for chunk in parsed.chunks
    ]
    _save_segments_and_claims(target, company.id, source, segments)


def _add_note(target: Store, company_id: str, title: str, text: str) -> None:
    source = Source(
        company_id=company_id,
        source_type=SourceType.crm_note,
        title=title,
        text=text,
        metadata={"demo_seed": True},
        status=IngestionStatus.parsed,
    )
    target.sources[source.id] = source
    _save_segments_and_claims(target, company_id, source, [Segment(source_id=source.id, heading=title, text=text)])


def _queue_note(
    target: Store,
    company_id: str,
    title: str,
    text: str,
    source_type: SourceType,
) -> None:
    source = Source(
        company_id=company_id,
        source_type=source_type,
        title=title,
        text=text,
        metadata={"demo_seed": True, "staged_signal": True},
    )
    target.sources[source.id] = source


def _save_segments_and_claims(target: Store, company_id: str, source: Source, segments: list[Segment]) -> None:
    for segment in segments:
        target.segments[segment.id] = segment
    claims, evidence = extract_claims(company_id, source, segments, target.company_founders(company_id))
    for item in evidence:
        target.evidence[item.id] = item
    for claim in claims:
        target.claims[claim.id] = claim
