# VC Brain Documentation

VC Brain is an AI-first venture-investing workspace for reaching an
evidence-backed decision on a $100,000 investment within 24 hours.

## Start Here

- [Root README](../README.md): project purpose, setup, and branch model.
- [Architecture](architecture.md): services, data flow, persistence, and
  ownership boundaries.
- [API Reference](api-reference.md): every implemented FastAPI route with
  request examples, response shapes, and error behavior.
- [Person A Contract](person-a-contract.md): sourcing and memory contract for
  Julia's layer.
- [Person B Contract](person-b-contract.md): thesis, scoring, memo, decision,
  and dashboard contract.
- [Founder Passport](founder-passport.md): sourced founder career history and
  cold-start semantics.
- [Decision Flight Recorder](decision-flight-recorder.md): readiness, timeline,
  score deltas, and contradiction events.
- [Demo Walkthrough](demo-walkthrough.md): the five-minute demo narrative.
- [Voice Mode](voice-mode.md): browser/mobile audio input and ElevenLabs output.
- [LLM Prompt Policy](llm-prompts.md): prompt ownership and model boundaries.
- [Shared Schemas](../packages/shared/README.md): wire contract source of truth.

## Ownership

Nandhu owns the FastAPI data and memory layer: ingestion, connectors, parsing,
claims, evidence, Founder Scores, Founder Passports, persistence, search, and
voice transport.

Julia owns the intelligence and experience layer: thesis matching, the three
investment axes, Trust Scores, memo generation, investment decisions, and the
React dashboard. Her layer consumes the dossier and shared schemas; it should
not recreate the evidence ledger.

## Current Status

The backend data layer and demo flows are implemented on `nandhu`. The `main`
branch is the stable merge target. Julia's work belongs on `julia` and should be
rebased onto the current `main` before integration.
