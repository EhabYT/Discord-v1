# Authentication Stage E — TOTP MFA and Recovery Codes

Date: 2026-08-23  
Status: **Implemented and verified**

## MFA login state

Password and Discord OAuth flows now branch to a five-minute `MFA_PENDING`
session when the account has MFA enabled. That session has no authenticated
account/Discord fields and cannot reach protected account or guild APIs.
Successful TOTP/recovery verification regenerates the session before attaching
identity. Discord OAuth pending state preserves Discord identity/guild data only
inside the server-side challenge and releases it after MFA succeeds.

## TOTP

- RFC 6238, SHA-1, six digits, 30-second period.
- 20 random bytes encoded Base32.
- ±1 time-step clock tolerance.
- Accepted time step atomically persisted; equal/older codes cannot replay.
- Seed encrypted with AES-256-GCM and domain-separated authenticated data.
- QR and manual key returned only during pending enrollment.
- Enrollment expires in ten minutes and is not enabled until first code passes.

Required Render secret:

```text
ACCOUNT_ENCRYPTION_KEY=<32 random bytes in base64 or 64 hex chars>
```

## Recovery codes

- Ten random codes, displayed only on enable/regeneration.
- Copy and download controls in the Dashboard.
- HMAC-SHA-256 hashes only in PostgreSQL.
- Atomic single-use consumption.
- Regeneration invalidates the complete previous set.
- Disable/regenerate requires current password plus TOTP or recovery factor.

## API

```text
POST /api/auth/mfa/verify
POST /api/account/mfa/enroll
POST /api/account/mfa/confirm
POST /api/account/mfa/disable
POST /api/account/recovery-codes/regenerate
```

## System roles

SUPPORT, DEVELOPER, and SUPER_ADMIN now require enrolled/completed account MFA
before system-role authorization. The independent Developer token remains an
additional requirement for listed developers. Direct-loopback development
bootstrap remains isolated from remote production.

## Dashboard

New native route:

```text
/settings/security
```

It uses the existing Profile/Auth context, PageHeader, cyber cards/buttons,
PasswordField, CopyButton, Toasts, Outfit, cyan palette, and responsive layout.
Login now renders the MFA challenge inline and accepts a TOTP or recovery code.

## Tests

- RFC 6238 vector (six-digit truncation).
- Base32 round trip.
- AES-GCM encrypt/decrypt.
- Invalid TOTP rejection.
- QR/otpauth generation.
- recovery format/uniqueness/hash.
- atomic TOTP replay rejection.
- atomic recovery-code single use.
- system-role denial without MFA.
- full route authorization sweep.

## Verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                    11 PASS
Security suites:                22 PASS
Discord commands:                   100
Audited HTTP routes:                 175
Guild routes:                        105
Root vulnerabilities:                 0
Dashboard vulnerabilities:            0
Dashboard modules transformed:      1,816
Dashboard build:                    PASS
Main JS:                         263.56 kB / 82.82 kB gzip
Account Security chunk:            5.45 kB / 1.82 kB gzip
Login chunk:                       3.07 kB / 1.23 kB gzip
```

## Security limitation

TOTP is replay-protected but not phishing-resistant. Passkeys/WebAuthn remain a
future higher-assurance enhancement. Real enrollment acceptance requires a new
independent encryption key configured directly in Render.

Session/device management, activity UI, reauthentication grants, and account
deactivation remain Stage F.
