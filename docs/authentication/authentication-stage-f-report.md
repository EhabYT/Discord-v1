# Authentication Stage F — Sessions, Activity, Reauthentication, Deactivation

Date: 2026-08-23  
Status: **Implemented and verified**

## Session policy

```text
Idle timeout:       30 minutes (rolling server cookie)
Absolute lifetime:  24 hours
Recent reauth:      10 minutes
```

Account sessions carry server-side lifecycle metadata. PostgreSQL stores a
public UUID handle, account ID, created/last-active/absolute-expiry timestamps,
and a clipped User-Agent device label. Raw session IDs, IP geolocation, and
fingerprints are not exposed.

## Session APIs

```text
GET    /api/account/sessions
DELETE /api/account/sessions/:id
POST   /api/account/sessions/revoke-others
POST   /api/account/sessions/revoke-all
```

Current, individual, other, and all sessions can be revoked. Logout and
self-revocation clear the cookie; logout/all/deactivation also return
`Clear-Site-Data` where appropriate.

## Password and reauthentication

```text
POST /api/account/password/change
POST /api/account/reauthenticate
```

Password change requires current password and, when enabled, a current MFA or
recovery factor. It uses the existing Argon2id policy and revokes other sessions
by default. Recent reauthentication requires both factors where applicable and
creates a server-only ten-minute grant.

MFA enable, disable, and recovery-code regeneration now revoke other sessions.

## Security activity

```text
GET /api/account/activity
```

Persistent PostgreSQL events include registration, successful login method,
email verification/change, password changes/resets, MFA changes, recovery-code
regeneration, session revocation, reauthentication, and deactivation. UI shows
only safe event name/time metadata.

## Deactivation

```text
POST /api/account/deactivate
```

Requires recent reauthentication plus exact `DELETE` confirmation. It marks the
account `deactivated`, retains audit/moderation records, revokes every session,
and clears browser state. It is deliberately not one-click hard deletion.

## Dashboard

`/settings/security` now includes change password, active sessions, individual
and bulk logout, persistent activity, recent reauthentication, and Danger Zone
controls using the same Dashboard design system.

## Verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                    12 PASS
Security suites:                22 PASS
Discord commands:                   100
Audited HTTP routes:                 183
Guild routes:                        105
Root vulnerabilities:                 0
Dashboard vulnerabilities:            0
Dashboard modules transformed:      1,816
Dashboard build:                    PASS
Main JS:                         263.60 kB / 82.85 kB gzip
Account Security chunk:           12.81 kB / 3.48 kB gzip
```
