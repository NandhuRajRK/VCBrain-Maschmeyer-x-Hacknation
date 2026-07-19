# Authentication with Clerk

Iskra uses Clerk for user sessions and organization membership. Authentication
is optional for local demo mode and required when `APP_ENV=production`.

## Environment

Add these values to `.env`; never commit real credentials:

```dotenv
APP_ENV=development
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://your-domain.clerk.accounts.dev/sign-in
```

The browser publishable key is safe to expose. The Clerk secret and JWT key are
backend-only deployment secrets.

## Request Flow

1. `ClerkProvider` initializes the Next.js session.
2. The web API adapter obtains the active session token.
3. Requests send `Authorization: Bearer <token>`.
4. FastAPI verifies the token, authorized party, and session claims.
5. `sub`, `org_id`, role, and permissions become the request identity context.

`GET /auth/me` returns the normalized identity used by the workspace.

## Organization Isolation

Companies, analyses, theses, memory, invitations, comments, and tasks are scoped
to the active Clerk Organization. Cross-organization company access returns
`404` to avoid leaking resource existence. A legacy company without an
organization is rejected when Clerk mode is active.

The API owns this boundary. Hiding a record in the UI is not treated as an
authorization control.

## Local Demo Mode

Without Clerk keys, development uses an explicit demo user and organization.
Optional `X-Actor-Id` and `X-Organization-Id` headers support collaboration
tests. This fallback is disabled in production mode.

## Clerk Setup Checklist

1. Create a Clerk application and organization.
2. Copy the publishable key, secret key, and JWT verification key into the
   deployment secret store.
3. Restrict `CLERK_AUTHORIZED_PARTIES` to deployed frontend origins.
4. Configure the desired social or enterprise identity connections.
5. Test a valid session, missing organization, and cross-organization request
   before the demo.
