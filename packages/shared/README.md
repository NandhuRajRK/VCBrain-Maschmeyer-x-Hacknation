# Shared Schemas

`schemas.json` is the wire-contract reference shared by the FastAPI service and
the Next.js workspace.

It describes companies, founders, claims, evidence, Founder Scores, Founder
Passports, readiness, timelines, thesis configuration, three-axis scoring,
investment memos, decisions, voice commands, collaboration, and outcome data.

API payloads use `snake_case`. TypeScript may use `camelCase` internally, but
the API adapter must map fields explicitly at the boundary.

Important distinctions:

- Decision readiness measures evidence completeness; it is not a fourth
  investment score.
- Founder Score is persistent founder memory; the Founder investment axis is a
  separate opportunity-level assessment.
- Claims reference evidence through `evidence_ids`.
- Model-generated rationale must preserve source and claim identifiers where
  the schema provides them.

When a shared response changes, update the schema, Pydantic model, TypeScript
adapter, and contract tests together.
