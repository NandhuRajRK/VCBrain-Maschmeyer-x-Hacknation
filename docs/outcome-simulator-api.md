# Outcome Simulator

The outcome simulator turns operating assumptions into an interactive venture
return scenario. It is deterministic and stateless, so slider changes do not
consume LLM credits or write noisy intermediate records.

```text
POST /outcomes/simulate
POST /companies/{company_id}/outcomes/simulate
```

Inputs include initial investment, entry valuation, starting MRR, monthly
growth, churn, gross margin, burn, cash, next-round timing and dilution, exit
timing, revenue multiple, and exit probability.

Outputs include:

- projected next-round MRR
- projected exit MRR and ARR
- monthly gross profit and estimated runway
- required next-round pre-money and post-money valuation
- ownership after dilution
- exit value, expected return, and expected MOIC
- bear, base, and bull scenarios

Percentage inputs are human-readable (`10` means 10%). The initial investment
buys ownership at the pre-money entry valuation. Expected return is
probability-weighted.

The simulator is a sensitivity tool for investment discussion, not a forecast.
