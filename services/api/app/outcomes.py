from __future__ import annotations

from .models import OutcomeScenario, OutcomeSimulationInput, OutcomeSimulationResult


def simulate_outcome(
    assumptions: OutcomeSimulationInput,
    company_id: str | None = None,
) -> OutcomeSimulationResult:
    base = _scenario("base", assumptions)
    scenarios = [
        _scenario("bear", assumptions.model_copy(update={
            "monthly_growth_pct": assumptions.monthly_growth_pct - 5,
            "monthly_churn_pct": assumptions.monthly_churn_pct + 3,
            "gross_margin_pct": max(0, assumptions.gross_margin_pct - 10),
            "exit_revenue_multiple": assumptions.exit_revenue_multiple * 0.7,
            "exit_probability": max(0, assumptions.exit_probability - 0.05),
        })),
        base,
        _scenario("bull", assumptions.model_copy(update={
            "monthly_growth_pct": assumptions.monthly_growth_pct + 5,
            "monthly_churn_pct": max(0, assumptions.monthly_churn_pct - 1),
            "gross_margin_pct": min(100, assumptions.gross_margin_pct + 10),
            "exit_revenue_multiple": assumptions.exit_revenue_multiple * 1.3,
            "exit_probability": min(1, assumptions.exit_probability + 0.05),
        })),
    ]
    return OutcomeSimulationResult(
        company_id=company_id,
        initial_ownership_pct=round(_initial_ownership(assumptions) * 100, 4),
        effective_monthly_growth_pct=round(assumptions.monthly_growth_pct - assumptions.monthly_churn_pct, 4),
        projected_mrr_usd=base.projected_mrr_usd,
        projected_arr_usd=base.projected_arr_usd,
        monthly_gross_profit_usd=round(base.projected_mrr_usd * assumptions.gross_margin_pct / 100, 2),
        runway_months=base.runway_months,
        cash_flow_positive=base.runway_months is None,
        required_next_round_pre_money_usd=base.required_next_round_pre_money_usd,
        next_round_post_money_usd=round(assumptions.next_round_raise_usd / (assumptions.target_next_round_dilution_pct / 100), 2),
        post_round_ownership_pct=base.post_round_ownership_pct,
        exit_value_usd=base.exit_value_usd,
        expected_return_usd=base.expected_return_usd,
        expected_moic=base.expected_moic,
        scenarios=scenarios,
    )


def _scenario(label: str, assumptions: OutcomeSimulationInput) -> OutcomeScenario:
    growth = (assumptions.monthly_growth_pct - assumptions.monthly_churn_pct) / 100
    projected_mrr = assumptions.starting_mrr_usd * (1 + growth) ** assumptions.exit_months
    initial_ownership = _initial_ownership(assumptions)
    dilution = assumptions.target_next_round_dilution_pct / 100
    post_round_ownership = initial_ownership * (1 - dilution)
    next_round_post_money = assumptions.next_round_raise_usd / dilution
    exit_value = projected_mrr * 12 * assumptions.exit_revenue_multiple
    expected_return = exit_value * post_round_ownership * assumptions.exit_probability
    return OutcomeScenario(
        label=label,
        projected_mrr_usd=round(projected_mrr, 2),
        projected_arr_usd=round(projected_mrr * 12, 2),
        runway_months=_runway(assumptions),
        required_next_round_pre_money_usd=round(next_round_post_money - assumptions.next_round_raise_usd, 2),
        post_round_ownership_pct=round(post_round_ownership * 100, 4),
        exit_value_usd=round(exit_value, 2),
        expected_return_usd=round(expected_return, 2),
        expected_moic=round(expected_return / assumptions.initial_investment_usd, 4),
    )


def _initial_ownership(assumptions: OutcomeSimulationInput) -> float:
    return assumptions.initial_investment_usd / (
        assumptions.entry_valuation_usd + assumptions.initial_investment_usd
    )


def _runway(assumptions: OutcomeSimulationInput) -> float | None:
    cash = assumptions.cash_on_hand_usd
    mrr = assumptions.starting_mrr_usd
    growth = (assumptions.monthly_growth_pct - assumptions.monthly_churn_pct) / 100
    margin = assumptions.gross_margin_pct / 100
    if assumptions.monthly_burn_usd == 0:
        return None
    for month in range(1, 121):
        mrr *= 1 + growth
        gross_profit = mrr * margin
        previous_cash = cash
        cash += gross_profit - assumptions.monthly_burn_usd
        if cash < 0:
            monthly_net_burn = assumptions.monthly_burn_usd - gross_profit
            fraction = previous_cash / monthly_net_burn if monthly_net_burn > 0 else 0
            return round((month - 1) + fraction, 2)
    return None
