# Authentication + Profile System — Phase 1 Architecture Audit

Date: 2026-08-23  
Repository: `/home/user/Discord-v1`  
Audited commit: `7d6a72f`  
Status: **Read-only architecture/design analysis complete; no account feature implemented**

## Executive decision

The project already has a security-hardened authentication system. It is not an
email/password account system; it is a Discord OAuth identity system backed by
server-side PostgreSQL sessions.

A second backend, database, Dashboard, or parallel session mechanism must **not**
be created. The correct architecture is to extend the existing Express +
PostgreSQL + `express-session` system into a unified internal account model that
can have multiple identities:

```text
Internal EB account
  ├─ optional local email/password credential
  └─ linked Discord identity (required for guild administration)
```

Discord remains authoritative for Discord user ID, guild membership, guild
permissions, and role hierarchy. EB account profile fields become authoritative
for the Dashboard display name, local username, verified email, custom avatar,
MFA, sessions, and security activity.

A local account that has not linked Discord may access its own profile/security
pages but must not access guild administration. Email matching must never
silently link a Discord identity; linking requires an authenticated,
state-protected Discord OAuth flow.

## 1. Repository and framework inventory

Previously completed whole-repository discovery was rechecked for the focused
authentication scope.

```text
Runtime:                 Node.js 22.12.x / CommonJS
Backend:                 Express 5.2.1
Frontend:                React 19.2.8 + Vite 8.2.2
Styling:                 Tailwind 3.4.19 + shared CSS utility classes
Database:                Supabase PostgreSQL through pg
Sessions:                express-session + custom PostgreSQL store
Current login provider:   Discord OAuth2
Realtime:                Socket.IO + SSE
Dashboard pages:          29
Reusable components:      11
Discord commands:         100
Audited HTTP routes:       159
Security suites:          22
```

There is no React Router. Dashboard navigation uses `window.location.hash`.
Express serves the same SPA for extensionless non-API paths.

## 2. Existing authentication — preserve and extend

### Existing Discord OAuth flow

Implemented in:

```text
backend/src/routes/auth.js
```

Published endpoints:

```text
GET  /api/auth/discord
GET  /api/auth/callback
GET  /api/auth/discord/callback
GET  /api/auth/status
GET  /api/auth/me
POST /api/auth/logout
GET  /api/me
```

Current flow:

```text
Dashboard
→ GET /api/auth/discord
→ 32-byte random OAuth state stored in session
→ Discord authorize (identify + guilds)
→ constant-time, single-use state verification
→ token exchange
→ Discord user + guild list retrieval
→ session ID regeneration
→ user and guild list stored server-side
→ Discord access token discarded
→ Dashboard #overview
```

Security already present:

- unpredictable OAuth state;
- constant-time comparison;
- single-use state;
- state stored server-side;
- fixed/configured redirect URI support;
- session regeneration after privilege change;
- no Discord access token persisted;
- OAuth error HTML escaping;
- fail-closed API authentication;
- PostgreSQL session persistence;
- HttpOnly, SameSite=Lax, Secure-in-production cookie;
- same-origin CSRF guard for unsafe requests;
- global and endpoint-specific rate limits;
- sanitized backend errors and request IDs;
- backend guild membership/permission/hierarchy authorization;
- Socket.IO and SSE session/guild checks.

### Current session identity shape

```js
req.session.user = {
  id,        // Discord snowflake; currently the identity key everywhere
  username,
  tag,
  avatar,
};
req.session.userGuilds = [...];
```

This is the most important migration constraint. Guild middleware, permissions,
Developer Control Center roles, logs, routes, sockets, and SSE currently assume
`session.user.id` is a Discord user ID.

A new internal UUID must not simply replace this field. The safe transitional
shape is:

```js
req.session.account = {
  id, displayName, username, email, avatarUrl, emailVerified, mfaEnabled,
};
req.session.user = {
  id, username, tag, avatar, // linked Discord identity; compatibility retained
};
req.session.userGuilds = [...];
```

