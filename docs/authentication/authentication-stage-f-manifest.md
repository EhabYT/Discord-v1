# Authentication Stage F — Pre-Change Manifest

Date: 2026-08-23  
Status: **Approved as part of complete remaining implementation**

## Scope

- 30-minute idle session timeout and 24-hour absolute account lifetime.
- Persist safe session/device metadata linked to server sessions.
- List current/other sessions; revoke one, others, or all.
- Change password with current-password verification and optional other-session revocation.
- Ten-minute recent-reauthentication grants using password + MFA when enabled.
- Persistent, user-visible account security activity.
- Delayed account deactivation with typed confirmation and recent reauth.
- Clear browser account state on logout/revocation.
- Native Account Security integration.

## Privacy

Device labels use a clipped User-Agent only. No new geolocation, invasive device
fingerprint, raw password/token, precise location, or raw session ID is exposed.

## Invariants

Guild authorization remains Discord-only. Session controls operate only on the
current internal account and use public UUID handles rather than raw session IDs.
