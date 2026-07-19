# Iskra Documentation

This documentation supports the HackNation submission for the Maschmeyer Group
**The VC Brain** challenge.

## Product and Demo

- [Submission overview](INTRO.md): challenge, product thesis, and judging story.
- [Demo walkthrough](demo-walkthrough.md): the five-minute presentation flow.
- [Pitch script](pitch-script.md): a concise judge-facing presentation script.
- [Manual validation](demo-fixtures/MANUAL_E2E_TEST.md): repeatable browser and
  voice checks using synthetic files.
- [Current product status](product-status.md): implemented workflows and
  hackathon boundaries.

## System Design

- [Architecture](architecture.md): system boundaries, data flow, persistence,
  and reliability choices.
- [API reference](api-reference.md): FastAPI routes grouped by workflow.
- [Shared schemas](../packages/shared/README.md): API and web contract source of
  truth.
- [LLM and prompt design](llm-prompts.md): use-case-specific prompts,
  structured outputs, fallbacks, and credit controls.

## Product Capabilities

- [Founder Passport](founder-passport.md)
- [Decision Flight Recorder](decision-flight-recorder.md)
- [Voice Modes](voice-mode.md)
- [Outcome Simulator](outcome-simulator-api.md)
- [Deal Collaboration](collaboration-api.md)
- [Authentication and Clerk](clerk-integration.md)
- [Enterprise IAM](enterprise-iam.md)

The root [README](../README.md) contains local setup, demo seeding, testing, and
the high-level feature list.