Later call sites can migrate explicitly to `account.id` or `user.id` according
to whether account identity or Discord identity is intended.

## 3. What does not exist

No existing implementation was found for:

- local registration;
- email/username + password login;
- password hash storage;
- email verification;
- email delivery;
- forgot/reset password tokens;
- internal account/profile records;
- editable local username/display name/email;
- avatar upload/storage;
- TOTP enrollment/challenges;
- recovery codes;
- per-device session metadata/revocation;
- reauthentication grants;
- user-visible security activity;
- account deletion/deactivation;
- protected/public page routing at the SPA level.

No password hashing, TOTP, QR, mail, multipart upload, or Supabase Storage client
library is installed. No account tables exist.

## 4. Database baseline

Current schema:

```text
bot_kv
  key TEXT PRIMARY KEY
  value JSONB
  updated_at

dashboard_sessions
  sid TEXT PRIMARY KEY
  sess JSONB
  expires
```

RLS is enabled without browser policies. Only the backend connects through the
Supabase Session Pooler. This is a strong baseline and should remain unchanged.

The account system should use normalized PostgreSQL tables rather than placing
credentials/tokens inside `bot_kv` JSON values.

Recommended tables:

```text
accounts
account_identities
account_credentials
account_email_tokens
account_mfa_totp
account_recovery_codes
account_session_metadata
account_security_events
```

Recommended invariants:

- UUID account IDs generated server-side;
- unique indexes on normalized lower-case email and username;
- password hash nullable for Discord-only accounts;
- Discord provider ID globally unique;
- token values stored only as hashes;
- TOTP seed encrypted with authenticated encryption, not hashed (verification
  requires the seed);
- recovery codes stored as hashes and individually single-use;
- pending email stored separately until verified;
- soft-deactivation timestamp/status before destructive deletion policy;
- timestamps on security-sensitive state changes;
- no frontend/PostgREST policies exposing account tables.

## 5. Existing Dashboard architecture

### Routing

`dashboard/src/App.jsx` implements hash navigation:

```text
#home
#overview
#security       current guild AutoMod/security page
#settings       current guild/server settings page
...
```

There is no `/login` or account route layer. Unknown hashes fall back to
`#overview`. The application currently loads auth, user, guild, health, and
Developer identity state directly inside `App`.

Path-based account pages can coexist without renaming current guild pages:

```text
Public pathname routes
/login
/register
/forgot-password
/reset-password
/verify-email

Protected pathname routes
/profile
/settings
/settings/security
```

Existing guild pages remain hash routes such as `/#security` and `/#settings`.
A small first-party route resolver is sufficient; adding React Router is not
necessary unless route complexity proves otherwise.

### Current authentication UX

- Home page and Sidebar show “Login with Discord”.
- OAuth success/error uses a native Dashboard notification.
- When no guild is selected, the shell offers Discord login.
- Sidebar displays Discord username/tag/avatar and a sign-out action.
- There is no dedicated login/register/profile/account-security UI.
- Frontend route hiding is UX only; backend remains authoritative.

### Central state gap

`me` and `auth` are local state in `App.jsx` and passed into `Sidebar`. This is
not sufficient for profile editing across Navbar, Sidebar, profile, and settings.
The account work needs one `AuthProvider`/`AccountProvider` context that owns:

```text
initial session bootstrap
account profile
linked Discord identity
authenticated / pending-MFA / anonymous state
profile mutation + immediate cache update
logout/session revocation events
```

Guild permission state remains separate because it depends on the selected
Discord guild.

## 6. Dashboard design system — mandatory source of truth

### Typography

```text
Font: Outfit (local /fonts/outfit-400.woff2)
Fallback: ui-sans-serif, system-ui, Segoe UI
Body tracking: -0.011em
Headings tracking: -0.03em
```

### Core palette

