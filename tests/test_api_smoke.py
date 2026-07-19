import json
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["VCBRAIN_DB_PATH"] = "/tmp/vcbrain-api-smoke.sqlite3"

from services.api.app import main
from services.api.app import llm
from services.api.app.models import (
    Claim,
    ClaimKind,
    ClaimStatus,
    ClaimVerification,
    Company,
    ConnectorKind,
    Source,
    SourceType,
    ParsedFounderQuery,
    Signal,
    VoiceCommand,
    VoiceIntent,
)
from services.api.app.pipeline import resolve_claim_statuses
from services.api.app.memory import calculate_readiness
from services.api.app.demo import seed_demo


def _clear_pipeline_store():
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
    ):
        collection.clear()


def test_company_preflight_skips_clerk_tenant_auth(monkeypatch):
    _clear_pipeline_store()
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_preflight")
    company = Company(name="PreflightCo", organization_id="org_test")
    main.store.companies[company.id] = company

    response = TestClient(main.app).options(
        f"/companies/{company.id}/dossier",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_demo_seed_includes_actionable_diligence_gaps():
    _clear_pipeline_store()
    seed_demo(reset=False, target=main.store, organization_id="org_demo")

    readiness = [calculate_readiness(main.store, company.id) for company in main.store.companies.values()]

    assert any(item.next_actions for item in readiness)
    assert any(item.contradiction_count for item in readiness)
    assert any(item.cold_start for item in readiness)


def test_create_pull_ingest_dossier(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    main.store.companies.clear()
    main.store.founders.clear()
    main.store.sources.clear()
    main.store.segments.clear()
    main.store.claims.clear()
    main.store.evidence.clear()
    main.store.founder_scores.clear()
    main.store.founder_score_history.clear()
    main.store.claim_status_changes.clear()
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
        main.store.founder_score_history,
        main.store.claim_status_changes,
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


def test_openai_company_profile_extraction_is_structured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}

    def fake_call(body):
        captured.update(body)
        return json.dumps(
            {
                "sector": "AI infrastructure",
                "stage": "seed",
                "geography": "Berlin",
                "description": "GPU workload routing for AI teams.",
            }
        )

    monkeypatch.setattr(llm, "_call_openai", fake_call)
    profile = llm.extract_company_profile("We route GPU workloads for AI teams in Berlin.")

    assert profile is not None
    assert profile.sector == "AI infrastructure"
    assert profile.geography == "Berlin"
    assert captured["text"]["format"]["name"] == "company_profile_extraction"
    assert captured["text"]["format"]["schema"]["required"] == [
        "sector",
        "stage",
        "geography",
        "description",
    ]


def test_decision_flight_recorder_and_source_dedup(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
    ):
        collection.clear()

    client = TestClient(main.app)
    company = client.post(
        "/companies",
        json={
            "name": "FlightRecorderCo",
            "sector": "AI infrastructure",
            "stage": "seed",
            "geography": "Berlin",
            "description": "Routes enterprise GPU workloads.",
        },
    ).json()
    company_id = company["id"]
    deck_text = (
        "Founder: Mira Shah. Product: routes GPU workloads. "
        "Market: enterprise AI infrastructure. Traction: 20 enterprise customers. "
        "Funding: Raising $1M."
    )
    created = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "pitch_deck",
            "title": "Founder deck",
            "text": deck_text,
            "metadata": {"founders": [{"name": "Mira Shah", "role": "CEO", "github": "mirashah"}]},
        },
    )
    assert created.status_code == 201
    duplicate = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "document",
            "title": "Renamed copy",
            "text": deck_text,
        },
    )
    assert duplicate.status_code == 409

    assert client.post(f"/companies/{company_id}/ingest").status_code == 200
    initial_timeline = client.get(f"/companies/{company_id}/timeline").json()
    assert len(initial_timeline["score_snapshots"]) == 1
    assert initial_timeline["claim_changes"]
    assert initial_timeline["readiness"]["next_actions"]

    contradiction = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "hacker_news",
            "title": "Public traction correction",
            "text": "A public report says the company has 5 pilots, not 20 customers.",
        },
    )
    assert contradiction.status_code == 201
    assert client.post(f"/companies/{company_id}/ingest").status_code == 200

    dossier = client.get(f"/companies/{company_id}/dossier").json()
    disputed = [claim for claim in dossier["claims"] if claim["status"] == "disputed"]
    assert disputed
    assert all(claim["verification"] == ClaimVerification.disputed.value for claim in disputed)
    disputed_evidence = {
        evidence_id
        for claim in disputed
        for evidence_id in claim["evidence_ids"]
    }
    activation = client.post(
        "/founders/activate",
        json={"founder_id": dossier["founders"][0]["id"]},
    )
    assert activation.status_code == 200
    assert disputed_evidence.isdisjoint(activation.json()["evidence_ids"])

    timeline = client.get(f"/companies/{company_id}/timeline").json()
    assert len(timeline["score_snapshots"]) == 2
    assert {event["kind"] for event in timeline["trigger_events"]} >= {
        "contradiction_detected",
        "score_changed",
    }
    assert any(action["category"] == "contradiction" for action in timeline["readiness"]["next_actions"])


