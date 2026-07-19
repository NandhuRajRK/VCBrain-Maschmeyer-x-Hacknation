# Product Status

This page records the implemented hackathon surface. It is intentionally about
the product, not team ownership or branch history.

## End-to-End Workflows

| Workflow | Web experience | API surface |
| --- | --- | --- |
| Company intake and documents | Analysis modal with drag and drop | Companies and document upload routes |
| Public signal research | Analysis pipeline | Source pull and ingestion routes |
| Claims and evidence | Company evidence review | Dossier, claims, evidence, and timeline routes |
| Founder history | Founder Passport | Passport and enrichment routes |
| Investment intelligence | Three-axis score and memo | Dossier consumed by web scoring and memo logic |
| Thesis configuration | Organization thesis page | `GET/PUT /thesis` |
| Founder discovery | Iskra natural-language search | Founder search and ranked-founder routes |
| Assistant chat | Portfolio and selected-analysis Q&A | Assistant query, title, and intake routes |
| Voice | Dictation and dialogue modes | Transcription, query, and narration routes |
| Collaboration | Contextual comments, tasks, and invitations | Organization-scoped collaboration routes |
| Outcome modeling | Interactive scenario controls | Stateless outcome simulation routes |
| Analysis recovery | Progress rows in deal flow | Persisted analysis jobs |
| Enterprise identity | Clerk sign-in and organization context | Token verification and `/auth/me` |

## Demo-Safe Behavior

- Synthetic portfolio and supporting documents are included.
- Missing paid credentials do not break the core diligence flow.
- Backend tests do not consume OpenAI or ElevenLabs credits.
- OpenAI uses small configured models and bounded structured calls.
- Cross-organization access checks are covered by collaboration tests.

## Beyond the Hackathon

The current implementation is suitable for a local or controlled demo. A
production rollout still needs managed Postgres, durable background workers,
database migrations, audit-log retention, rate limits, monitoring, model
evaluation, privacy review, and a deployment-specific Clerk configuration.
