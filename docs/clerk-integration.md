# Clerk Integration

The API now has an optional Clerk verification layer on the `nandhu` branch.
It does not change existing demo endpoints, so Julia can continue developing the
UI independently and add authentication when she is ready.

## Backend setup

Add these values to the local `.env` file, never to git:

```dotenv
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
```

The secret key and PEM JWT public key are available in Clerk Dashboard -> API
Keys. `CLERK_AUTHORIZED_PARTIES` must contain every allowed frontend origin.

## Frontend handoff

Julia can add `@clerk/nextjs`, wrap the app in `ClerkProvider`, and attach a
session token to API requests:

```ts
const token = await getToken();
fetch(`${API_URL}/auth/me`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

`GET /auth/me` returns `user_id`, `session_id`, and `organization_id`. The
`require_user` dependency in `services/api/app/auth.py` can be added to any
route that should require a signed-in user. Existing routes remain public for
the demo until the team agrees which actions need protection.