def test_temporal_growth_is_not_a_contradiction(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    claims = [
        Claim(
            company_id="company_temporal",
            kind=ClaimKind.traction,
            text="The company had 20 customers in 2024.",
            evidence_ids=["ev_2024"],
            confidence=0.8,
        ),
        Claim(
            company_id="company_temporal",
            kind=ClaimKind.traction,
            text="The company had 30 customers in 2025.",
            evidence_ids=["ev_2025"],
            confidence=0.8,
        ),
    ]
    from services.api.app.models import Evidence

    evidence = [
        Evidence(source_id="src_2024", segment_id="seg_2024", quote=claims[0].text, confidence=0.8),
        Evidence(source_id="src_2025", segment_id="seg_2025", quote=claims[1].text, confidence=0.8),
    ]
    evidence[0].id = "ev_2024"
    evidence[1].id = "ev_2025"
    resolve_claim_statuses(claims, evidence)
    assert all(claim.status == ClaimStatus.supported for claim in claims)


def test_external_sources_use_press_category():
    for source_type in (
        SourceType.exa,
        SourceType.tavily,
        SourceType.perplexity,
        SourceType.opencorporates,
        SourceType.sec_edgar,
        SourceType.patentsview,
    ):
        source = Source(company_id="company_category", source_type=source_type, title=source_type.value)
        assert source.source_category.value == "press"


def test_application_profile_resists_lower_quality_source_overwrite(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
    ):
        collection.clear()

    client = TestClient(main.app)
    company = client.post(
        "/companies",
        json={
            "name": "ProvenanceCo",
            "sector": "Health AI",
            "stage": "seed",
            "geography": "Berlin",
        },
    ).json()
    company_id = company["id"]
    source = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "hacker_news",
            "title": "Unverified discussion",
            "text": "Sector: crypto. Stage: Series C. Geography: Miami.",
        },
    )
    assert source.status_code == 201
    assert client.post(f"/companies/{company_id}/ingest").status_code == 200

    persisted = client.get(f"/companies/{company_id}/dossier").json()["company"]
    assert persisted["sector"] == "Health AI"
    assert persisted["stage"] == "seed"
    assert persisted["geography"] == "Berlin"
    assert persisted["field_provenance"]["sector"] == "application"


