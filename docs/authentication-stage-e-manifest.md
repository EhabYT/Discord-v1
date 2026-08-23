# Authentication Stage E — Pre-Change Manifest

Date: 2026-08-23  
Status: **Approved; captured before MFA changes**

## Scope

- RFC 6238 TOTP (SHA-1, 6 digits, 30-second period) for authenticator apps.
- AES-256-GCM encryption of TOTP seeds with independent Render key.
- Enrollment remains pending until the first valid code.
- QR code plus manual setup key shown only during enrollment.
- Password-authenticated login becomes short-lived MFA_PENDING.
- No protected account/guild access before challenge completion.
- Atomic replay prevention for accepted TOTP time steps.
- Ten random, hashed, single-use recovery codes shown once.
- Disable MFA and regenerate codes require password plus current factor.
- Account security UI integrated with the Dashboard design.
- Focused cryptographic/state tests and full verification.

## Required secret

```text
ACCOUNT_ENCRYPTION_KEY=<32 random bytes, base64 or 64 hex chars>
```

## Deferred

Per-device sessions, session revocation UI, activity UI, deletion/deactivation,
and passkeys/WebAuthn.
