import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["VCBRAIN_DB_PATH"] = "/tmp/vcbrain-api-smoke.sqlite3"

from services.api.app import main
from services.api.app.models import (
    Claim,
    ClaimKind,
    ClaimStatus,
    ConnectorKind,
    ParsedFounderQuery,
    Signal,
    VoiceCommand,
    VoiceIntent,
)
from services.api.app.pipeline import resolve_claim_statuses


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

    monkeypatch.setattr(main, "transcribe_audio", lambda content, filename, content_type: "Find technical founders in Berlin")
    monkeypatch.setattr(
        main,
        "parse_voice_command",
        lambda transcript: VoiceCommand(intent=VoiceIntent.founder_search, query=transcript, confidence=0.99),
    )
    monkeypatch.setattr(
        main,
        "parse_founder_query",
        lambda query: ParsedFounderQuery(geographies=["berlin"], founder_traits=["technical"], confidence=0.99),
    )
    voice_query = client.post(
        "/voice/query",
        files={"audio": ("command.webm", b"fake-audio", "audio/webm")},
        data={"limit": "5"},
    )
    assert voice_query.status_code == 200
    voice_payload = voice_query.json()
    assert voice_payload["transcript"] == "Find technical founders in Berlin"
    assert voice_payload["command"]["intent"] == "founder_search"
    assert voice_payload["parsed_query"]["geographies"] == ["berlin"]
    assert voice_payload["results"][0]["company"]["name"] == "DemoCo"

    monkeypatch.setattr(
        main,
        "parse_voice_command",
        lambda transcript: VoiceCommand(intent=VoiceIntent.memo_review, query=transcript, confidence=0.99),
    )
    handoff = client.post("/voice/query/text", json={"transcript": "Review the red-team memo"})
    assert handoff.status_code == 200
    assert handoff.json()["command"]["intent"] == "memo_review"
    assert handoff.json()["results"] == []

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


def test_claim_and_founder_contract(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    for collection in (
        main.store.companies,
        main.store.founders,
        main.store.sources,
        main.store.segments,
        main.store.claims,
        main.store.evidence,
        main.store.founder_scores,
        main.store.trigger_events,
    ):
        collection.clear()

    client = TestClient(main.app)
    company = client.post("/companies", json={"name": "ContractCo"}).json()
    company_id = company["id"]
    source_text = (
        "Founder: Mira Shah. Sector: AI infrastructure. Stage: seed. Geography: Berlin. "
        "Product: routes GPU workloads. Traction: 20 enterprise customers. "
        "Market: enterprise AI infrastructure market. Funding: Raising $1M."
    )
    for title, text in [
        ("Founder deck", source_text),
        ("Public contradiction", "A public note says the company has 5 pilots, not 20 customers."),
    ]:
        response = client.post(
            "/sources",
            json={
                "company_id": company_id,
                "source_type": "pitch_deck",
                "title": title,
                "text": text,
                "metadata": {
                    "founders": [{"name": "Mira Shah", "role": "CEO", "github": "mirashah"}]
                }
                if title == "Founder deck"
                else {},
            },
        )
        assert response.status_code == 201

    ingest = client.post(f"/companies/{company_id}/ingest")
    assert ingest.status_code == 200
    dossier = client.get(f"/companies/{company_id}/dossier")
    assert dossier.status_code == 200
    payload = dossier.json()

    assert payload["company"]["sector"] == "AI infrastructure"
    assert payload["company"]["stage"] == "seed"
    assert payload["company"]["geography"] == "Berlin"
    assert payload["company"]["description"]
    assert payload["founders"][0]["name"] == "Mira Shah"
    assert payload["founders"][0]["role"] == "CEO"
    assert payload["founder_scores"][0]["cold_start"] is False
    assert payload["founder_scores"][0]["evidence_count"] >= 1
    assert payload["founder_scores"][0]["notes"]
    assert all(source["source_type"] for source in payload["sources"])
    assert all(
        source["source_category"]
        in {"github", "hacker_news", "arxiv", "product_hunt", "press", "pitch_deck", "founder_doc"}
        for source in payload["sources"]
    )
    assert all(source["submitted_at"] for source in payload["sources"])
    assert len(payload["claims"]) >= 6
    assert {claim["kind"] for claim in payload["claims"]} >= {
        "founder",
        "company",
        "product",
        "traction",
        "market",
        "financial",
    }
    assert len({claim["confidence"] for claim in payload["claims"]}) > 1
    assert all(
        evidence_id in {item["id"] for item in payload["evidence"]}
        for claim in payload["claims"]
        for evidence_id in claim["evidence_ids"]
    )
    statuses = {claim["status"] for claim in payload["claims"]}
    assert ClaimStatus.supported.value in statuses
    assert ClaimStatus.disputed.value in statuses

    broken = Claim(
        company_id=company_id,
        kind=ClaimKind.company,
        text="This claim has no linked evidence.",
        evidence_ids=["missing_evidence"],
        confidence=0.9,
    )
    resolve_claim_statuses([broken], [])
    assert broken.status == ClaimStatus.missing_evidence
    assert broken.confidence == 0.25