```text
Page base:          #05070B
Dark panel:         #0B0E14
Darker panel:       #070A0F
Primary cyan:       #00FFFF / Tailwind cyan-300/400
Primary gradient:   #7DF9FF → #22d3ee
Primary text:       white / zinc-100
Secondary text:     zinc-400/500/600
Borders:            white at 5–10% opacity
Success:            emerald/green
Warning:            amber/yellow
Danger:             red
Secondary accents:  indigo/purple already present in Dashboard
```

No new account-specific palette is needed.

### Reusable CSS primitives

```text
cyber-card
cyber-card-hover
cyber-card-accent
cyber-button
cyber-button-solid
cyber-button-danger
cyber-button-success
cyber-icon-button
cyber-input
cyber-textarea
cyber-select
cyber-badge-*
cyber-tab / cyber-tab-active
seg-tabs / seg-tab / seg-tab-active
cyber-label
cyber-info
cyber-warning
skeleton
page-shell / page-shell-sm
glass-header
kbd
```

### Shape, spacing, and behavior

```text
Cards:       18px radius, translucent gradient, blur, subtle inner highlight
Inputs:      rounded-xl, white/4 background, white/9 border
Focus:       cyan border + 3px cyan translucent ring
Buttons:     rounded-xl; cyan gradient primary; active scale feedback
Header:      translucent #070A0F, 18px blur
Pages:       p-5 / sm:p-6, max-width 4xl or 6xl
Motion:      fade, slide, scale, shimmer; reduced-motion respected
Responsive:  Tailwind mobile-first; primary breakpoints sm/md/lg
RTL:         document direction managed by i18n; Sidebar mirrors correctly
Theme:       dark only; no light-theme implementation exists
Icons:       lucide-react
```

Authentication pages must compose these classes and existing logo/assets. No
external template, font, color system, or component kit is appropriate.

## 7. Reusable components

Direct reuse:

```text
ToastProvider/useToast       operation success/error feedback
ConfirmModal                 destructive/session/MFA confirmation
PageHeader                   profile/settings headings
CopyButton                   recovery-code copy actions
EmptyState                   no sessions/activity states
CyanToggle                   non-sensitive preference switches only
Sidebar                      account menu/profile entry integration
```

Adapt rather than duplicate:

```text
MemberProfile avatar presentation patterns
PageLoading skeleton patterns
OAuthNotice alert styling
Home authentication CTA styling
Developer password input styling
seg-tabs used by settings/security sections
```

Missing primitives that may be added once and shared:

```text
AuthLayout
FormField
PasswordField
PasswordStrength
AccountAvatar
StatusBadge (if existing badges are insufficient)
ReauthModal
```

These must be generic account components, not page-specific copies.

## 8. Backend architecture recommendation

### Route ownership

Extend the existing backend only:

```text
backend/src/routes/auth.js          existing OAuth/status/logout compatibility
backend/src/routes/account-auth.js local credential/recovery/MFA challenges
backend/src/routes/account.js      protected profile/settings/session activity
backend/src/middleware/account-auth.js
backend/src/services/accounts.js
backend/src/services/account-tokens.js
backend/src/services/account-mail.js
backend/src/services/account-mfa.js
backend/src/services/account-audit.js
```

`auth.js` is already large enough that adding all flows directly would recreate
the guild-router hotspot. New domain routers should mount below existing
namespaces without duplicating endpoints.

Suggested API surface:

```text
Public / challenge-scoped
POST /api/auth/register
POST /api/auth/login
POST /api/auth/mfa/verify
POST /api/auth/recovery-code/verify
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/verify-email
POST /api/auth/resend-verification
GET  /api/auth/status                 existing, extended compatibly
GET  /api/auth/discord                existing
GET  /api/auth/discord/callback       existing
POST /api/auth/logout                 existing

Account-authenticated
GET    /api/account
PATCH  /api/account/profile
POST   /api/account/avatar
DELETE /api/account/avatar
POST   /api/account/email/change
POST   /api/account/password/change
POST   /api/account/reauthenticate
GET    /api/account/sessions
DELETE /api/account/sessions/:id
POST   /api/account/sessions/revoke-others
POST   /api/account/sessions/revoke-all
GET    /api/account/activity
POST   /api/account/mfa/enroll
POST   /api/account/mfa/confirm
POST   /api/account/mfa/disable
POST   /api/account/recovery-codes/regenerate
POST   /api/account/delete-request
```

