# Enterprise Identity

Clerk is Iskra's identity boundary. It handles provider-specific SAML or OIDC
exchanges while the API consumes one provider-neutral organization contract.

## Supported Connections

- Microsoft Entra ID through SAML or OIDC
- Google Workspace through SAML or OIDC
- Okta Workforce through SAML
- any compatible SAML identity provider
- any compatible OIDC identity provider

Provider credentials, certificates, redirect URLs, and domain routing belong in
Clerk and the deployment secret store, not in this repository.

## API Identity Contract

```text
sub             -> user_id
org_id          -> organization_id
org_role        -> organization_role
org_permissions -> organization_permissions
```

The organization ID scopes every deal and collaborative record. This lets a VC
firm change identity providers without changing Iskra's data model.

## Firm Onboarding

1. Create a Clerk Organization for the firm.
2. Configure the firm's SAML or OIDC connection.
3. Associate verified domains with the connection.
4. Add the frontend and API keys to deployment secrets.
5. Restrict authorized parties to the production web origins.
6. Confirm that users cannot access a company from another organization.

Enterprise directory setup is deployment-specific and is not required for the
local HackNation demo.
