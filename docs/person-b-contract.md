# Person B Contract

Julia owns the intelligence and experience layer: thesis fit, opportunity
scoring, memo generation, decision support, and the React dashboard. Nandhu's
data layer is the source of truth for companies, founders, sources, claims,
evidence, and persistent Founder Scores.

## Input Contract

Start every analysis with:

```text
GET /companies/{company_id}/dossier
```

The dossier contains `company`, `founders`, `sources`, `segments`, `claims`,
`evidence`, `founder_scores`, and `trigger_events`. Do not reconstruct or
overwrite these records in the UI.

Important semantics:

- `FounderScore` is persistent founder memory, not the opportunity score.
- `FounderScore.cold_start` must remain visible and lower confidence.
- `Claim.confidence` is the claim-level Trust Score input.
- `Claim.status` is `supported`, `disputed`, or `missing_evidence` after
  ingestion. Always show the status and linked `evidence_ids`.
- `Evidence.source_independence` and `freshness_days` must be visible when a
  rationale depends on source quality.

## Thesis Engine

Use `ThesisConfig` from `packages/shared/schemas.json`:

- sectors
- stages
- geographies
- check size
- ownership target
- risk appetite

Implement hard-fit filtering before ranking. Return the matched filters,
failed filters, and the reasons for every failure. Missing company fields are
data gaps, not automatic guesses or silent matches.

## Three-Axis Scoring

Produce exactly three independent `AxisScore` objects:

- `founder`
- `market`
- `idea_vs_market`

Each axis must return `raw`, `adjusted`, `confidence`, `trend`, `rationale`,
and `claim_ids`. Do not average the three axes into a single hidden score.
The decision layer may use the three values transparently, but must preserve
the individual breakdown.

Adjust evidence-backed scores using claim confidence, source independence, and
freshness. Cite the claim IDs used in each rationale. For cold-start founders,
weight available deck and idea/market evidence more heavily, reduce confidence,
and state exactly what is missing rather than inventing founder strength.

## Trust And Memo

The memo must implement the shared `InvestmentMemo` shape:

- company snapshot
- investment hypotheses
- SWOT
- problem and product
- traction KPIs
- explicit data gaps
- red-team reason not to invest

Trust treatment is deterministic around the dossier: supported claims can be
used normally, disputed claims must be flagged, and missing-evidence claims
must appear as gaps. Do not hide contradictory or founder-provided claims.

Use separate OpenAI system prompts for thesis fit, each scoring axis, memo
generation, red-team review, and decision generation. Require structured JSON,
claim IDs for every factual rationale, explicit uncertainty, and no invented
facts. Use the configured `OPENAI_MODEL`; keep development runs on the small
configured model to protect the hackathon budget.

## Decision Output

Return the shared `Decision` shape:

- `invest`
- `conditional_invest`
- `hold`
- `reject`

Every recommendation needs conditions when applicable and at least one
decision-flip factor. A flip factor must be testable, such as verifying ARR or
obtaining a customer reference, not a vague request for "more diligence."

## Dashboard Scope

Build the usable experience in `apps/web/` with three views:

1. Pipeline: ranked founders, thesis-fit indicators, three axis scores, trend
   arrows, and cold-start badges.
2. Company deep dive: company snapshot, founder memory, claim ledger, Trust
   Scores, evidence links, contradiction flags, and data gaps.
3. Decision room: memo, SWOT, red-team section, recommendation, score
   breakdown, and decision-flip factors.

The UI should consume the shared schemas and keep source evidence one click
away from every claim. Voice responses can route to these views through the
existing `VoiceQueryResponse` intent values.

## Ownership Boundaries

Prefer these files for Julia's work:

- `services/api/app/intelligence.py`
- `services/api/app/intelligence_prompts.py`
- `services/api/app/intelligence_routes.py`
- `apps/web/**`
- intelligence/UI tests and docs

Avoid changing Nandhu-owned ingestion, connector, persistence, evidence, and
scoring files unless a contract issue is demonstrated by a failing test. If a
FastAPI route must be registered, keep the change to one router include in
`services/api/app/main.py` and coordinate it before merging.

## Required Tests

Cover one vertical slice with deterministic fixtures and mocked OpenAI calls:

- thesis pass and hard-filter failure
- all three axis outputs with claim IDs
- cold-start founder with reduced confidence and explicit gaps
- supported, disputed, and missing-evidence Trust states
- memo sections and red-team output
- all four decision values or representative decision branches
- dossier-to-dashboard loading and an empty/loading/error state

Run `uv run pytest -q` and the web test/build command before opening the merge
request. Do not spend live API credits in tests.

## Conflict-Free Integration

After Nandhu's branch is merged, sync first:

```bash
git fetch origin
git checkout julia
git rebase origin/main
```

Keep commits grouped by concern, push with `git push --force-with-lease origin
julia` after the rebase, and open a PR from `julia` into `main`. The final
integration should be a fast-forward or a clean PR merge from the updated
`main`, with no direct edits to `main` during feature work.
