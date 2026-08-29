# Complete Authentication + Profile System — Final Audit

Date: 2026-08-23  
Status: **All implementation stages A–G complete and verified**

## Final architecture

```text
Browser (React Dashboard design)
  └─ AuthProvider — one account/profile source of truth
       │ HttpOnly same-origin session
       ▼
Express authentication/account routers
  ├─ local Argon2id credentials
  ├─ Discord OAuth identity linking
  ├─ email verification/recovery
  ├─ TOTP/recovery MFA
  ├─ profile/email/avatar controls
  ├─ session/device/activity controls
  └─ recent reauthentication/deactivation
       │
       ▼
Supabase PostgreSQL + Supabase Storage
```

Internal account UUIDs and Discord snowflakes remain separate. Discord identity
is mandatory for guild administration and remains authoritative for guild
membership, Dashboard permissions, role hierarchy, Socket.IO, and SSE.

## Required UI routes

Public:

```text
/login
/register
/forgot-password
/reset-password
/verify-email
```

Protected:

```text
/profile
/settings
/settings/security
```

All eight paths were served as the production SPA in a local integration run.
Protected paths redirect unauthenticated users to `/login` with a same-origin,
validated return path. Authenticated users are redirected away from login and
register. Frontend redirects are UX only; every API independently enforces its
backend session/identity requirement.

Existing guild hash routes remain unchanged:

```text
/#security
/#settings
```

## Feature completion matrix

| Feature | Result |
|---|---|
| Email/username login | Complete |
| Public registration | Complete |
| Discord OAuth login/linking | Complete |
| Logout | Complete, cookie + Clear-Site-Data |
| Forgot/reset password | Complete |
| Email verification/resend | Complete |
| Profile display/edit | Complete |
| Name/username update | Complete, centralized immediate refresh |
| Avatar upload/preview/remove | Complete, validated Supabase pipeline |
| Pending email change | Complete, password reauth + new-address verification |
| Change password | Complete, MFA-aware + session policy |
| TOTP MFA | Complete, encrypted seed + pending first-code confirmation |
| Recovery codes | Complete, hashed, shown once, single-use |
| MFA disable/regenerate | Complete, password + factor |
| Active sessions/devices | Complete |
| Individual/other/all logout | Complete |
| Security activity | Complete, persistent PostgreSQL events |
| Recent reauthentication | Complete, ten-minute server grant |
| Protected route behavior | Complete |
| Delayed account deactivation | Complete |
| Dashboard profile integration | Complete |

## Security audit

### Credentials

- Argon2id: 19 MiB, t=2, p=1.
- 15–128 character password policy; Unicode/passphrases allowed.
- Unknown login identifiers perform dummy Argon2 work.
- Passwords/hashes never enter responses, sessions, events, or logs.
- Email/username uniqueness is case-insensitive.
- Authentication abuse limits are PostgreSQL/advisory-lock coordinated.

### Verification and recovery

- 32 random bytes per token.
- SHA-256 hashes only in PostgreSQL.
- Fixed purpose, expiry, atomic single use.
- New issuance invalidates previous same-purpose tokens.
- Forgot-password responses are generic.
- Links use configured `DASHBOARD_URL`, never request Host.
- Password reset revokes all existing sessions.

### MFA

- RFC 6238 compatible TOTP.
- AES-256-GCM seed encryption with independent key.
- MFA_PENDING sessions have no authenticated identity.
- Password and Discord OAuth both enforce MFA.
- Atomic TOTP time-step replay rejection.
- Recovery codes are random, HMAC-hashed, and single-use.
- Factor changes require password + existing factor and revoke other sessions.
- All system roles require account MFA; DEVELOPER still requires DEV_TOKEN.

### Sessions

- Session ID regeneration after every completed login/MFA privilege change.
- HttpOnly, Secure in production, SameSite=Lax cookie.
- 30-minute rolling idle timeout.
- 24-hour absolute lifetime.
- Public session UUID handles; raw SIDs never reach the browser.
- Persistent created/last-active/expiry/device metadata.
- Current/individual/other/all revocation.
- Logout/deactivation browser-state cleanup.

### Profile and uploads

