# Five-Minute Demo Walkthrough

The demo should tell one coherent story: Iskra turns fragmented startup data
into a fast decision without hiding uncertainty.

## Setup

```bash
cp .env.example .env
uv sync --group dev
VCBRAIN_DB_PATH=/tmp/iskra-demo.sqlite3 uv run python scripts/seed_demo.py --reset
VCBRAIN_DB_PATH=/tmp/iskra-demo.sqlite3 uv run uvicorn services.api.app.main:app --reload
```

In a second terminal:

```bash
cd apps/web
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open <http://localhost:3000> and confirm the dashboard loads before presenting.

## 1. Portfolio Cockpit

Start on the dashboard. Show decision candidates, thesis fit, evidence
confidence, open diligence work, ranked founders, pipeline velocity, and the
interactive global intelligence map.

The point: the investor sees where attention is needed before opening a deck.

## 2. Evidence-Backed Company Review

Open AetherGrid from Deal Flow.

Show:

- the Founder Passport with sourced employment, education, and prior ventures
- the three independent investment axes
- claims grouped by type and linked to readable evidence
- readiness blockers and next diligence actions
- the investment memo, red-team view, and decision-flip conditions

The point: Iskra distinguishes investment quality from evidence completeness.

## 3. Contradiction Moment

Ingest the staged independent AetherGrid correction. The pitch material claims
20 enterprise customers while the new source says there were five pilots.

Refresh the company review and show:

- the disputed traction claim
- changed confidence and readiness
- a new score snapshot and timeline event
- contradiction resolution promoted to the next action

The point: the system reacts causally to new evidence instead of regenerating a
plausible-looking memo with no audit trail.

## 4. Honest Cold Start

Open KiteBio or Brickwise. Show `cold_start: true`, low evidence confidence,
explicit Founder Passport gaps, and recommended research actions.

The point: missing public data is uncertainty, not proof of a weak founder.

## 5. Iskra Search and Voice

Open Iskra and ask:

```text
Find technical AI infrastructure founders in Berlin.
```

Tag one or more existing analyses and ask which has the strongest independent
traction evidence. Then demonstrate dictation or dialogue mode.

The point: text and voice use the same evidence-backed portfolio context.

## 6. Create an Analysis

Ask Iskra:

```text
Start a new analysis for Northstar Robotics, a pre-seed industrial automation
company in Munich.
```

Review the extracted fields, attach a synthetic document, and start diligence.
The completed flow opens the company analysis directly.

## 7. Collaboration and Outcomes

Add a contextual comment to a claim, mention a teammate, create a verification
task, and open the outcome simulator. Adjust growth, churn, margin, and dilution
to show runway, next-round valuation, ownership, and MOIC changing instantly.

The point: the decision becomes a shared operating workflow, not a static memo.

## Closing Line

“Iskra does not promise that AI can know the answer. It helps an investment team
reach a faster answer while preserving what is known, disputed, and still
missing.”
