import os

os.environ["VCBRAIN_DB_PATH"] = "/tmp/vcbrain-collaboration.sqlite3"

from fastapi.testclient import TestClient

from services.api.app.main import app, store


def test_deal_workspace_collaboration_and_conflicts():
    for collection in (
        store.companies,
        store.founders,
        store.sources,
        store.segments,
        store.claims,
        store.evidence,
        store.founder_scores,
        store.founder_score_history,
        store.claim_status_changes,
        store.deal_members,
        store.collaboration_notes,
        store.deal_tasks,
        store.deal_activity,
        store.deal_invitations,
        store.trigger_events,
    ):
        collection.clear()

    client = TestClient(app)
    company_id = client.post("/companies", json={"name": "CollabCo"}).json()["id"]
    base = f"/companies/{company_id}"
    lead = {"X-Actor-Id": "user_lead"}
    partner = {"X-Actor-Id": "user_partner"}

    assert client.post(
        f"{base}/collaborators",
        headers=lead,
        json={"user_id": "user_partner", "role": "partner"},
    ).status_code == 201
    note = client.post(
        f"{base}/collaboration/notes",
        headers=lead,
        json={"body": "Verify enterprise references.", "anchor": "Readiness", "mentions": ["user_partner"]},
    )
    assert note.status_code == 201
    assert note.json()["anchor"] == "Readiness"
    assert note.json()["mentions"] == ["user_partner"]
    parent_id = note.json()["id"]
    other_company_id = client.post("/companies", json={"name": "OtherCo"}).json()["id"]
    other_note = client.post(
        f"/companies/{other_company_id}/collaboration/notes",
        headers={"X-Actor-Id": "other_lead"},
        json={"body": "Private note."},
    )
    assert other_note.status_code == 201
    assert client.patch(
        f"{base}/collaboration/notes/{parent_id}",
        headers=lead,
        json={**note.json(), "parent_id": other_note.json()["id"], "version": 1},
    ).status_code == 404
    reply = client.post(
        f"{base}/collaboration/notes",
        headers=partner,
        json={"body": "I will own the reference calls.", "parent_id": parent_id, "anchor": "Readiness"},
    )
    assert reply.status_code == 201
    assert reply.json()["parent_id"] == parent_id
    resolved = client.patch(
        f"{base}/collaboration/notes/{parent_id}",
        headers=lead,
        json={**note.json(), "status": "resolved", "version": 1},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    task = client.post(
        f"{base}/collaboration/tasks",
        headers=partner,
        json={"title": "Call two references"},
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    workspace = client.get(f"{base}/collaboration", headers=lead)
    assert workspace.status_code == 200
    assert len(workspace.json()["members"]) == 2
    assert len(workspace.json()["activity"]) == 5

    assert client.patch(
        f"{base}/collaboration/tasks/{task_id}",
        headers=partner,
        json={"version": 1, "status": "done"},
    ).status_code == 200
    assert client.patch(
        f"{base}/collaboration/tasks/{task_id}",
        headers=lead,
        json={"version": 1, "status": "open"},
    ).status_code == 409
    assert client.get(f"{base}/collaboration", headers={"X-Actor-Id": "outsider"}).status_code == 403


def test_collaboration_is_organization_scoped():
    for collection in (
        store.companies,
        store.founders,
        store.sources,
        store.segments,
        store.claims,
        store.evidence,
        store.founder_scores,
        store.founder_score_history,
        store.claim_status_changes,
        store.deal_members,
        store.collaboration_notes,
        store.deal_tasks,
        store.deal_activity,
        store.deal_invitations,
        store.trigger_events,
    ):
        collection.clear()

    client = TestClient(app)
    org_a_lead = {"X-Actor-Id": "lead", "X-Organization-Id": "org_a"}
    org_a_partner = {"X-Actor-Id": "partner", "X-Organization-Id": "org_a"}
    company = client.post("/companies", headers=org_a_lead, json={"name": "TenantCo"}).json()
    base = f"/companies/{company['id']}"
    assert company["organization_id"] == "org_a"

    invite = client.post(
        f"{base}/invitations",
        headers=org_a_lead,
        json={"invited_user_id": "partner", "role": "associate"},
    )
    assert invite.status_code == 201
    accepted = client.post(f"/invitations/{invite.json()['id']}/accept", headers=org_a_partner)
    assert accepted.status_code == 200
    assert client.get(f"{base}/collaboration", headers=org_a_partner).status_code == 200
    assert client.get(
        f"{base}/collaboration",
        headers={"X-Actor-Id": "partner", "X-Organization-Id": "org_b"},
    ).status_code == 404
    assert client.get(
        f"{base}/collaboration",
        headers={"X-Actor-Id": "outsider", "X-Organization-Id": "org_a"},
    ).status_code == 403


def test_company_data_routes_do_not_cross_organization_boundaries():
    for collection in (
        store.companies,
        store.founders,
        store.sources,
        store.segments,
        store.claims,
        store.evidence,
        store.founder_scores,
        store.founder_score_history,
        store.claim_status_changes,
        store.trigger_events,
    ):
        collection.clear()

    client = TestClient(app)
    org_a = {"X-Actor-Id": "a", "X-Organization-Id": "org_a"}
    org_b = {"X-Actor-Id": "b", "X-Organization-Id": "org_b"}
    company = client.post("/companies", headers=org_a, json={"name": "PrivateCo"}).json()
    company_id = company["id"]

    assert client.post(
        "/sources",
        headers=org_b,
        json={"company_id": company_id, "source_type": "press", "title": "Leak"},
    ).status_code == 404
    assert client.post(
        "/sources/pull",
        headers=org_b,
        json={"company_id": company_id, "connectors": []},
    ).status_code == 404
    assert client.get(f"/companies/{company_id}/dossier", headers=org_b).status_code == 404
    assert client.post(
        "/outcomes/simulate",
        headers=org_b,
        json={},
    ).status_code == 200
    assert client.post(
        f"/companies/{company_id}/outcomes/simulate",
        headers=org_b,
        json={},
    ).status_code == 404
