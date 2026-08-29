# Authentication Stage A — Account Foundation Report

Date: 2026-08-23  
Status: **Implemented and verified**

## Delivered

- Normalized PostgreSQL account, provider identity, security event, and session
  metadata schema with RLS enabled.
- Transactional, advisory-locked Discord identity provisioning.
- Internal UUID account identity without replacing the Discord snowflake used
  by guild authorization.
- Existing Discord OAuth sessions now receive a safe `session.account`
  projection after login.
- Existing sessions are lazily upgraded through `GET /api/account`.
- Read-only protected account API projection; no credential or token fields.
- Central React `AuthProvider` as the single account/display-user source.
- Native read-only `/profile` page using Outfit, cyber cards/inputs/badges,
  current responsive spacing, and existing Sidebar.
- Profile entry integrated into the existing Sidebar account block.
- Existing guild `#security` and `#settings` pages remain unchanged.

## Database tables

```text
accounts
account_identities
account_security_events
account_session_metadata
```

Case-insensitive unique email/username indexes are present. Discord provider IDs
are globally unique. Provisioning uses a dedicated transaction plus
`pg_advisory_xact_lock` to prevent duplicate accounts across instances.

## Identity invariant

```text
req.session.account.id  → internal EB UUID
req.session.user.id     → Discord snowflake
```

Every existing guild, hierarchy, system-role, Socket.IO, and SSE path continues
to consume the Discord identity. An internal account ID cannot grant Discord
guild access.

## API change

```text
GET /api/account  (authenticated, read-only)
```

The complete audited API inventory increased intentionally from 159 to 160.
Anonymous access is covered by the audit sweep and remains denied.

## Tests

Added `tests/unit/accounts.test.js`, covering:

- username normalization;
- UUID account creation;
- one account per Discord identity;
- identity metadata refresh;
- avatar fallback projection;
- persistent provisioning event;
- transaction client release;
- schema/RLS presence.

The full security audit discovers and gates the new route.

## Verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                     5 PASS
Security suites:                22 PASS
Discord commands:                   100
Audited HTTP routes:                 160
Guild HTTP routes:                   105
Root vulnerabilities:                 0
Dashboard vulnerabilities:            0
Dashboard modules transformed:      1,808
Dashboard build:                    PASS
Main JS bundle:                  261.25 kB / 82.15 kB gzip
Profile lazy chunk:                4.54 kB / 1.58 kB gzip
```

## Deferred exactly as planned

- local password credentials and public registration;
- Resend email verification/recovery;
- editable profile fields;
- Supabase Storage avatar upload;
- MFA and recovery codes;
- device/session revocation and activity UI;
- account deactivation.

Stage B should not begin without explicit approval.
