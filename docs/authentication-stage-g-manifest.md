# Authentication Stage G — Final Integration and Audit Manifest

Date: 2026-08-23  
Status: **Final approved stage**

## Scope

- Correct local-account ↔ Discord identity linking without email auto-linking.
- Add `/settings` account hub and explicit protected pathname redirects.
- Ensure authenticated users do not remain on login/register.
- Verify all required public/protected pages and APIs by contract tests.
- Audit centralized state, error safety, rate limits, CSRF, cookies, sessions,
  MFA, recovery, uploads, schema, configuration, responsive classes, build,
  dependencies, and route inventory.
- Update README/environment/deployment documentation.
- Run complete release gate and create final implementation report.

## No new feature scope

Passkeys/WebAuthn, legal terms content, provider credentials, live Resend delivery,
live Supabase Storage, and live Discord/Supabase acceptance require external
provider/operator inputs and are documented as such.
