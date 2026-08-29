# EB Bot Documentation

Current setup, configuration, testing, deployment commands, and troubleshooting
are in the [root README](../README.md).

## Architecture and engineering

| Document | Purpose |
| :--- | :--- |
| [file-organization-report.md](file-organization-report.md) | Repository structure and original migration accounting |
| [engineering-lessons.md](engineering-lessons.md) | Security/correctness defects, root causes, and regression rules |
| [v2-architecture-audit.md](v2-architecture-audit.md) | V2 runtime, authorization, observability, and deployment architecture |
| [v2-test-report.md](v2-test-report.md) | V2 verification baseline |
| [file-cleanup-manifest-2026-08-23.md](file-cleanup-manifest-2026-08-23.md) | Pre-change evidence for the current cleanup |

## Authentication and profiles

The [`authentication/`](authentication/) directory contains the focused initial
audit, pre-change stage manifests, implementation reports, and final complete
authentication audit.

Start with:

- [Final authentication audit](authentication/authentication-final-audit.md)
- [Initial architecture audit](authentication/authentication-profile-phase1-audit.md)

## Optimization history

The [`optimization/`](optimization/) directory contains phase-by-phase manifests
and reports for indexed PostgreSQL prefix access, Guild router decomposition,
transaction/advisory locks, and CI/CD validation.

Start with:

- [Phase 1 full optimization audit](optimization/phase1-optimization-audit.md)
- [Phase 5 CI/CD verification](optimization/phase5-verification-cicd.md)

## Deployment

The [`deployment/`](deployment/) directory contains the deployment baseline,
sanitized live snapshot, acceptance report, and operator runbook.

Start with:

- [Deployment/live runbook](deployment/deployment-live-runbook.md)
- [Deployment acceptance report](deployment/deployment-acceptance-report.md)

## Original audit history

The [`audit/`](audit/) directory preserves the original discovery,
reorganization plan, initial audit, and security audit. These are historical
evidence rather than current operational instructions.
