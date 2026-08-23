# Authentication Stage B — Local Credentials and Auth UI

Date: 2026-08-23  
Status: **Implemented and verified**

## Backend

Added public endpoints:

```text
POST /api/auth/register
POST /api/auth/login
```

Registration validates and normalizes display name, username, email, password,
and confirmation. It creates an explicitly unverified account and regenerates
the session. Login accepts email or username, uses one generic credential error,
performs a dummy Argon2 verification for unknown accounts to reduce timing
enumeration, regenerates the session, and creates an account-only session.

Account-only sessions deliberately contain no fabricated Discord identity or
guild list. Existing guild middleware continues to reject them until Discord is
linked through the existing OAuth flow.

## Password storage

Added reviewed `argon2` dependency and Argon2id configuration:

```text
memory:      19 MiB
iterations:  2
parallelism: 1
minimum:     15 characters
maximum:     128 characters
```

Passwords/hashes are absent from sessions, responses, logs, and security-event
metadata.

## Multi-instance abuse controls

`account_auth_limits` stores only SHA-256 bucket identifiers, never raw email or
IP values. Updates run in dedicated PostgreSQL transactions with advisory locks.
Policies:

```text
Registration: 5/IP/hour
Login:        20/IP/15 minutes
Login:         8/account identifier/15 minutes
```

## Dashboard

Added native, lazy-loaded pages:

```text
/login
/register
```

They reuse the existing logo, Outfit font, background, cyber cards, cyan
buttons, inputs, focus rings, warnings, responsive spacing, and animations.
Shared components added once:

```text
AuthLayout
PasswordField
PasswordStrength
```

The centralized AuthProvider now owns register/login state and immediately
updates the Profile/Sidebar projection. Authenticated users opening login or
register are redirected to Profile.

## Schema

Added:

```text
account_credentials
account_auth_limits
```

Both have RLS enabled and remain backend-only.

## Verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                     6 PASS
Security suites:                22 PASS
Discord commands:                   100
Audited HTTP routes:                 162
Guild routes:                        105
Root vulnerabilities:                 0
Dashboard vulnerabilities:            0
Dashboard modules transformed:      1,812
Dashboard build:                    PASS
Main JS:                         262.16 kB / 82.40 kB gzip
Login chunk:                       1.88 kB / 0.94 kB gzip
Register chunk:                    2.68 kB / 1.12 kB gzip
Password shared chunk:             2.68 kB / 1.21 kB gzip
```

## Deferred

Stage C remains responsible for Resend email verification, resend throttling,
forgot/reset password tokens/pages, generic recovery responses, and password
reset session policy. No account is falsely marked verified in Stage B.
