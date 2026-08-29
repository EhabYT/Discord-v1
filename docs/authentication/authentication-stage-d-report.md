# Authentication Stage D — Editable Profile and Avatar Storage

Date: 2026-08-23  
Status: **Implemented and verified**

## Profile updates

`PATCH /api/account/profile` updates EB display name and local username, returns
the complete safe account projection, refreshes the server session, and updates
the centralized React account state immediately. Sidebar and Profile therefore
change without a reload.

Username rules remain ASCII 3–24, case-insensitive unique, reserved-name
protected, and limited to one username change every 30 days. Profile mutations
are additionally rate limited.

## Sensitive email change

`POST /api/account/email/change` requires the current password. The requested
address is stored only on the hashed, expiring verification-token row and does
not replace the current email until the new address consumes the single-use
link. Successful replacement logs `email_changed`, updates centralized state,
and attempts a Resend notification to the old address.

## Avatar pipeline

```text
POST   /api/account/avatar
DELETE /api/account/avatar
```

Controls:

- authenticated account only;
- multipart parser `multer` 2.2.0 (zero known audit vulnerabilities);
- one file, 2 MiB maximum;
- PNG/JPEG/WebP client allowlist;
- authoritative server decode with `@napi-rs/canvas`;
- maximum dimensions/pixels;
- center square crop and re-encode to a fresh 512×512 PNG;
- server-generated UUID object name;
- Supabase Storage over HTTPS with service-role authorization;
- storage key remains backend-only;
- old objects removed best-effort after atomic profile replacement;
- upload frequency limit.

Required Render values:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_AVATAR_BUCKET=avatars
```

The avatar bucket must be configured for intended public avatar reads. Previously
exposed Supabase credentials must not be reused.

## Dashboard

The existing `/profile` page now includes:

- image preview before upload;
- upload/replace/remove controls;
- display-name and username form;
- current email plus password-reauthenticated pending change form;
- immediate Toast feedback;
- linked Discord identity remains visibly read-only.

All controls reuse existing cyber inputs/cards/buttons, Outfit, cyan focus,
responsive `page-shell-sm`, and Dashboard Toast/PasswordField components.

## Verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                     9 PASS
Security suites:                22 PASS
Discord commands:                   100
Audited HTTP routes:                 170
Guild routes:                        105
Root vulnerabilities:                 0
Dashboard vulnerabilities:            0
Dashboard modules transformed:      1,815
Dashboard build:                    PASS
Main JS:                         263.08 kB / 82.70 kB gzip
Profile lazy chunk:                8.69 kB / 2.73 kB gzip
```

## External acceptance limitation

Real avatar persistence requires a configured Supabase Storage bucket and a
newly rotated service-role key entered directly in Render. Tests validate image
decode/re-encode and configuration constraints without contacting production
storage.

MFA, recovery codes, session/device management, activity UI, and account
deactivation remain deferred.
