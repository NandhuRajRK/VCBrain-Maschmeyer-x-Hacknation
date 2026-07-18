from statistics import mean

from pydantic import ValidationError

from .evidence import RELIABILITY
from .llm import extract_founder_background
from .models import (
    EducationHistoryEntry,
    Founder,
    FounderBackgroundExtraction,
    FounderPassport,
    PriorVentureEntry,
    Source,
    WorkHistoryEntry,
    now,
)


def enrich_founder_passports(founders: list[Founder], source: Source) -> None:
    for founder in founders:
        extraction = _background_from_metadata(founder, source)
        if (extraction is None or not _has_background(extraction)) and not source.metadata.get(
            "demo_seed"
        ):
            text = source.text or ""
            searched_name = str(source.metadata.get("founder_name") or founder.name)
            if searched_name.lower() not in text.lower():
                text = f"Founder being researched: {searched_name}.\n{text}"
            extraction = extract_founder_background(text, founder.name)
        if extraction is None or not _has_background(extraction):
            continue
        _merge_background(founder, extraction, source)


def build_founder_passport(founder: Founder) -> FounderPassport:
    populated = [
        bool(founder.role),
        bool(founder.linkedin or founder.github),
        bool(founder.work_history),
        bool(founder.education_history),
        bool(founder.previous_ventures),
    ]
    gaps = []
    if not founder.role:
        gaps.append("Current founder role is missing.")
    if not (founder.linkedin or founder.github):
        gaps.append("No LinkedIn or GitHub profile is linked.")
    if not founder.work_history:
        gaps.append("Employment history is not verified.")
    if not founder.education_history:
        gaps.append("Education history is not verified.")
    if not founder.previous_ventures:
        gaps.append("Prior founding history is not verified.")
    return FounderPassport(
        founder_id=founder.id,
        company_id=founder.company_id,
        name=founder.name,
        current_role=founder.role,
        headline=founder.headline,
        work_history=founder.work_history,
        education_history=founder.education_history,
        previous_ventures=founder.previous_ventures,
        skills=founder.skills,
        source_ids=founder.passport_source_ids,
        confidence=founder.passport_confidence,
        coverage=round(sum(populated) / len(populated), 3),
        cold_start=founder.cold_start,
        gaps=gaps,
        updated_at=founder.updated_at,
    )


def _background_from_metadata(
    founder: Founder,
    source: Source,
) -> FounderBackgroundExtraction | None:
    rows = source.metadata.get("founders", [])
    if isinstance(rows, dict):
        rows = [rows]
    for row in rows:
        if not isinstance(row, dict) or not _matches_founder(founder, row):
            continue
        payload = {
            "headline": row.get("headline"),
            "work_history": row.get("work_history") or row.get("employment") or [],
            "education_history": row.get("education_history") or row.get("education") or [],
            "previous_ventures": row.get("previous_ventures") or row.get("prior_ventures") or [],
            "skills": row.get("skills") or [],
        }
        try:
            return FounderBackgroundExtraction.model_validate(payload)
        except ValidationError:
            return None
    return None


def _matches_founder(founder: Founder, row: dict) -> bool:
    name = str(row.get("name") or "").strip().lower()
    if name and name == founder.name.strip().lower():
        return True
    handle = str(row.get("github") or row.get("handle") or "").strip().lower().lstrip("@")
    return bool(handle and founder.github and handle == founder.github.lower().lstrip("@"))


def _has_background(extraction: FounderBackgroundExtraction) -> bool:
    return bool(
        extraction.headline
        or extraction.work_history
        or extraction.education_history
        or extraction.previous_ventures
        or extraction.skills
    )


def _merge_background(
    founder: Founder,
    extraction: FounderBackgroundExtraction,
    source: Source,
) -> None:
    if extraction.headline and not founder.headline:
        founder.headline = extraction.headline
    reliability = RELIABILITY.get(source.source_type, 0.45)
    _merge_entries(founder.work_history, extraction.work_history, source.id, reliability, _work_key)
    _merge_entries(
        founder.education_history,
        extraction.education_history,
        source.id,
        reliability,
        _education_key,
    )
    _merge_entries(
        founder.previous_ventures,
        extraction.previous_ventures,
        source.id,
        reliability,
        _venture_key,
    )
    founder.skills = list(dict.fromkeys([*founder.skills, *extraction.skills]))[:20]
    founder.passport_source_ids = list(dict.fromkeys([*founder.passport_source_ids, source.id]))
    fact_confidence = [
        item.confidence
        for item in [*founder.work_history, *founder.education_history, *founder.previous_ventures]
    ]
    coverage = sum(
        (
            bool(founder.work_history),
            bool(founder.education_history),
            bool(founder.previous_ventures),
            bool(founder.linkedin or founder.github),
        )
    ) / 4
    base = mean(fact_confidence) if fact_confidence else reliability * 0.5
    founder.passport_confidence = round(min(0.98, base * 0.8 + coverage * 0.2), 3)
    founder.updated_at = now()


def _merge_entries(existing: list, incoming: list, source_id: str, reliability: float, key) -> None:
    by_key = {key(item): item for item in existing}
    for value in incoming:
        item = value.model_copy(deep=True)
        item.source_ids = list(dict.fromkeys([*item.source_ids, source_id]))
        item.confidence = round(item.confidence * 0.7 + reliability * 0.3, 3)
        current = by_key.get(key(item))
        if current is None:
            existing.append(item)
            by_key[key(item)] = item
            continue
        if source_id not in current.source_ids:
            current.source_ids.append(source_id)
            current.confidence = round(min(0.98, max(current.confidence, item.confidence) + 0.05), 3)
        for field in type(current).model_fields:
            if field in {"source_ids", "confidence"}:
                continue
            if getattr(current, field) is None and getattr(item, field) is not None:
                setattr(current, field, getattr(item, field))


def _work_key(item: WorkHistoryEntry) -> tuple:
    return item.organization.lower(), item.role.lower(), item.start_year, item.end_year


def _education_key(item: EducationHistoryEntry) -> tuple:
    return (
        item.institution.lower(),
        (item.degree or "").lower(),
        (item.field_of_study or "").lower(),
        item.graduation_year,
    )


def _venture_key(item: PriorVentureEntry) -> tuple:
    return item.company_name.lower(), item.founded_year, item.ended_year
