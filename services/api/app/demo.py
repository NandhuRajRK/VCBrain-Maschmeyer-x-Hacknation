import json
from pathlib import Path

from .document_parser import parse_document
from .models import Company, DemoSeedResult, Founder, IngestionStatus, Segment, Source, SourceType
from .pipeline import extract_claims, resolve_claim_statuses
from .scoring import update_founder_score
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
        target.companies[company.id] = company
        target.founders[f"{company.id}:{founder.name.lower()}"] = founder

        _add_deck(target, company.id, profile["deck"])
        _add_note(target, company.id, "Traction note", profile["traction"])
        if profile.get("contradiction"):
            _add_note(target, company.id, "Contradiction note", profile["contradiction"])

        resolve_claim_statuses(target.company_claims(company.id), list(target.evidence.values()))
        score = update_founder_score(
            founder,
            target.company_claims(company.id),
            target.company_sources(company.id),
            target.company_evidence(company.id),
        )
        founder.cold_start = score.cold_start
        target.founder_scores[founder.id] = score

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
    target.trigger_events.clear()


def _add_deck(target: Store, company_id: str, filename: str) -> None:
    path = SAMPLES / "decks" / filename
    parsed = parse_document(filename, path.read_bytes())
    source = Source(
        company_id=company_id,
        source_type=SourceType.pitch_deck,
        title=filename,
        text=parsed.text,
        metadata={"filename": filename, "parser": parsed.parser, "demo_seed": True},
        status=IngestionStatus.parsed,
    )
    target.sources[source.id] = source
    segments = [
        Segment(source_id=source.id, heading=chunk.heading, page=chunk.page, text=chunk.text)
        for chunk in parsed.chunks
    ]
    _save_segments_and_claims(target, company_id, source, segments)


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


def _save_segments_and_claims(target: Store, company_id: str, source: Source, segments: list[Segment]) -> None:
    for segment in segments:
        target.segments[segment.id] = segment
    claims, evidence = extract_claims(company_id, source, segments, target.company_founders(company_id))
    for item in evidence:
        target.evidence[item.id] = item
    for claim in claims:
        target.claims[claim.id] = claim