Exact naming should be fixed in a route manifest before implementation.

### Authentication state machine

```text
ANONYMOUS
  ├─ local credentials valid + no MFA → regenerate session → AUTHENTICATED
  ├─ local credentials valid + MFA    → MFA_PENDING (short-lived)
  │                                      ├─ TOTP/recovery valid
  │                                      → regenerate session → AUTHENTICATED
  │                                      └─ expiry/attempt cap → ANONYMOUS
  └─ Discord OAuth valid
       ├─ linked identity → account session
       └─ new identity → provision/link policy
```

`MFA_PENDING` must not contain the normal authenticated account/user fields and
must not pass protected middleware.

### Discord authorization preservation

Account authentication and Discord guild authorization are different layers:

```text
Account session
→ linked Discord identity present
→ Discord guild list/session refresh
→ bot guild membership
→ dashboard permission
→ Discord role hierarchy
→ guild action
```

No local username, verified email, or MFA status can grant Discord guild access.

## 9. Password and token policy

Recommended password policy based on current NIST/OWASP guidance:

- minimum 15 characters when password is the only factor;
- allow at least 64 characters and Unicode/whitespace;
- no mandatory upper/lower/digit/symbol composition rules;
- do not silently truncate;
- block known-compromised/common passwords;
- allow password-manager paste/autofill;
- no periodic forced rotation absent compromise;
- hash with Argon2id (minimum 19 MiB, iterations 2, parallelism 1), with an
  implementation benchmark under Render resource constraints;
- never log password inputs or hashes.

Token policy:

- 32 random bytes minimum;
- encode URL-safe;
- store only SHA-256/HMAC hash;
- bind to account + purpose;
- short expiry;
- single-use atomic consumption;
- invalidate previous same-purpose tokens when issuing a new one;
- construct links only from configured `DASHBOARD_URL`, never arbitrary Host;
- generic forgot-password/register responses to prevent account enumeration.

## 10. MFA and recovery policy

TOTP is compatible with the requested flow but is not phishing-resistant. It
can be the initial factor, while WebAuthn/passkeys should remain a documented
future higher-assurance option.

Required TOTP controls:

- enrollment starts only after recent reauthentication;
- random seed encrypted at rest with AES-256-GCM;
- encryption key is an independent Render secret;
- show QR/seed only during pending enrollment;
- do not mark enabled until a valid first code is verified;
- accept a small time window and prevent replay of an already accepted time
  step where practical;
- cap attempts and expire login/enrollment challenges;
- disabling/replacing MFA requires password + current MFA/recovery factor;
- security event and out-of-band notification on factor changes.

Recovery codes:

- cryptographically random;
- displayed once;
- individually hashed and single-use;
- regenerated only after recent reauthentication + MFA;
- regeneration atomically invalidates old codes;
- never returned by normal profile/security APIs.

## 11. Session model changes

The existing session ID regeneration and cookie flags are reusable. Missing
features require metadata beyond the current `sid/sess/expires` table.

Recommended session policy:

```text
Cookie:             HttpOnly, Secure in production, SameSite=Lax, Path=/
Idle timeout:       30 minutes for normal accounts
Absolute lifetime:  24 hours for MFA/admin-sensitive sessions
Remember me:        explicit longer policy only if approved; never an unlimited session
Reauthentication:   short-lived server-side grant (e.g. 5–10 minutes)
```

