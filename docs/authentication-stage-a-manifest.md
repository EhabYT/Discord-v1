# Authentication Stage A — Pre-Change Manifest

Date: 2026-08-23  
Status: **Approved foundation scope; captured before production changes**

## Approved decisions

- Public local registration in Stage B.
- Discord linking required before guild administration.
- Resend for verification/recovery mail in Stage C.
- Supabase Storage for validated avatars in Stage D.
- 15-character password minimum.
- Username: ASCII letters/digits/underscore, 3–24 characters.
- Sessions: 30-minute idle and 24-hour absolute lifetime.
- MFA optional for normal users and mandatory for system roles.
- Delayed account deactivation.

## Stage A scope

1. Add normalized `accounts`, `account_identities`, persistent security-event,
   and account-session metadata tables.
2. Preserve `req.session.user.id` as the Discord snowflake for every existing
   guild/system authorization path.
3. Add `req.session.account` as the internal account projection.
4. Provision/link an internal account after successful Discord OAuth without
   storing the Discord access token.
5. Add a protected, read-only `/api/account` projection.
6. Add a centralized React account/auth context.
7. Add a read-only `/profile` page using existing Dashboard classes/components.
8. Add a Profile entry to the existing Sidebar without renaming guild
   `#security` or `#settings` pages.
9. Preserve all existing response fields and routes.
10. Add schema, identity-linking, compatibility, authorization, and UI tests.

## Explicitly out of scope

- password hashes and local login;
- registration UI;
- email sending/tokens;
- password recovery;
- editable fields;
- avatar upload;
- MFA/recovery codes;
- session revocation UI;
- account deletion.

## Invariants

```text
Discord commands:              100
Existing HTTP routes:          159
Existing guild routes:         105
Guild authorization identity:  Discord snowflake
Account authorization identity: internal UUID
Dashboard design:              unchanged
```

A local/internal account ID must never be accepted by guild authorization in
place of a linked Discord ID.
