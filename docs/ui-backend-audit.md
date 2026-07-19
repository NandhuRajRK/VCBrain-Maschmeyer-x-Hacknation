# UI and API Integration Audit

Updated: 2026-07-19

## Connected end to end

| Workflow | UI | API |
| --- | --- | --- |
| Opportunity intake and documents | Shared drag-and-drop opportunity modal | `POST /companies`, `POST /companies/{id}/documents` |
| Public signal sourcing and ingestion | Opportunity analysis pipeline | `POST /sources/pull`, `POST /companies/{id}/ingest` |
| Scoring, memo, and evidence | Dashboard and company detail | `GET /companies/{id}/dossier` |
| Decision readiness and next actions | Company Readiness tab | `GET /companies/{id}/readiness` |
| Evidence memory | Company Timeline tab | `GET /companies/{id}/timeline` |
| Founder passports and web enrichment | Founder Passports tab | Passport GET and enrichment POST routes |
| Founder activation | Founder Passport outreach action | `POST /founders/activate` |
| Outcome simulation | Interactive company Outcomes tab | `POST /companies/{id}/outcomes/simulate` |
| Deal collaboration | Deal Room tasks, notes, members, and invitations | Collaboration and invitation routes |
| Founder discovery and contextual Q&A | Iskra chat | Search and assistant routes |
| Voice conversation | Unified Iskra voice control | Transcription, assistant, and narration routes |
| Organization thesis | Thesis Config load/save | Organization-scoped `GET/PUT /thesis` |
| Analysis recovery | Opportunities progress rows | SQLite-backed analysis jobs |
| Workspace usage | Profile usage card | `GET /usage` |
| Authentication identity | Optional Clerk provider and sign-in page | Clerk token verification and `GET /auth/me` |

## Tenant and reliability controls

- Company-scoped routes reject cross-organization access when Clerk is configured.
- Company listing, theses, jobs, collaboration, invitations, and usage are organization scoped.
- Collaboration writes use SQLite immediate transactions and optimistic versions.
- API errors are normalized into user-facing messages by `apps/web/lib/errors.ts`.
- Missing Clerk keys retain an explicit local demo identity without weakening configured deployments.

## Deployment configuration

No implementation work remains in this audit. Production deployment still requires:

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and the Clerk JWT key.
2. A Clerk Organization and the desired Entra ID, Okta, Google Workspace, SAML, or OIDC connection.
3. `CLERK_AUTHORIZED_PARTIES` restricted to deployed frontend origins.
4. An optional `VCBRAIN_ANALYSIS_CREDIT_LIMIT` value for the workspace plan.

Provider credentials and enterprise directory configuration belong in Clerk and deployment secrets, not in this repository.
