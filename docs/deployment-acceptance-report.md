# Deployment/Live Acceptance Preparation — Completion Report

Date: 2026-08-23  
Status: **Tooling and runbook complete; live deployment not accepted**

## Delivered

### Automated live smoke tool

```text
scripts/live-smoke.js
npm run smoke:live
```

Capabilities:

- waits for a sleeping Render service to produce real JSON liveness;
- supports strict and `--allow-degraded` modes;
- validates `/api/health`, `/api/v2/status`, `/api/v2/ready`, and
  `/api/auth/status`;
- validates the expected V2 release;
- validates strict Dashboard/database/Discord/OAuth/bot readiness;
- validates Dashboard HTML plus same-origin JS and CSS assets;
- validates CSP, HSTS, frame, MIME, referrer, and permissions headers;
- validates unknown API routes return JSON 404;
- validates HTTP redirects to HTTPS;
- detects secret-like values in public response bodies;
- writes mode-`0600` sanitized JSON reports containing no raw bodies, cookies,
  authorization headers, or environment values.

### Regression suite

```text
tests/security/live-smoke.test.js
```

Coverage proves that the tool:

- accepts a strict-ready fixture;
- accepts degraded state only in explicit preflight mode;
- rejects missing V2 routes;
- rejects missing security headers;
- rejects cross-origin assets;
- rejects release mismatches;
- rejects secret-like public responses without retaining the secret in its
  report.

The repository now has:

```text
4 unit suites
22 security suites
```

### Operator runbook

```text
docs/deployment-live-runbook.md
```

It covers:

- provider-side credential rotation;
- Supabase Session Pooler URI requirements;
- Discord OAuth redirect configuration;
- Render environment contract;
- local and GitHub pre-deployment gates;
- exact Render deployment observations;
- degraded preflight and strict acceptance commands;
- manual OAuth, permissions, bot, realtime, and maintenance checks;
- controlled slash-command deployment;
- rollback criteria and procedure;
- 30-minute post-deployment monitoring.

### Sanitized current-live report

```text
docs/live-preflight-2026-08-23.json
```

## Current Render result

Command:

```bash
npm run smoke:live -- \
  --url https://discord-v1-jrip.onrender.com \
  --allow-degraded \
  --expect-release 2.0.0 \
  --wake-timeout 180000 \
  --json docs/live-preflight-2026-08-23.json
```

Result:

```text
Passed: 18
Failed: 15
Exit:   1 (expected for the stale deployment)
```

Confirmed working:

- liveness HTTP 200;
- public health is secret-free;
- OAuth redirect origin matches Render;
- Dashboard HTML loads;
- current live JS and CSS assets load from the same origin;
- unknown API routes return JSON 404;
- HTTP redirects to HTTPS.

Blocking failures:

- `/api/v2/status` returns 404;
- `/api/v2/ready` returns 404;
- expected V2 release cannot be observed;
- current full security-header contract is absent;
- separate public observation showed bot offline, database unreachable, and
  OAuth disabled.

Conclusion:

```text
The public URL is alive but is not the current repository revision and is not
eligible for strict production acceptance.
```

## Repository verification

Command:

```bash
npm run verify
```

Result:

```text
Exit code:                          0
Release configuration:          PASS
ESLint errors:                      0
ESLint warnings:                    0
Unit suites:                   4 PASS
Security suites:              22 PASS
Discord commands:                 100
Audited HTTP routes:               159
Guild HTTP routes:                 105
Root production vulnerabilities:    0
Dashboard production vulns:          0
Dashboard modules transformed:    1,806
Dashboard build:                  PASS
Build duration:                    1.56 s
Main JS bundle:                259.55 kB (81.65 kB gzip)
Main CSS bundle:                66.06 kB (12.49 kB gzip)
```

README deployment commands and the security-suite count were updated.

## Preview-discovered static header fix

The first local live-smoke run exposed a middleware-ordering defect that the API
header test did not cover: `express.static` was mounted before the security
header middleware, so successful Dashboard HTML/JS/CSS responses ended before
CSP, frame, MIME, referrer, and permissions headers were applied.

The header middleware now runs before static delivery. A regression assertion
in `tests/security/auth.test.js` independently checks the static Dashboard, and
the local degraded deployment preflight now reports:

```text
Passed: 30
Failed:  0
```

The complete release gate passed again with zero lint findings and zero
vulnerabilities. No endpoint, command, database format, authorization decision,
or frontend feature behavior changed; static responses now receive the intended
security policy.

## Required external next actions

1. Push the prepared commits to GitHub.
2. Wait for the SHA-pinned `Verify` workflow to pass.
3. Revoke and replace every previously exposed credential at its provider.
4. Configure newly rotated values directly in Render.
5. Deploy the exact verified commit.
6. Run `--allow-degraded` preflight; it must have zero failures.
7. Wait for Discord and PostgreSQL bootstrap.
8. Run strict smoke acceptance; it must have zero failures.
9. Complete the manual checks in the runbook.
10. Monitor and rerun strict acceptance after 5 and 30 minutes.

No live deployment was triggered because this environment has neither GitHub
push/Render account authorization nor safely supplied rotated provider
credentials.