def test_founder_passport_tracks_sourced_history(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
    ):
        collection.clear()

    client = TestClient(main.app)
    company_id = client.post("/companies", json={"name": "PassportCo"}).json()["id"]
    source = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "founder_linkedin",
            "title": "Mira Shah profile",
            "text": "Mira Shah is the founder and CEO of PassportCo.",
            "metadata": {
                "founders": [
                    {
                        "name": "Mira Shah",
                        "role": "CEO",
                        "linkedin": "https://linkedin.com/in/mirashah",
                        "work_history": [
                            {
                                "organization": "Compute Labs",
                                "role": "Staff Engineer",
                                "start_year": 2020,
                                "end_year": 2024,
                                "confidence": 0.9,
                            }
                        ],
                        "education_history": [
                            {
                                "institution": "TU Berlin",
                                "degree": "MSc",
                                "field_of_study": "Computer Science",
                                "graduation_year": 2020,
                                "confidence": 0.88,
                            }
                        ],
                        "previous_ventures": [
                            {
                                "company_name": "BatchPilot",
                                "role": "Co-founder",
                                "founded_year": 2018,
                                "ended_year": 2020,
                                "outcome": "Acqui-hired",
                                "confidence": 0.84,
                            }
                        ],
                        "skills": ["distributed systems", "machine learning"],
                    }
                ]
            },
        },
    )
    assert source.status_code == 201
    source_id = source.json()["id"]
    assert client.post(f"/companies/{company_id}/ingest").status_code == 200

    passports = client.get(f"/companies/{company_id}/founder-passports")
    assert passports.status_code == 200
    passport = passports.json()[0]
    assert passport["current_role"] == "CEO"
    assert passport["work_history"][0]["organization"] == "Compute Labs"
    assert passport["education_history"][0]["institution"] == "TU Berlin"
    assert passport["previous_ventures"][0]["company_name"] == "BatchPilot"
    assert passport["work_history"][0]["source_ids"] == [source_id]
    assert passport["coverage"] == 1.0
    assert passport["confidence"] > 0.5
    assert passport["cold_start"] is False

    initial_confidence = passport["work_history"][0]["confidence"]
    corroboration = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "press",
            "title": "Independent founder profile",
            "text": "An independent profile confirms Mira Shah's role at Compute Labs.",
            "metadata": {
                "founders": [
                    {
                        "name": "Mira Shah",
                        "work_history": [
                            {
                                "organization": "Compute Labs",
                                "role": "Staff Engineer",
                                "start_year": 2020,
                                "end_year": 2024,
                                "confidence": 0.86,
                            }
                        ],
                    }
                ]
            },
        },
    )
    assert corroboration.status_code == 201
    corroboration_id = corroboration.json()["id"]
    assert client.post(f"/companies/{company_id}/ingest").status_code == 200
    passport = client.get(f"/companies/{company_id}/founder-passports").json()[0]
    assert set(passport["work_history"][0]["source_ids"]) == {source_id, corroboration_id}
    assert passport["work_history"][0]["confidence"] > initial_confidence

    founder_id = passport["founder_id"]
    individual = client.get(f"/founders/{founder_id}/passport")
    assert individual.status_code == 200
    assert individual.json() == passport


