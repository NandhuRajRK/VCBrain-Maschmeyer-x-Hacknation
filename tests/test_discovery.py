import os

os.environ["VCBRAIN_DB_PATH"] = "/tmp/vcbrain-discovery.sqlite3"

from fastapi.testclient import TestClient

from services.api.app import main
from services.api.app import discovery
from services.api.app.models import ConnectorKind, DiscoveryCandidate, Signal


def test_scan_creates_tenant_scoped_candidates_and_promotes_one(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    for collection in (
        main.store.companies,
        main.store.founders,
        main.store.sources,
        main.store.segments,
        main.store.claims,
        main.store.evidence,
        main.store.founder_scores,
        main.store.founder_score_history,
        main.store.claim_status_changes,
        main.store.trigger_events,
        main.store.discovery_candidates,
        main.store.discovery_runs,
    ):
        collection.clear()

    monkeypatch.setattr(
        discovery,
        "pull_signals",
        lambda connectors, query, **_: [
            Signal(
                source=ConnectorKind.hacker_news,
                title="Show HN: VectorForge builds GPU orchestration for AI teams",
                url="https://example.com/vectorforge",
                text="A newly launched GPU orchestration project for enterprise AI infrastructure.",
                metadata={"points": 84, "comments": 21, "fetch_status": "live"},
            ),
            Signal(
                source=ConnectorKind.hacker_news,
                title="Why AI Infrastructure Startups Are Insanely Hard to Build",
                url="https://example.com/commentary",
                text="Commentary about the category.",
                metadata={"points": 192, "comments": 181, "fetch_status": "live"},
            ),
            Signal(
                source=ConnectorKind.hacker_news,
                title="Show HN: I made a tool for AI infrastructure",
                url="https://example.com/unnamed-tool",
                text="A project with no usable company or person identity.",
                metadata={"points": 193, "comments": 12, "fetch_status": "live"},
            ),
            Signal(
                source=ConnectorKind.arxiv,
                title="Foundations of GenIR",
                url="https://arxiv.org/abs/2603.28944",
                text="Research paper.",
                metadata={"fetch_status": "live"},
            ),
        ],
    )
    main.store.fund_theses["org_alpha"] = main.FundThesis(
        organization_id="org_alpha", sectors=["AI infrastructure"], geographies=["Berlin"]
    )
    client = TestClient(main.app)
    headers = {"X-Actor-Id": "julia", "X-Organization-Id": "org_alpha"}

    scan = client.post("/discovery/scan", headers=headers)
    assert scan.status_code == 200
    payload = scan.json()
    assert payload["queries"] == ["AI infrastructure Berlin"]
    assert len(payload["candidates"]) == 1
    candidate = payload["candidates"][0]
    assert candidate["organization_id"] == "org_alpha"
    assert candidate["source_type"] == "hacker_news"
    assert candidate["why_now"]

    # Rows made by the earlier broad scanner default to research and cannot
    # leak back into the company-investigation inbox.
    main.store.discovery_candidates["candidate_old_research"] = DiscoveryCandidate(
        id="candidate_old_research",
        organization_id="org_alpha",
        name="Foundations of GenIR",
        headline="Foundations of GenIR",
        source_type=ConnectorKind.arxiv,
        source_url="https://arxiv.org/abs/2603.28944",
        score=66,
        confidence=0.68,
        why_now="Research paper.",
    )
    listed = client.get("/discovery/candidates", headers=headers).json()
    assert [item["id"] for item in listed] == [candidate["id"]]

    assert client.get("/discovery/candidates", headers={"X-Organization-Id": "org_beta"}).json() == []

    promotion = client.post(f"/discovery/candidates/{candidate['id']}/promote", headers=headers)
    assert promotion.status_code == 201
    company = promotion.json()["company"]
    assert company["organization_id"] == "org_alpha"
    assert "VectorForge" in company["name"]
    assert client.get("/companies", headers=headers).json()[0]["id"] == company["id"]
