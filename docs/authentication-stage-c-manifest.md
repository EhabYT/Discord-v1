# Authentication Stage C — Pre-Change Manifest

Date: 2026-08-23  
Status: **Approved; captured before email/recovery changes**

## Scope

- Resend HTTP email adapter using existing Axios.
- Configured `DASHBOARD_URL` only for links; never request Host.
- 32-byte random verification/reset tokens.
- SHA-256 token hashes only in PostgreSQL.
- Purpose-bound, expiring, single-use token consumption.
- New token invalidates prior unconsumed same-purpose tokens.
- Registration verification email attempt.
- Resend verification with rate limits.
- Generic forgot-password response for existing/non-existing accounts.
- Password reset with the Stage B Argon2id policy.
- Invalidate all existing account sessions after reset.
- Native `/verify-email`, `/forgot-password`, `/reset-password` pages.
- Tests and full release verification.

## Defaults

```text
Email verification token: 24 hours
Password reset token:      30 minutes
Forgot-password request:    generic HTTP 200
Resend verification:        authenticated, throttled
```

## Deferred

Editable profile/email-change, avatar upload, MFA/recovery codes, session UI,
security activity UI, and account deactivation.
