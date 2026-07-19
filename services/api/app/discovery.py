"""Public-signal candidate generation before a company enters deal flow."""

from __future__ import annotations

import re

from .connectors import discover_github_repositories, pull_signals
from .models import (
    ConnectorKind,
    DiscoveryCandidate,
    DiscoveryCandidateKind,
    DiscoveryIdentityStatus,
    DiscoveryRun,
    FundThesis,
    Signal,
)
from .store import Store


SCAN_CONNECTORS = [ConnectorKind.hacker_news, ConnectorKind.arxiv, ConnectorKind.product_hunt]


def thesis_queries(thesis: FundThesis) -> list[str]:
    sectors = thesis.sectors[:3] or ["AI infrastructure", "developer tools", "applied AI"]
    geography = thesis.geographies[0] if thesis.geographies else ""
    return list(dict.fromkeys(" ".join(part for part in (sector, geography) if part).strip() for sector in sectors))


def run_discovery_scan(store: Store, organization_id: str, thesis: FundThesis) -> tuple[DiscoveryRun, list[DiscoveryCandidate]]:
    queries = thesis_queries(thesis)
    run = DiscoveryRun(organization_id=organization_id, queries=queries)
    created: list[DiscoveryCandidate] = []
    for query in queries:
        signals = pull_signals(SCAN_CONNECTORS, query)
        signals.extend(discover_github_repositories(query))
        run.scanned_sources += len(signals)
        for signal in signals:
            if (
                signal.metadata.get("fetch_status") != "live"
                or not _is_company_lead(signal)
                or _is_known_signal(store, organization_id, signal)
            ):
                continue
            candidate = _candidate_from_signal(organization_id, signal, query)
            store.discovery_candidates[candidate.id] = candidate
            created.append(candidate)
    run.new_candidates = len(created)
    store.discovery_runs[run.id] = run
    return run, created


def _is_company_lead(signal: Signal) -> bool:
    """Require a concrete company or project anchor before showing a lead.

    A trending discussion or a paper can inform research, but it is not a
    company for an investor to action. This guard deliberately favors a short,
    trustworthy inbox over broad but misleading topical results.
    """
    title = signal.title.strip()
    if signal.source == ConnectorKind.hacker_news:
        return bool(re.match(r"^show\s+hn\s*:", title, flags=re.IGNORECASE))
    if signal.source == ConnectorKind.product_hunt:
        return bool(title and signal.url)
    if signal.source == ConnectorKind.github:
        return bool(
            signal.metadata.get("homepage")
            and not signal.metadata.get("fork")
            and signal.metadata.get("full_name")
        )
    # arXiv is valuable technical evidence, never an investable lead by itself.
    return False


def _is_known_signal(store: Store, organization_id: str, signal: Signal) -> bool:
    url = str(signal.url) if signal.url else None
    title = _normalized(signal.title)
    return any(
        candidate.organization_id == organization_id
        and ((url and candidate.source_url and str(candidate.source_url) == url) or _normalized(candidate.headline) == title)
        for candidate in store.discovery_candidates.values()
    )


def _candidate_from_signal(organization_id: str, signal: Signal, query: str) -> DiscoveryCandidate:
    points = int(signal.metadata.get("points") or signal.metadata.get("votes") or 0)
    comments = int(signal.metadata.get("comments") or 0)
    base = {ConnectorKind.github: 64, ConnectorKind.hacker_news: 60, ConnectorKind.product_hunt: 58}.get(signal.source, 50)
    identity_status = DiscoveryIdentityStatus.needs_resolution
    identity_reason = "Confirm the founding team before deciding whether to add this to the pipeline."
    if signal.source == ConnectorKind.github:
        maintainers = ", ".join(str(item) for item in signal.metadata.get("contributors") or [])
        identity_reason = f"Repository maintainers observed: {maintainers or 'not available'}. Confirm which, if any, are founders."
    return DiscoveryCandidate(
        organization_id=organization_id,
        name=_candidate_name(signal.title),
        headline=signal.title,
        source_type=signal.source,
        source_url=signal.url,
        observed_at=signal.observed_at,
        score=min(100, base + min(18, points // 8) + min(8, comments // 10)),
        confidence=0.68 if signal.source in {ConnectorKind.hacker_news, ConnectorKind.arxiv} else 0.6,
        candidate_kind=DiscoveryCandidateKind.company,
        identity_status=identity_status,
        identity_reason=identity_reason,
        why_now=_why_now(signal),
        thesis_terms=query.split(),
        source_metadata=signal.metadata,
    )


def _candidate_name(title: str) -> str:
    value = re.sub(r"^(show hn|launch|arxiv research signal)\s*:\s*", "", title, flags=re.IGNORECASE).strip()
    value = re.split(r"\s+(?:builds|is|for|—|-)\s+", value, maxsplit=1, flags=re.IGNORECASE)[0].strip()
    return value[:90] or "Unresolved public signal"


def _why_now(signal: Signal) -> str:
    if signal.source == ConnectorKind.hacker_news:
        return f"This named project launched publicly and is attracting attention ({signal.metadata.get('points', 0)} points, {signal.metadata.get('comments', 0)} comments)."
    if signal.source == ConnectorKind.github:
        return "This project has an active public codebase and a linked product site that fit the fund's technical thesis."
    return "This named product recently launched publicly and fits the fund's thesis."


def _normalized(value: str) -> str:
    return " ".join(value.lower().split())