Session metadata should include account ID, created/last-seen timestamps,
absolute expiry, revoked time/reason, coarse device label, and only the minimum
IP metadata needed for security. Do not implement invasive fingerprinting or
new geolocation collection merely for display.

Password/email/MFA changes should revoke other sessions by default or present a
clear choice where policy allows. Logout should destroy the server session,
clear `eb.sid`, and return `Clear-Site-Data` for cache/cookies/storage where safe.

## 12. Avatar storage decision

The current architecture has no upload route or object-storage client. Render's
filesystem is ephemeral and must not store account avatars.

Recommended target: a private/controlled Supabase Storage bucket with server-side
upload authorization.

Required pipeline:

```text
2 MB request cap specific to avatar endpoint
→ allow JPEG/PNG/WebP only
→ inspect magic bytes, not extension or Content-Type alone
→ decode and re-encode image to strip ancillary payloads
→ enforce pixel/dimension limits
→ generate server-side object name
→ upload outside Dashboard webroot
→ store object key/version in account record
→ serve with correct image MIME and cache policy
```

The existing `@napi-rs/canvas` may be reusable for decode/re-encode after a
compatibility test. Storage provider configuration is still required.

## 13. Email delivery decision

Email verification, password reset, email-change confirmation, and security
notifications cannot be honestly implemented without an outbound email
provider and verified sender/domain.

The mail service should be abstracted behind one backend module. A provider must
be selected before implementation. An HTTP provider can reuse existing Axios;
SMTP would require a reviewed mail dependency.

Required configured values (names finalized after provider selection):

```text
EMAIL_PROVIDER
EMAIL_FROM
provider credential (Render secret)
DASHBOARD_URL
```

Development/CI must use a capture/fake transport and never send real email.

## 14. Security activity model

Store bounded account security events in PostgreSQL, not ephemeral Render logs:

```text
login_success
login_failure (careful visibility/rate limits)
email_verification_sent/completed
password_reset_requested/completed
password_changed
email_change_requested/completed
mfa_enabled/disabled
recovery_codes_regenerated/used
session_created/revoked
account_recovery
account_deactivated
```

Display only timestamp, event, coarse device/browser label, and optional coarse
network metadata already justified by security operations. Never display tokens,
password data, TOTP seeds, recovery codes, session IDs, raw errors, or precise
location collected solely for UI.

## 15. Profile field semantics

The application cannot safely pretend that editing an EB profile changes the
user's global Discord account.

Recommended source-of-truth rules:

```text
EB display name:  editable; used in Dashboard account UI/audit display
EB username:      editable, unique, normalized; local sign-in identifier
Verified email:   sensitive, pending-change verification flow
EB avatar:        custom upload or fallback to linked Discord avatar
Discord username: read-only linked identity metadata
Discord ID:       immutable authorization identity
Discord guilds:   always fetched/validated from Discord context
```

Sidebar/Navbar/Profile should consume the centralized account context, falling
back to linked Discord values for Discord-only accounts.

## 16. Routing and protection plan

### Public UI

```text
/login
/register
/forgot-password
/reset-password?token=...
/verify-email?token=...
```

### Account protected UI

```text
/profile
/settings
/settings/security
```

### Existing guild Dashboard

```text
/#overview
/#security  (guild AutoMod/security; unchanged)
/#settings  (guild/server settings; unchanged)
```

Frontend redirects provide UX only. Every account API uses account middleware;
every guild API still uses the Discord/guild authorization chain. An
expired/revoked session must receive a safe `401` code that the centralized auth
provider converts into a login redirect while preserving a same-origin safe
return path.

## 17. Name/username/email mutation behavior

All successful profile mutations return the complete safe account projection.
The centralized account provider replaces its state immediately. Sidebar,
Navbar, Profile, and account menu read that same object; no manual reload and no
duplicated profile caches.

Username controls:

- Unicode policy must be explicitly selected; conservative initial policy is
  normalized ASCII letters/digits/underscore, 3–24 characters;
