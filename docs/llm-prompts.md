# LLM Prompt Policy

OpenAI is the LLM provider for this project.

Each LLM use case has a dedicated system prompt in
`services/api/app/prompts.py`. Do not use one universal prompt for unrelated
tasks.

## Current Prompts

- `FOUNDER_SEARCH_SYSTEM_PROMPT`
  - Parses natural-language sourcing queries into structured filters.
  - Does not rank founders or make investment judgments.
- `CLAIM_EXTRACTION_SYSTEM_PROMPT`
  - Extracts source-backed claims from documents and public signals.
  - Does not score, memo, or infer beyond source text.
- `COMPANY_PROFILE_SYSTEM_PROMPT`
  - Extracts sector, stage, geography, and description from unstructured source
    text.
- `CONTRADICTION_SYSTEM_PROMPT`
  - Distinguishes incompatible claims from temporal growth, subsets, and
    different units.
- `FOUNDER_PASSPORT_SYSTEM_PROMPT`
  - Extracts sourced employment, education, prior ventures, and skills.
- `VOICE_COMMAND_SYSTEM_PROMPT`
  - Routes a transcript to search, dossier, memo, decision, activation, or
    unknown without answering the request.
- `PERPLEXITY_DILIGENCE_SYSTEM_PROMPT`
  - Guides Perplexity web-grounded diligence source discovery.
  - Produces concise evidence signals, not final decisions.

## Ownership Boundary

Nandhu owns prompts that create or normalize data for the memory layer.
Julia owns prompts for thesis reasoning, 3-axis scoring, memo generation,
Trust Scores, and investment decisions.

All structured OpenAI calls use strict JSON schemas and the configured small
model by default. Contradiction and Founder Passport calls have process-level
caps controlled by `OPENAI_CONTRADICTION_MAX_CALLS` and
`OPENAI_FOUNDER_PASSPORT_MAX_CALLS`.
