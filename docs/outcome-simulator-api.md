# Outcome Simulator API

The outcome simulator is deterministic and stateless, so slider changes do not
consume LLM credits or write noisy intermediate records to the database.

```text
POST /outcomes/simulate
POST /companies/{company_id}/outcomes/simulate
```

The request accepts initial investment, pre-money entry valuation, starting MRR,
monthly growth, monthly churn, gross margin, burn, cash, next-round timing and
dilution, exit timing, revenue multiple, and exit probability.

The response returns projected next-round MRR, projected exit MRR and ARR,
monthly gross profit, estimated runway, required next-round pre-money and
post-money valuation, ownership after dilution, exit value, expected return,
expected MOIC, and bear/base/bull scenarios for the UI to chart.

All percentage fields are sent as human-readable percentages (`10` means 10%).
The initial investment is treated as buying ownership at the pre-money entry
valuation. The expected return is probability-weighted and the simulator is a
decision aid, not a forecast.
