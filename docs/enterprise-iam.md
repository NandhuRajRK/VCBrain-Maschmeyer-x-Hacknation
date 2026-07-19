# Enterprise IAM

VC Brain uses Clerk as the authentication boundary. The product does not
implement separate Azure, Okta, or Google login protocols; Clerk handles the
provider-specific SAML/OIDC exchange and the API verifies the resulting Clerk
session token.

## Supported enterprise providers

- Microsoft Entra ID (formerly Azure AD): SAML or Clerk EASIE/OIDC
- Google Workspace: SAML or Clerk EASIE/OIDC
- Okta Workforce: SAML
- Any SAML-compatible identity provider
- Any OIDC-compatible identity provider

Configure each connection in Clerk Dashboard -> SSO connections and associate
it with the customer's Clerk Organization. Provider credentials, certificates,
redirect URLs, and domain routing stay in Clerk and must not be added to this
repository.

## API tenant contract

For a verified Clerk session, the API uses:

```text
sub             -> user_id
org_id          -> organization_id
org_role        -> organization_role
org_permissions -> organization_permissions
```

`GET /auth/me` exposes this normalized identity context. Collaboration routes
require an active organization and compare `org_id` with the deal's
`organization_id`. A mismatched organization receives `404`; an unassigned
legacy deal is rejected in Clerk mode.

## Enterprise onboarding

1. Create a Clerk Organization for the VC firm.
2. Configure its Entra, Google Workspace, Okta, or custom SAML/OIDC connection.
3. Set the firm's verified email domain and enable the connection.
4. Add the Clerk publishable key to the frontend and the Clerk secret/JWT key to
   the API environment.
5. Keep `CLERK_AUTHORIZED_PARTIES` limited to the deployed web origins.

Clerk's Enterprise SSO connections support SAML, OIDC, and EASIE. The app's
organization boundary remains provider-neutral, so switching providers does
not require database or API changes.
