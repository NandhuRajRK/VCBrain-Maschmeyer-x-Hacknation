# LLM and Prompt Design

OpenAI is Iskra's language-model provider. The system uses a dedicated prompt
for every task rather than one universal assistant prompt.

Prompts live in `services/api/app/prompts.py`. Structured tasks use constrained
Pydantic/JSON outputs, while deterministic fallbacks keep the core demo usable
without an API key.

## Prompt Responsibilities

| Prompt | Responsibility | Explicit boundary |
| --- | --- | --- |
| Founder search | Parse sourcing language into filters | Does not rank or recommend |
| Claim extraction | Extract multiple source-backed diligence claims | Does not score or write a memo |
| Company profile | Extract sector, stage, geography, and description | Uses null instead of guessing |
| Founder Passport | Extract employment, education, ventures, and skills | Does not infer missing history |
| Contradiction referee | Distinguish incompatible claims from dates, subsets, or units | Introduces no outside facts |
| Voice command router | Convert a transcript into a typed workspace intent | Routes rather than answering |
| Web diligence scout | Request concise public signals and citations | Does not make a final decision |
| Portfolio assistant | Answer from supplied portfolio or tagged-analysis context | Refuses unsupported facts |
| Chat title | Name a conversation from its first request | Does not answer the request |
| Opportunity intake | Extract fields for an explicitly requested new analysis | Does not create unstated data |

## Evidence Discipline

Model output is not automatically treated as verified evidence. Claim
extraction must preserve source text, numbers, dates, units, and qualifiers.
Assistant attachments remain contextual until they enter the ingestion pipeline.
Investment explanations should retain claim IDs and identify missing support.

## Scoring

Language-model reasoning may explain Founder, Market, and Idea-vs-Market
signals, but the axes remain independent and evidence-adjusted. The product does
not average them into one opaque score. Deterministic scoring remains available
for reproducibility and fallback behavior.

## Cost Controls

Development defaults to `gpt-4o-mini`. Chat titles use the separately
configurable small title model. Contradiction and Founder Passport calls are
capped with:

```dotenv
OPENAI_CONTRADICTION_MAX_CALLS=8
OPENAI_FOUNDER_PASSPORT_MAX_CALLS=10
```

Founder web enrichment is explicit and result-capped. Automated tests mock
model behavior and do not consume credits.

## Failure Behavior

- Structured extraction falls back to deterministic parsing where supported.
- The assistant states when the model is unavailable instead of fabricating an
  answer.
- Connector or model failures become visible warnings and evidence gaps.
- Upstream voice/model errors are converted into user-facing API errors.