- Backend validation on every mutation.
- Reserved and case-insensitive unique usernames.
- 30-day username-change cooldown.
- Email replacement only after new-address verification.
- Old-address notification after email change.
- Avatar: one file, 2 MiB, MIME allowlist plus authoritative decode.
- 16 MP/4096 dimension bounds.
- Square crop and fresh 512×512 PNG re-encode.
- UUID object names outside the Dashboard webroot.
- Supabase service key remains backend-only.

### Authorization and errors

- Account identity cannot authorize a Discord guild action.
- Existing guild access/hierarchy chain is unchanged.
- CSRF origin validation applies to every unsafe account endpoint.
- Anonymous route audit covers all 183 HTTP endpoints.
- API errors remain sanitized and correlated by request ID.
- Account secrets are covered by recursive logger/audit redaction.
- Account tables have RLS enabled without browser policies.

## Design-system audit

No new Dashboard, template, color palette, font, or UI library was introduced.
Account pages reuse:

```text
Outfit
#05070B / #070A0F / #0B0E14
cyan #22d3ee / #7DF9FF
cyber-card / cyber-card-accent / cyber-card-hover
cyber-input / cyber-button / cyber-button-solid / cyber-button-danger
PageHeader / Toast / CopyButton / PasswordField
existing focus, motion, reduced-motion, RTL, spacing, and breakpoints
```

The auth shell and account pages use mobile-first width, padding, wrapping, and
grid classes (`w-full`, `max-w-*`, `sm:*`, `md:*`). Structural contract checks
cover responsive primitives used at the requested 320, 375, 390, 414, 768,
1024, and 1440+ width ranges. Final real-device visual acceptance remains an
operator/browser task because this sandbox has no Chromium runtime.

## Database tables

```text
accounts
account_credentials
account_identities
account_email_tokens
account_mfa_totp
account_recovery_codes
account_auth_limits
account_session_metadata
account_security_events
```

All are normalized PostgreSQL tables with constraints/indexes and RLS. Password,
email token, MFA seed, recovery code, and session data are not stored in
`bot_kv`.

## Automated verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                    12 PASS
Security suites:                23 PASS
Discord commands:                   100
Audited HTTP routes:                 183
Guild routes:                        105
Root production vulnerabilities:      0
Dashboard production vulnerabilities: 0
Dashboard modules transformed:      1,817
Dashboard build:                    PASS
Main JS:                         264.11 kB / 83.00 kB gzip
```

Credential-free integration also confirmed all required UI paths return the
built SPA, `/api/auth/status` remains safe, missing account storage returns an
actionable 503, and forgot-password remains generic HTTP 200.

## Required production configuration

In addition to existing Discord/PostgreSQL/session values:

```text
EMAIL_PROVIDER=resend
EMAIL_FROM=<verified sender>
RESEND_API_KEY=<new secret>
SUPABASE_URL=<HTTPS project origin>
SUPABASE_SERVICE_ROLE_KEY=<new rotated backend-only key>
SUPABASE_AVATAR_BUCKET=avatars
ACCOUNT_ENCRYPTION_KEY=<new independent 32-byte key>
```

The Storage bucket must be configured for intended public avatar reads. No
previously exposed key/token/password may be reused.

## External acceptance limitations

The code, schema, tests, build, and credential-free integration are complete.
The following cannot be honestly completed without provider access and newly
rotated credentials:

1. real Resend delivery and sender-domain acceptance;
2. real Supabase account-table migration and Storage upload/delete;
3. real Discord account linking and guild acceptance;
4. Render deployment and strict live smoke test;
5. visual checks on physical iPhone/Android/tablet devices.

Use `docs/deployment/deployment-live-runbook.md` and rerun strict deployment acceptance
after provider configuration.

## Stage status

```text
Phase 1 repository/auth/design audit                   COMPLETE
Stage A internal account + Discord identity foundation COMPLETE
Stage B registration/login + Argon2id                   COMPLETE
Stage C email verification + password recovery         COMPLETE
Stage D editable profile/email/avatar                   COMPLETE
Stage E TOTP MFA + recovery codes                       COMPLETE
Stage F sessions/activity/reauth/deactivation           COMPLETE
Stage G integration and final audit                     COMPLETE
```
