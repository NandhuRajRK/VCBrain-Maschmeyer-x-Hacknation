# Decision Flight Recorder

The Decision Flight Recorder explains how diligence changed over time instead
of showing only the latest score or memo.

## Readiness

`GET /companies/{company_id}/readiness` returns a 0-100 diligence-completeness
score, component coverage, explicit blockers, and ranked next evidence actions.
Each action includes its expected readiness gain.

Readiness is not a fourth investment score. It answers “can we responsibly make
a decision with the evidence available?”

## Timeline

`GET /companies/{company_id}/timeline` returns:

- immutable Founder Score snapshots and deltas
- claim verification transitions
- contradiction and cold-start events
- score-change and decision-ready triggers
- current readiness

## Demo Moment

Seed AetherGrid and inspect its timeline. Ingest the queued independent
correction. The new source disputes a traction claim, creates a claim-status
transition and score snapshot, lowers confidence/readiness, and moves
contradiction resolution to the top of the diligence queue.

Every change points back to claim and evidence IDs. The recorder explains the
decision process without replacing the independent Founder, Market, and
Idea-vs-Market assessments.
