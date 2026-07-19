# Manual End-to-End Validation

This guide validates the HackNation demo without using real company data. The
files in this directory are synthetic.

## Prerequisites

- API running on `http://localhost:8000`
- web app running on `http://localhost:3000`
- browser microphone permission enabled for voice checks
- `OPENAI_API_KEY` set only for live assistant/transcription checks
- `ELEVENLABS_API_KEY` set only for spoken dialogue checks

## Test Company

Use these fields when creating an analysis manually:

```text
Company: AetherGrid
Website: https://aethergrid.example
Sector: AI infrastructure
Stage: Seed
Geography: Berlin, Germany
Description: Routes inference jobs across distributed GPU capacity while
maintaining customer-defined latency and reliability limits.
```

Attach:

- `aethergrid-pitch-deck.md`
- `aethergrid-founder-background.md`
- `aethergrid-customer-reference.md`
- `aethergrid-market-note.md`
- `aethergrid-financials.csv`

Expected result: the analysis opens a company page with company fields, founder
history, typed claims, evidence links, three-axis scores, readiness, and a memo.

## Deal Flow

1. Open `/opportunities`.
2. Confirm the search and per-column filters remain visible when no rows match.
3. Select multiple values in at least one column filter.
4. Clear filters and open the new-analysis modal.
5. Drag the sample files into the upload area.
6. Start the analysis and confirm progress appears in the table.
7. Confirm completion navigates directly to the company page.

## Iskra Text Chat

1. Open `/search`.
2. Confirm a `New chat` entry exists before the first message.
3. Ask: `Which deal is closest to invest and what evidence is missing?`
4. Tag two analyses and ask: `Compare only these analyses.`
5. Confirm the answer names only tagged companies and identifies evidence gaps.
6. Refresh the page and confirm the chat remains in history.

Expected result: answers use supplied portfolio context, keep the three axes
separate, and state when the evidence does not support a conclusion.

## Chat-Created Analysis

Ask:

```text
Start a new analysis for Northstar Robotics, a pre-seed industrial automation
company in Munich focused on computer-vision quality control.
```

Expected result: Iskra opens the analysis modal on the same page with extracted
fields. It must not invent a website or other unstated details. Attach
`northstar-founder-note.md`, confirm, and verify that completion opens the new
company page.

## Dictation

1. Select Dictate and activate the microphone.
2. Say: `Find technical founders in Berlin building AI infrastructure.`
3. Stop speaking.
4. Confirm a loading state appears and the transcript is placed in the normal
   text composer.
5. Edit the transcript and send it.

Expected result: dictation does not switch to the full-screen dialogue state and
does not submit automatically.

## Dialogue

1. Select Dialogue and activate the microphone.
2. Say: `Compare the biggest evidence gaps in the portfolio.`
3. Stop speaking and wait for silence detection.
4. Confirm the transcript submits automatically.
5. Confirm Iskra answers, speaks when ElevenLabs is configured, and resumes
   listening after playback.
6. Cancel and confirm recording, playback, and pending callbacks stop.

Expected result: the UI moves cleanly through `Listening`, `Thinking`, and
`Speaking` without flashing back to the text layout between turns.

## Evidence and Contradiction

1. Open AetherGrid's evidence review.
2. Confirm every claim has a kind, status, confidence, and readable evidence
   card.
3. Ingest the staged independent correction.
4. Confirm the customer-count claim becomes disputed rather than duplicated.
5. Confirm readiness, the timeline, and next actions update.

## Collaboration

1. Add a contextual comment beside a company-page section.
2. Type `@` and select a teammate from the dropdown.
3. Reopen the comment marker, add a reply, and resolve the thread.
4. Refresh and confirm the thread persists.
5. Attempt a stale update in the API tests and confirm it returns `409`.

## Theme and Responsive Checks

Check dashboard, Deal Flow, Iskra, Thesis Config, and company review in:

- dark mode
- light mode
- desktop width
- tablet width
- mobile width

Confirm text contrast, dropdown dismissal, empty states, modal sizing, and no
horizontal overflow. Number inputs must keep visible controls in both themes.

## Credit Safety

- Do not repeatedly run founder web enrichment.
- Keep enrichment to one result per founder.
- Use text chat for prompt checks before dialogue narration.
- Automated tests should remain mocked and consume no live credits.