- case-insensitive uniqueness;
- reserved-name blocklist (`admin`, `support`, `system`, `discord`, `ebbot`,
  route names, etc.);
- change cooldown/rate limit;
- no username-based authorization or object lookup without account ID.

Email controls:

- current credential reauthentication;
- MFA if enabled;
- pending email record/token;
- update only after new address verification;
- notify old address when provider support is configured;
- generic responses that do not enumerate accounts.

## 18. Existing risks/gaps to address during implementation

1. **Identity ambiguity:** `session.user.id` means Discord ID everywhere; an
   internal account ID cannot replace it without breaking guild isolation.
2. **No email provider:** verification/recovery cannot be tested end-to-end
   until one is selected and configured.
3. **No avatar storage:** Render disk is unsuitable.
4. **No account encryption key:** TOTP seeds require an independent key and
   rotation strategy.
5. **Session lifetime:** current cookie max age is 24 hours but there is no
   explicit idle vs absolute timeout or individual revocation UI.
6. **No centralized account state:** App-local `me` state would produce stale
   Navbar/Sidebar data after edits.
7. **Route name collision:** current `#security` and `#settings` are guild pages;
   pathname account routes prevent collision.
8. **Discord data staleness:** user guilds are captured at OAuth login; sensitive
   guild actions still validate against live bot membership/hierarchy, but a
   refresh/link policy should be explicit.
9. **Rate limits are process-local:** authentication limits need database-backed
   or external coordination before multi-instance login deployment.
10. **Account audit must be persistent:** existing Developer Audit file fallback
    is ephemeral on Render and is not the user account activity store.
11. **MFA recovery is high risk:** support-based recovery policy must be defined
    before enabling MFA for production accounts.
12. **Account deletion policy absent:** data retention/anonymization for Discord
    moderation records must be defined; those records cannot simply be erased if
    needed for guild safety/audit obligations.

## 19. Files expected to be affected

Existing files likely modified:

```text
backend/src/server.js
backend/src/routes/auth.js
backend/src/middleware/auth.js
backend/src/session-store.js
database/index.js
supabase/schema.sql
.env.example
render.yaml
package.json
package-lock.json
dashboard/src/App.jsx
dashboard/src/api.js
dashboard/src/components/Sidebar.jsx
dashboard/src/i18n.jsx
dashboard/src/nav.js
README.md
```

New focused backend files likely required:

```text
backend/src/routes/account-auth.js
backend/src/routes/account.js
backend/src/middleware/account-auth.js
shared/services/accounts.js
shared/services/account-mail.js
shared/services/account-mfa.js
shared/services/account-audit.js
shared/services/account-tokens.js
```

New shared Dashboard files likely required:

```text
dashboard/src/auth/AuthContext.jsx
dashboard/src/auth/AuthLayout.jsx
dashboard/src/auth/FormField.jsx
dashboard/src/auth/PasswordField.jsx
dashboard/src/auth/PasswordStrength.jsx
dashboard/src/pages/Login.jsx
dashboard/src/pages/Register.jsx
dashboard/src/pages/ForgotPassword.jsx
dashboard/src/pages/ResetPassword.jsx
dashboard/src/pages/VerifyEmail.jsx
dashboard/src/pages/Profile.jsx
dashboard/src/pages/AccountSettings.jsx
dashboard/src/pages/AccountSecurity.jsx
```

Every production module requires focused unit/security tests before entering the
main verification gate.

## 20. Incremental implementation order

The requested system is too security-sensitive for one broad commit. The safe
implementation plan preserves the mandatory order while keeping each stage
reviewable:

### Stage A — account foundation

- route manifest and schema migration;
- internal account + Discord identity model;
- centralized frontend auth/account state;
- compatibility migration for Discord OAuth sessions;
- profile read-only projection;
- tests and full verification.

### Stage B — local credentials and public auth UI

