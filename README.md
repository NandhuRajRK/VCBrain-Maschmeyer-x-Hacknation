# VC Brain

HackNation hackathon project for the Maschmeyer Group challenge:

> Reimagine venture investing at 100x speed by enabling an evidence-backed decision on a $100,000 investment within 24 hours.

The goal is an AI-first VC operating system for founder discovery, screening, diligence, and rapid investment decisions.

## Working Principles

- Keep the system readable and boring where possible.
- Prefer simple flows before clever abstractions.
- Keep code small, typed, and easy to delete.
- Optimize for a strong demo path before broad platform coverage.
- Every recommendation should point back to evidence.

## Proposed Repo Shape

```text
apps/
  web/            React + shadcn UI client
services/
  api/            FastAPI backend
packages/
  shared/         Shared schemas and contracts
docs/             Product, architecture, and decision notes
data/
  samples/        Tiny safe fixtures for demos
  raw/            Ignored local/source files
  processed/      Ignored generated outputs
infra/            Deployment and environment notes
scripts/          Small project utilities
tests/            Cross-service smoke and integration tests
```

## First Demo Slice

1. Founder or scout submits a startup.
2. Sources are attached or collected.
3. The system extracts claims, metrics, and evidence.
4. Missing information, contradictions, and risks are surfaced.
5. A thesis-aware score and investment memo are generated.
6. A human reviewer makes the final call.

## Branching

- `main`: stable demo-ready work.
- `nandhu`: Nandhu's working branch.
- `julia`: Julia's working branch.

Merge into `main` when a chunk is usable and demo-safe. Keep pull requests small
enough to review quickly during the hackathon.
