# Phase 5 — Complete Verification and CI/CD Validation

Date: 2026-08-23  
Status: **Implemented and verified**

## Objective

Turn the repository's existing local verification suite into an enforceable,
credential-free CI release gate, validate deployment configuration, and remove
confirmed deployment build duplication without changing runtime behavior.

The required pre-change baseline was committed first:

```text
docs/optimization/phase5-cicd-manifest.md
commit e3762e6
```

## CI pipeline added

New workflow:

```text
.github/workflows/verify.yml
```

Triggers:

```text
push to main
pull_request
workflow_dispatch
```

Job contract:

```text
Runner:              ubuntu-24.04
Node:                .node-version → 22.12.0
Timeout:             20 minutes
Repository access:   contents: read
Stale runs:          cancelled per branch/PR
Checkout credentials: not persisted
GitHub secrets:      not used
```

Install and validation sequence:

```bash
npm ci --ignore-scripts
npm --prefix dashboard ci --ignore-scripts
npm run verify
```

The CI install disables root postinstall deliberately because it installs the
Dashboard explicitly. This prevents duplicate dependency installation/builds;
the authoritative gate performs the production build once after tests and
audits.

## Supply-chain pinning

The only workflow actions are official GitHub actions pinned to immutable full
commit SHAs:

```text
actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09  # v5
actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
```

Mutable major tags are retained only as comments for human readability.
Checkout uses:

```yaml
persist-credentials: false
```

## Executable release configuration contract

Added:

```text
scripts/validate-release-config.js
npm run validate:release
```

It is the first step in `npm run verify` and checks:

- package, `.node-version`, and Render Node pins agree;
- Render build/start/health/auth/production settings remain safe;
- all sensitive Render variables are generated or `sync: false`;
- no sensitive Render variable contains a committed literal value;
- CI push, PR, and manual triggers remain present;
- CI permissions remain read-only;
- stale-run cancellation and timeout remain bounded;
- checkout credentials remain disabled;
- both lockfile installation commands remain present;
- CI uses the authoritative `npm run verify` command;
- CI does not require GitHub secrets;
- action references are official and full 40-character commit SHAs;
- the exact reviewed action revisions remain pinned;
- the release gate retains config, lint, test, audit, and build stages.

This makes local and hosted CI policy the same executable contract.

## Render build optimization

Previous command:

```bash
npm ci && npm run build:dashboard
```

Root `npm ci` already invokes postinstall, which installs and builds the
Dashboard. The explicit second command compiled the same Dashboard again.

New command:

```bash
npm ci
```

Measured Render-equivalent local execution:

```text
Root packages installed:       377
Dashboard packages installed:  108
Vite build invocations:          1
Install vulnerabilities:         0
Result:                        PASS
```

The root postinstall contract and missing-build diagnostic remain unchanged.

## Fresh CI-path verification

Executed from lockfiles:

```bash
npm ci --ignore-scripts
npm --prefix dashboard ci --ignore-scripts
npm run verify
```

Install result:

```text
Root packages:       377
Dashboard packages: 108
Root audit:          0 vulnerabilities
Dashboard audit:     0 vulnerabilities
```

Release-gate result:

```text
Exit code:                          0
Release configuration validator: PASS
ESLint errors:                      0
ESLint warnings:                    0
Unit suites:                   4 PASS
Security suites:              21 PASS
Discord commands:                 100
Audited HTTP routes:               159
Guild HTTP routes:                 105
Root production vulnerabilities:    0
Dashboard production vulns:          0
Dashboard modules transformed:    1,806
Dashboard build:                  PASS
Build duration:                    1.34 s
Main JS bundle:                259.55 kB (81.65 kB gzip)
Main CSS bundle:                66.06 kB (12.49 kB gzip)
```

A second Render-equivalent postinstall build completed in 1.41 seconds and was
explicitly counted as exactly one Vite invocation.

## Node environment note

The sandbox runs Node 20.20.2, so fresh installation emitted the expected
`EBADENGINE` warning against the repository's Node 22.12.x requirement. This is
not accepted as the deployment runtime: CI and Render are both pinned to
22.12.0, and the validator fails if those pins diverge.

## Behavior invariance

```text
Runtime source changes:       0
Discord command changes:      0
HTTP route changes:           0
Database schema/key changes:  0
Frontend source changes:      0
Dependency version changes:   0
Lockfile changes:             0
```

No production feature or authorization policy changed in Phase 5.

## Live-service limitations

The workflow file is locally validated but cannot produce a GitHub Actions run
until this commit is pushed to GitHub. The Render Blueprint is locally validated
but no live deployment was triggered because this environment has no Render
account access or securely supplied rotated credentials.

Real Discord/Supabase integration remains intentionally untested. Previously
exposed credentials must not be reused.

## Final Phase 1–5 result

```text
Phase 1: full repository audit and manifest                  COMPLETE
Phase 2: indexed PostgreSQL prefix access                    COMPLETE
Phase 3: incremental guild-router decomposition              COMPLETE
Phase 4: cross-instance transaction/advisory locks           COMPLETE
Phase 5: complete verification and CI/CD validation          COMPLETE
```

All blueprint phases are complete within the available credential-free
environment. Live deployment and real-service acceptance testing remain external
operational steps rather than uncommitted code work.
