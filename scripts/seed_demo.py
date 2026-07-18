import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from services.api.app.document_parser import parse_document
from services.api.app.models import Company, Founder, IngestionStatus, Segment, Source, SourceType
from services.api.app.pipeline import extract_claims
from services.api.app.scoring import update_founder_score
from services.api.app.store import store


SAMPLES = ROOT / "data" / "samples"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the VC Brain demo dataset.")
    parser.add_argument("--reset", action="store_true", help="Clear existing in-memory collections before seeding.")
    args = parser.parse_args()

    if args.reset:
        _clear()

    profiles = json.loads((SAMPLES / "founders.json").read_text())
    for profile in profiles:
        company = _company(profile)
        founder = Founder(
            company_id=company.id,
            name=profile["founder"],
            role="Founder",
            github=profile.get("github"),
            cold_start=profile["level"] == "cold",
        )
        store.companies[company.id] = company
        store.founders[f"{company.id}:{founder.name.lower()}"] = founder

        _add_deck(company.id, profile["deck"])
        _add_note(company.id, "Traction note", profile["traction"])
        if profile.get("contradiction"):
            _add_note(company.id, "Contradiction note", profile["contradiction"])

        score = update_founder_score(
            founder,
            store.company_claims(company.id),
            store.company_sources(company.id),
        )
        founder.cold_start = score.cold_start
        store.founder_scores[founder.id] = score

    store.save()
    print(f"Seeded {len(profiles)} demo founder profiles.")


def _clear() -> None:
    store.companies.clear()
    store.founders.clear()
    store.sources.clear()
    store.segments.clear()
    store.claims.clear()
    store.evidence.clear()
    store.founder_scores.clear()
    store.trigger_events.clear()


def _company(profile: dict) -> Company:
    return Company(
        name=profile["company"],
        website=profile.get("website"),
        sector=profile["sector"],
        stage=profile["stage"],
        geography=profile["geography"],
        description=f"{profile['company']} is a {profile['sector']} startup.",
    )


def _add_deck(company_id: str, filename: str) -> None:
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
    store.sources[source.id] = source
    segments = [
        Segment(source_id=source.id, heading=chunk.heading, page=chunk.page, text=chunk.text)
        for chunk in parsed.chunks
    ]
    _save_segments_and_claims(company_id, source, segments)


def _add_note(company_id: str, title: str, text: str) -> None:
    source = Source(
        company_id=company_id,
        source_type=SourceType.crm_note,
        title=title,
        text=text,
        metadata={"demo_seed": True},
        status=IngestionStatus.parsed,
    )
    store.sources[source.id] = source
    _save_segments_and_claims(company_id, source, [Segment(source_id=source.id, heading=title, text=text)])


def _save_segments_and_claims(company_id: str, source: Source, segments: list[Segment]) -> None:
    for segment in segments:
        store.segments[segment.id] = segment
    claims, evidence = extract_claims(company_id, source, segments)
    for item in evidence:
        store.evidence[item.id] = item
    for claim in claims:
        store.claims[claim.id] = claim


if __name__ == "__main__":
    main()