- password hashing and policy;
- register/login;
- login MFA-pending state (MFA not yet enrollable);
- public route shell using Dashboard design;
- database-backed authentication rate limits;
- tests and full verification.

### Stage C — email verification and password recovery

- selected mail provider abstraction;
- verification/reset tokens;
- resend and enumeration protections;
- email verification/reset pages;
- session invalidation policy;
- tests and full verification.

### Stage D — editable profile and avatar

- display name/username updates;
- pending email-change flow;
- selected Supabase Storage avatar pipeline;
- centralized immediate UI refresh;
- tests and responsive checks.

### Stage E — MFA and recovery codes

- encrypted pending TOTP enrollment;
- QR/first-code confirmation;
- MFA login challenge;
- hashed single-use recovery codes;
- strong factor management/disable policy;
- tests and full verification.

### Stage F — sessions, reauthentication, activity, deletion

- idle/absolute session policy;
- session/device listing and revocation;
- reauthentication grants;
- persistent user security events;
- defined account deactivation/deletion policy;
- tests and full audit.

### Stage G — final integration and responsive/security audit

- 320, 375, 390, 414, 768, 1024, and 1440+ widths;
- English/Arabic and RTL;
- route and authorization matrix;
- complete login/register/MFA/recovery/session test matrix;
- dependency audits and production build;
- live degraded/strict acceptance extension.

No later stage should begin until the previous stage's report and full
verification pass.

## 21. Guidance applied

Architecture decisions above apply, rather than copy, current guidance:

- OWASP recommends Argon2id password hashing and gives a minimum 19 MiB / 2
  iteration / 1 parallelism configuration.
- OWASP/NIST emphasize password length and breached-password screening rather
  than composition rules.
- OWASP requires generic password-reset responses, configured/trusted reset
  origins, time-limited single-use tokens, and considered session invalidation.
- OWASP session guidance requires ID renewal after privilege changes, server-side
  expiration/invalidation, secure cookie attributes, and session lifecycle
  logging.
- OWASP MFA guidance requires existing-factor reauthentication for factor
  changes and treats recovery as a high-risk flow.
- NIST SP 800-63B recognizes TOTP as replay-resistant when codes are accepted
  once but not phishing-resistant; phishing-resistant authentication should be
  available for higher assurance.
- OWASP upload guidance requires size/type/signature checks, server filenames,
  storage outside the webroot, and image decode/re-encode.

### Reference links

```text
https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
https://pages.nist.gov/800-63-4/sp800-63b.html
```

## 22. Decisions required before Stage A/B

Implementation cannot safely guess these product/provider choices:

1. **Account model:** approve internal EB accounts with mandatory Discord linking
   before guild Dashboard access.
2. **Registration policy:** public self-registration, invite-only, or Discord
   auto-provision plus optional password.
3. **Email provider:** Resend/HTTP, SMTP, or another existing provider.
4. **Avatar storage:** approve Supabase Storage and identify the bucket policy.
5. **Username policy:** approve ASCII 3–24 + underscore or specify Unicode rules.
6. **Password minimum:** recommended 15 characters unless MFA is already enabled.
7. **Session policy:** approve 30-minute idle / 24-hour absolute lifetime and
   whether “Remember me” is required.
8. **Account deletion:** immediate delete, delayed deactivation, and retention
   requirements for moderation/audit records.
9. **Terms/privacy URLs:** required if public registration is enabled.
10. **MFA scope:** optional for all users and mandatory for system roles is the
    recommended baseline.

## Phase 1 conclusion

The Dashboard design and backend security foundation are reusable. The project
is not missing authentication entirely; it is missing an internal account layer
on top of an already authoritative Discord OAuth/session system. Implementing a
parallel auth stack or replacing Discord identity would risk cross-guild
isolation and Developer role enforcement.

No authentication/profile production code, schema, dependency, route, or UI was
changed during this phase. Implementation should begin only after the account,
email, avatar-storage, session, and deletion decisions above are approved.
