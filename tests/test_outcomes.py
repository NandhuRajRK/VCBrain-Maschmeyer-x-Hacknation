from fastapi.testclient import TestClient

from services.api.app.main import app


def test_outcome_simulator_returns_scenarios_and_validates_sliders():
    client = TestClient(app)
    response = client.post(
        "/outcomes/simulate",
        json={
            "starting_mrr_usd": 10_000,
            "monthly_growth_pct": 12,
            "monthly_churn_pct": 2,
            "target_next_round_dilution_pct": 20,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["effective_monthly_growth_pct"] == 10
    assert body["next_round_projected_mrr_usd"] > 10_000
    assert body["required_next_round_pre_money_usd"] == 8_000_000
    assert [item["label"] for item in body["scenarios"]] == ["bear", "base", "bull"]
    assert body["scenarios"][2]["expected_return_usd"] > body["scenarios"][0]["expected_return_usd"]
    assert client.post("/outcomes/simulate", json={"gross_margin_pct": 101}).status_code == 422
