# Authentication Stage D — Pre-Change Manifest

Date: 2026-08-23  
Status: **Approved; captured before profile/avatar changes**

## Scope

- Edit EB display name and unique local username.
- Username validation, reserved names, and change throttling.
- Immediate centralized Profile/Sidebar state refresh.
- Sensitive pending email change requiring current password.
- Verify new email before replacing current email.
- Notify old email after successful change when Resend is configured.
- Supabase Storage avatar upload/replace/remove.
- Multipart limit 2 MiB.
- Magic/decode validation and server-side image re-encode.
- Dimension/resource bounds and server-generated object names.
- Backend authorization and focused tests.

## Storage configuration

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_AVATAR_BUCKET
```

Previously exposed Supabase keys must not be reused.

## Deferred

MFA, recovery codes, session/device UI, activity UI, and account deactivation.
