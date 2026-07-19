# Deal Collaboration

Each company has a persistent workspace for comments, replies, evidence links,
diligence tasks, members, invitations, and activity history.

## Routes

```text
GET   /companies/{company_id}/collaboration
POST  /companies/{company_id}/collaborators
POST  /companies/{company_id}/collaboration/notes
PATCH /companies/{company_id}/collaboration/notes/{note_id}
POST  /companies/{company_id}/collaboration/tasks
PATCH /companies/{company_id}/collaboration/tasks/{task_id}
POST  /companies/{company_id}/invitations
GET   /companies/{company_id}/invitations
POST  /invitations/{invitation_id}/accept
```

## Contextual Comments

Comments can link to claim and evidence IDs, allowing a teammate's question or
judgment to remain attached to the exact diligence context. The web workspace
supports comments placed beside company-page sections, replies, `@` mentions,
and resolved threads.

## Tasks and Invitations

Tasks support `open`, `in_progress`, and `done` states and can be assigned to an
organization user. Invitations can only be accepted by the invited user while
the matching organization is active.

## Concurrency

Notes and tasks carry an integer `version`. A stale update returns `409` and the
client must refresh before retrying. Writes use SQLite `BEGIN IMMEDIATE` and
update only collaboration collections inside one transaction, preventing two
API workers from silently overwriting each other.

## Tenant Boundary

Companies, members, notes, tasks, and invitations carry `organization_id`.
Requests from a different organization receive `404`. In configured Clerk mode,
the actor comes from the verified session; local demo headers are never accepted
as a production authentication mechanism.
