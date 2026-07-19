# Iskra Manual End-to-End Test

Use the files in this folder for a complete demo run. The fixtures describe AetherGrid, an AI infrastructure startup, and intentionally include a few claims that should be flagged for verification.

## 1. New analysis modal

Open Iskra and click `+`.

Enter:

```text
Company name: AetherGrid
Website: https://aethergrid.example
Sector: AI infrastructure
Stage: Seed
Geography: Berlin, Germany
Company context: AetherGrid routes inference jobs across distributed GPU capacity for European enterprises. It is raising a $1.5M seed round to expand its orchestration layer and enterprise sales motion.
```

Attach these files by drag-and-drop:

1. `aethergrid-pitch-deck.md`
2. `aethergrid-founder-background.md`
3. `aethergrid-customer-reference.md`
4. `aethergrid-financials.csv`
5. `aethergrid-market-note.md`

Click `Run analysis`.

Expected result:

- The progress state moves through document reading, sourcing, evidence linking, scoring, and memo creation.
- The company opens with claims, evidence, founder passport data, three-axis scores, gaps, and contradictions.
- The memo should not treat every founder-provided claim as independently verified.
- The financial CSV and customer reference should create traction and financial claims.

## 2. Chat text workflow

Start a fresh chat and ask:

```text
What are AetherGrid's three biggest evidence gaps before a seed investment?
```

Then use the tag-analysis icon, select AetherGrid, and ask:

```text
Compare the pitch deck's customer claims with the customer reference and financials. Flag contradictions and say what to verify next.
```

Then ask:

```text
What would need to be true for this company to move from HOLD to INVEST?
```

Expected result:

- The current chat remains in the chat selector as a named conversation.
- The greeting disappears after the first turn.
- User messages appear on the right; Iskra responses include the orb marker.
- Answers distinguish founder-provided, public, and independent evidence.

## 3. Dictation workflow

Select `Dictate`, click the microphone, allow browser microphone access, and say:

```text
Find technical founders in Berlin with AI infrastructure experience
```

Stop recording.

Expected result:

- The transcript appears in the normal chat composer.
- No analysis is submitted automatically.
- The user can edit the transcript and press Send.

## 4. Dialogue workflow

Select `Dialogue`, click the microphone, allow access if prompted, and say:

```text
Review AetherGrid and tell me the most important reason to stay on hold
```

Stop recording.

Expected result:

- The voice state changes from listening to processing.
- The transcript becomes a user message.
- Iskra returns a grounded response.
- ElevenLabs reads the response when browser playback is permitted.
- The text response remains visible even if audio playback is blocked.

## 5. Chat-created analysis

Start another chat and enter:

```text
Create an analysis for Northstar Compute, a pre-seed AI infrastructure company based in Munich. It builds scheduling software for private GPU clusters and is raising 750000 euros.
```

Review the extracted fields in the modal, attach `northstar-founder-note.md`, and run the analysis.

## 6. Safety checks

- Use a custom sector such as `industrial AI` and confirm it remains editable.
- Close a dropdown by clicking outside it.
- Try a file with no readable text and confirm the error is understandable.
- Refresh the company page after analysis and confirm sources, claims, and comments persist.
- Open the same chat again from the selector and confirm its messages remain.
