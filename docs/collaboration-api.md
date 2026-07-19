# Deal Collaboration API

Each company has a persistent deal workspace for a VC team. The backend stores
members, evidence-linked notes, diligence tasks, and an activity feed in the
same SQLite persistence layer as the dossier.

## Endpoints

```text
GET   /companies/{company_id}/collaboration
POST  /companies/{company_id}/collaborators
POST  /companies/{company_id}/collaboration/notes
PATCH /companies/{company_id}/collaboration/notes/{note_id}
POST  /companies/{company_id}/collaboration/tasks
PATCH /companies/{company_id}/collaboration/tasks/{task_id}
```

Notes accept `claim_ids` and `evidence_ids`, so a teammate's judgment remains
attached to the evidence behind it. Tasks support `open`, `in_progress`, and
`done` states plus assignment to a Clerk user ID.

The first teammate bootstraps a workspace. Subsequent requests must come from
one of its members. Notes and tasks use an integer `version`; stale updates
return `409` and force the client to refresh before overwriting another user's
work.

When Clerk is configured, the actor is taken from the verified `sub` claim.
Without Clerk keys, local development can use `X-Actor-Id` as a temporary demo
identity. This fallback must not be used in production.
