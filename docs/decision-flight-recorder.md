# Decision Flight Recorder

The flight recorder explains how new evidence changes diligence rather than
showing only the latest memo.

## API

`GET /companies/{company_id}/readiness` returns:

- a 0-100 diligence-completeness score
- explicit blockers
- ranked next-best evidence actions
- the expected readiness gain for each action

`GET /companies/{company_id}/timeline` returns:

- immutable Founder Score snapshots and deltas
- claim verification transitions
- contradiction, score-change, cold-start, and decision-ready events
- current readiness

## Demo

Seed the demo, find AetherGrid, and load its timeline. The initial dossier has
one score snapshot and a queued HN correction. Call the ingest endpoint once.
The correction disputes the 20-customer claim, adds a second score snapshot,
lowers confidence/readiness, and makes contradiction resolution the top action.

This is causal decision support: every change points back to claims and
evidence IDs. It does not average Julia's three investment axes or replace the
investment recommendation.