def test_openai_founder_passport_extraction_is_dedicated(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    llm._FOUNDER_PASSPORT_CALLS = 0
    captured = {}

    def fake_call(body):
        captured.update(body)
        return json.dumps(
            {
                "headline": "Distributed systems engineer and repeat founder.",
                "work_history": [
                    {
                        "organization": "Compute Labs",
                        "role": "Staff Engineer",
                        "start_year": 2020,
                        "end_year": 2024,
                        "confidence": 0.9,
                    }
                ],
                "education_history": [],
                "previous_ventures": [],
                "skills": ["distributed systems"],
            }
        )

    monkeypatch.setattr(llm, "_call_openai", fake_call)
    extracted = llm.extract_founder_background(
        "Mira Shah worked as a Staff Engineer at Compute Labs from 2020 to 2024.",
        "Mira Shah",
    )

    assert extracted is not None
    assert extracted.work_history[0].organization == "Compute Labs"
    assert captured["text"]["format"]["name"] == "founder_passport_extraction"
    assert "founder-background extraction engine" in captured["input"][0]["content"]


def test_founder_enrichment_targets_external_search_without_live_calls(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
    ):
        collection.clear()

    captured = {}

    def fake_pull(connectors, query, github_user=None, arxiv_query=None, website_url=None):
        captured["connectors"] = connectors
        captured["query"] = query
        return [
            Signal(
                source=ConnectorKind.tavily,
                title="Mira Shah founder profile",
                url="https://example.com/mira-shah",
                text="Public founder profile for Mira Shah.",
                metadata={"fetch_status": "live"},
            )
        ]

    monkeypatch.setattr(main, "pull_signals", fake_pull)
    client = TestClient(main.app)
    company_id = client.post("/companies", json={"name": "EnrichCo"}).json()["id"]
    source = client.post(
        "/sources",
        json={
            "company_id": company_id,
            "source_type": "document",
            "title": "Founder note",
            "text": "Founder: Mira Shah.",
            "metadata": {"founders": [{"name": "Mira Shah", "role": "Founder"}]},
        },
    )
    assert source.status_code == 201
    assert client.post(f"/companies/{company_id}/ingest").status_code == 200

    response = client.post(
        f"/companies/{company_id}/founder-passports/enrich",
        json={"connectors": ["tavily"], "max_sources_per_founder": 1},
    )
    assert response.status_code == 200
    assert captured["connectors"] == [ConnectorKind.tavily]
    assert '"Mira Shah"' in captured["query"]
    assert "career education previous startup" in captured["query"]
    payload = response.json()
    assert payload["created_sources"][0]["source_type"] == "tavily"
    assert payload["created_sources"][0]["metadata"]["founder_enrichment"] is True
    assert payload["ingestion"]["accepted_sources"] == 2


def test_workspace_configuration_and_analysis_job_lifecycle(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    main.store.fund_theses.clear()
    main.store.analysis_jobs.clear()
    client = TestClient(main.app)

    identity = client.get("/auth/me")
    assert identity.status_code == 200
    assert identity.json()["user_id"] == "demo-user"

    thesis = client.put(
        "/thesis",
        json={
            "organization_id": "ignored-client-org",
            "sectors": ["ai_infra"],
            "stages": ["seed"],
            "geographies": ["DACH"],
            "preferred_models": ["api"],
            "exclusions": ["gambling"],
            "check_size_min_usd": 100000,
            "check_size_max_usd": 500000,
            "ownership_target_pct": 8,
            "risk_appetite": "moderate",
        },
    )
    assert thesis.status_code == 200
    assert thesis.json()["organization_id"] == "demo-org"
    assert client.get("/thesis").json()["sectors"] == ["ai_infra"]

    company_id = client.post("/companies", json={"name": "JobCo"}).json()["id"]
    created = client.post("/analysis-jobs", json={"company_id": company_id})
    assert created.status_code == 201
    job_id = created.json()["id"]
    completed = client.patch(
        f"/analysis-jobs/{job_id}",
        json={"stage": "complete", "progress": 100, "status": "complete"},
    )
    assert completed.status_code == 200
    assert completed.json()["progress"] == 100
    assert client.get("/analysis-jobs").json()[0]["id"] == job_id
    assert client.get("/usage").json()["used"] == 1


def test_opportunity_intent_prefills_analysis_without_live_llm(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(main.app)
    response = client.post(
        "/assistant/opportunity-intent",
        json={"request": "Analyze a new company called Vector Labs, a seed AI infrastructure startup in Berlin at https://vector.example"},
    )
    assert response.status_code == 200
    draft = response.json()
    assert draft["should_create"] is True
    assert draft["name"] == "Vector Labs"
    assert draft["stage"] == "seed"
    assert draft["sector"] == "AI infrastructure"
    assert draft["geography"] == "Berlin"
    assert draft["website"] == "https://vector.example"
