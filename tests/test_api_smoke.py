import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["VCBRAIN_DB_PATH"] = "/tmp/vcbrain-api-smoke.sqlite3"

from services.api.app import main
from services.api.app.models import ConnectorKind, Signal


def test_create_pull_ingest_dossier(monkeypatch):
    main.store.companies.clear()
    main.store.founders.clear()
    main.store.sources.clear()
    main.store.segments.clear()
    main.store.claims.clear()
    main.store.evidence.clear()
    main.store.founder_scores.clear()
    main.store.trigger_events.clear()

    def fake_pull(connectors, query, github_user=None, arxiv_query=None, website_url=None):
        return [
            Signal(
                source=ConnectorKind.github,
                title="GitHub profile: demo",
                url="https://github.com/demo",
                text="demo has 18 public repos and 42 followers on GitHub.",
                metadata={"public_repos": 18, "followers": 42},
            ),
            Signal(
                source=ConnectorKind.hacker_news,
                title="HN launch: DemoCo",
                text="Hacker News discussion for DemoCo.",
                metadata={"points": 120, "comments": 35},
            ),
            Signal(
                source=ConnectorKind.arxiv,
                title="arXiv research signal: demo ai",
                text="Research activity related to DemoCo.",
                metadata={"query": "demo ai"},
            ),
        ]

    monkeypatch.setattr(main, "pull_signals", fake_pull)
    client = TestClient(main.app)

    company = client.post("/companies", json={"name": "DemoCo"})
    assert company.status_code == 201
    company_id = company.json()["id"]

    upload = client.post(
        f"/companies/{company_id}/documents",
        files={
            "file": (
                "demo-deck.txt",
                b"Sector: AI. Stage: seed. DemoCo helps analysts research companies.",
                "text/plain",
            )
        },
    )
    assert upload.status_code == 200
    assert upload.json()["source"]["source_type"] == "document"
    assert "extract_traction_metrics" in upload.json()["llm_tasks"]

    pull = client.post(
        "/sources/pull",
        json={
            "company_id": company_id,
            "connectors": ["github", "hacker_news", "arxiv"],
            "query": "DemoCo",
            "github_user": "demo",
        },
    )
    assert pull.status_code == 200
    assert len(pull.json()["created_sources"]) == 3

    ingest = client.post(f"/companies/{company_id}/ingest")
    assert ingest.status_code == 200
    assert ingest.json()["parsed_segments"] == 3

    dossier = client.get(f"/companies/{company_id}/dossier")
    assert dossier.status_code == 200
    payload = dossier.json()
    assert len(payload["sources"]) == 4
    assert len(payload["claims"]) >= 4
    assert len(payload["evidence"]) >= 4
    assert payload["evidence"][0]["source_independence"] in {"founder_provided", "company_owned", "third_party"}
    assert payload["evidence"][0]["confidence_reason"]
    assert payload["founder_scores"][0]["cold_start"] is False
    assert payload["founder_scores"][0]["evidence_coverage"] > 0
    assert any(event["kind"] == "new_application" for event in payload["trigger_events"])
    assert any(event["kind"] == "signal_threshold_crossed" for event in payload["trigger_events"])

    search = client.post(
        "/founders/search",
        json={"query": "technical founder AI seed", "limit": 5},
    )
    assert search.status_code == 200
    assert search.json()[0]["company"]["name"] == "DemoCo"

    founder_id = payload["founders"][0]["id"]
    activate = client.post(
        "/founders/activate",
        json={"founder_id": founder_id, "context": "strong technical and launch signals"},
    )
    assert activate.status_code == 200
    assert "DemoCo x Maschmeyer Group" == activate.json()["subject"]

    voice = client.post("/voice/narrate", json={"text": "Demo narration."})
    assert voice.status_code == 503

    companies = client.get("/companies")
    founders = client.get("/founders")
    assert companies.status_code == 200
    assert founders.status_code == 200
    assert len(companies.json()) == 1
    assert len(founders.json()) == 1

    seeded = client.post("/demo/seed")
    assert seeded.status_code == 200
    assert seeded.json()["companies"] == 10
    assert seeded.json()["founders"] == 10
    assert seeded.json()["claims"] >= 20
