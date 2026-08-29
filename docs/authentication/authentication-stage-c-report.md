# Authentication Stage C — Email Verification and Password Recovery

Date: 2026-08-23  
Status: **Implemented and verified**

## Delivered

### Email provider

Resend integration reuses existing Axios. Links are built only from configured
`DASHBOARD_URL`; request Host headers are never trusted. Missing provider config
does not leak account existence or expose tokens.

Required runtime configuration:

```text
EMAIL_PROVIDER=resend
EMAIL_FROM=<verified sender>
RESEND_API_KEY=<Render secret>
```

### Token lifecycle

`account_email_tokens` stores:

- SHA-256 hash of a 32-byte random URL-safe token;
- account and fixed purpose;
- expiry and one-time `used_at` state;
- no plaintext token.

Issuing a new same-purpose token invalidates previous outstanding tokens.
Verification and reset consumption use PostgreSQL row locks and transactions.

```text
verify_email:   24 hours
reset_password: 30 minutes
```

### API

```text
POST /api/auth/resend-verification  authenticated
POST /api/auth/verify-email         public token exchange
POST /api/auth/forgot-password      generic anti-enumeration response
POST /api/auth/reset-password       single-use token + Argon2id policy
```

Forgot-password returns the same HTTP 200 response for existing, missing,
unverified, malformed, throttled, and delivery-failure cases. Reset completion
updates the Argon2id hash and deletes all server sessions for the account in the
same transaction.

### Dashboard

Native lazy-loaded pages:

```text
/verify-email
/forgot-password
/reset-password
```

All reuse AuthLayout, PasswordField, PasswordStrength, cyber cards/buttons,
Outfit, Dashboard colors, responsive spacing, and safe error states. Login now
links to password recovery; Profile links to email verification when needed.

### Configuration safety

Render Blueprint and `.env.example` contain variable names only. The release
validator now requires Resend provider configuration declarations and prevents
committed values for `EMAIL_FROM` and `RESEND_API_KEY`.

## Tests

Added tests for:

- configured-origin rejection of embedded credentials;
- email HTML escaping;
- provider-not-configured behavior;
- deterministic token hashing;
- plaintext token absence from storage;
- verification token single use;
- reset token single use;
- email verification state update;
- password update and all-session deletion;
- schema purpose constraints and RLS.

## Verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                     8 PASS
Security suites:                22 PASS
Discord commands:                   100
Audited HTTP routes:                 166
Guild routes:                        105
Root vulnerabilities:                 0
Dashboard vulnerabilities:            0
Dashboard modules transformed:      1,815
Dashboard build:                    PASS
Main JS:                         262.92 kB / 82.64 kB gzip
Forgot page:                       1.34 kB / 0.75 kB gzip
Verify page:                       1.46 kB / 0.77 kB gzip
Reset page:                        1.99 kB / 0.96 kB gzip
```

## External acceptance limitation

Real email delivery cannot be tested until a verified Resend sender and newly
created API key are configured directly in Render. No credential value was
created, displayed, or stored in the repository.

Editable profile/email-change, Supabase avatar storage, MFA, session UI,
activity UI, and deactivation remain deferred to their approved later stages.
