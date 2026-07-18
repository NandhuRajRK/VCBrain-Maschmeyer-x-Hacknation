# Demo Walkthrough

Goal: show an evidence-backed investment workflow in under five minutes.

## Setup

```bash
uv sync --group dev
cp .env.example .env
VCBRAIN_DB_PATH=/tmp/vcbrain-demo.sqlite3 uv run python scripts/seed_demo.py --reset
uv run uvicorn services.api.app.main:app --reload
```

## Scenario 1: Inbound Founder

Use `AetherGrid`.

1. Open the company dossier.
2. Show pitch-deck claims, source evidence, and Founder Score.
3. Point out the contradiction: deck says 20 enterprise customers, another
   seeded note says 5 pilots.
4. Julia's layer should turn this into a Trust Score flag and memo gap.

## Scenario 2: Cold Start

Use `KiteBio` or `Brickwise`.

1. Show that sparse public data is not treated as a failure.
2. Founder Score stays low-confidence and `cold_start: true`.
3. The system recommends evidence gaps rather than pretending certainty.

## Scenario 3: Outbound Sourcing

Search:

```text
technical founder, Berlin, AI infra, no prior VC backing
```

1. `POST /founders/search` parses the query into structured filters.
2. Results are ranked by matched fields plus evidence quality.
3. Use `POST /founders/activate` to generate an outreach draft tied to evidence.

## Scenario 4: Decision Room Hand-Off

Julia consumes:

```text
GET /companies/{company_id}/dossier
```

Her layer should add thesis filtering, 3-axis scoring, memo generation, and
decision-flip logic. The data layer remains the evidence source of truth.

## Optional: Voice Moment

If `ELEVENLABS_API_KEY` is set, send the outreach draft or memo text to:

```text
POST /voice/narrate
```

Play the returned MP3 as the investor-friendly "listen to the brief" moment.
