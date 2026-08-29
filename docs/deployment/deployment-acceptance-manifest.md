# Deployment/Live Acceptance — Pre-Change Manifest

Date: 2026-08-23  
Status: **Baseline captured before acceptance-tooling changes**

## Scope

This workstream prepares a reproducible, credential-free deployment and live
acceptance procedure. It does not push Git commits, trigger Render, alter
secrets, deploy Discord commands, or modify production runtime behavior.

## Deployment target

```text
https://discord-v1-jrip.onrender.com
```

Expected production contract from the current repository:

```text
GET /api/health      → 200 liveness
GET /api/v2/status   → 200, status ready or degraded
GET /api/v2/ready    → 200 only when fully ready; otherwise 503
GET /api/auth/status → 200, secret-free OAuth/database state
GET /                → 200 Dashboard HTML and loadable local assets
```

Expected V2 release:

```text
2.0.0
```

Strict readiness requires:

```text
dashboardBuilt:    true
databaseOnline:    true
discordConfigured: true
botOnline:         true
```

OAuth acceptance additionally expects:

```text
oauthConfigured: true
oauthEnabled:    true
```

## Public live observation

The Render free instance initially returned Render's “Application loading” page
while waking. A direct liveness request completed after approximately 15.8
seconds and returned:

```text
HTTP 200
ok:          true
botOnline:   false
maintenance: false
```

After wake-up:

```text
GET /api/health       200 JSON
GET /api/v2/status    404 Unknown API route
GET /api/v2/ready     404 Unknown API route
GET /api/auth/status  200, oauthEnabled=false, databaseOnline=false
GET /                 200 Dashboard HTML
```

The live Dashboard referenced asset hashes different from the current local
verified build. The public deployment therefore does not contain the current V2
repository revision and is not release-ready.

Observed production gaps:

1. current V2 status/readiness routes are absent;
2. Discord is offline;
3. Supabase PostgreSQL is unreachable;
4. OAuth is disabled as a consequence;
5. the live response does not yet expose the current repository's full security
   header set;
6. the Render service is on a free plan and can sleep.

No credential values were requested, displayed, or stored.

## Tooling gap

The repository has strong local/CI validation but no single command that tests a
specific deployed URL for:

- cold-start wake behavior;
- liveness, V2 status, and strict readiness contracts;
- expected release version;
- Dashboard HTML and same-origin hashed assets;
- OAuth redirect-origin consistency;
- public secret leakage;
- security headers;
- unknown-route JSON behavior;
- HTTPS enforcement;
- degraded preflight versus strict post-deployment acceptance.

## Planned implementation

Add a dependency-free Node live-smoke tool with two modes:

```text
Strict (default):     all services and OAuth must be ready
--allow-degraded:     endpoint/schema/security preflight may accept 503 readiness
```

It must support:

```text
--url <origin>
--expect-release <version>
--wake-timeout <milliseconds>
--json <report path>
```

The JSON report must contain statuses and pass/fail diagnostics but never
headers such as cookies/authorization or environment values.

## Required tests

A local fixture server must verify that the tool:

1. accepts a complete strict-ready deployment;
2. accepts a contract-correct degraded deployment only with
   `--allow-degraded`;
3. rejects degraded state in strict mode;
4. rejects missing V2 routes;
5. rejects missing security headers;
6. rejects cross-origin Dashboard assets;
7. rejects release mismatches;
8. does not include secret-like response values in reports.

## Completion gate

- New acceptance tests pass.
- Existing command and HTTP inventories remain unchanged.
- `npm run verify` passes completely.
- A live preflight against the current Render URL runs and reports the known
  stale-deployment failures without exposing secrets.
- A step-by-step operator runbook documents pre-deploy, deploy, strict
  acceptance, rollback, and credential-rotation requirements.
