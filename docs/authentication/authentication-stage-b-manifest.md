# Authentication Stage B — Pre-Change Manifest

Date: 2026-08-23  
Status: **Approved; captured before credential/UI changes**

## Scope

- Argon2id password hashing (19 MiB, t=2, p=1 minimum).
- Public registration with display name, username, email, password confirmation.
- Email/username login.
- Generic duplicate/credential errors where enumeration is relevant.
- Database-coordinated registration/login rate limits.
- Session regeneration after successful local authentication.
- Local sessions contain `session.account` but no fabricated Discord identity.
- Guild APIs remain unavailable until Discord is linked.
- Native `/login` and `/register` pages using existing Dashboard design tokens.
- Central AuthProvider refresh and authenticated/public route redirects.
- Password visibility and strength feedback.
- Focused tests plus full release verification.

## Deferred

- email delivery and verification token consumption;
- forgot/reset password;
- editable profile/avatar;
- MFA/recovery codes;
- device/session management and deletion.

## Invariants

- Passwords and hashes never enter logs, sessions, frontend responses, or audit
  metadata.
- Registration sets `emailVerified=false`.
- Existing Discord OAuth and all 100 commands remain unchanged.
- Internal accounts cannot pass Discord guild authorization.
