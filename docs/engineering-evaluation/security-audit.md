# Defensive security audit — current hosted pilot

Reviewed 12 November 2026. The hosted pilot passes real PostgreSQL and HTTPS browser checks. Public release still depends on the operational and database boundaries below.

| Priority | Finding and source | Release action |
| --- | --- | --- |
| Hosted gate | Owner predicates and AES-GCM owner/statement binding are implemented. The current workflow uses the same PostgreSQL credentials for migrations and the application, and the schema has no database row policies. See `src/hosted_storage.py`, `migrations/versions/` and `.github/workflows/verify.yml`. | Test separate migration and non-owner runtime roles, minimum grants, pooled isolation and the maintenance role. Consider row policies as defense in depth. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| Hosted gate | Live deletion and session revocation remove rows from the running database. Restore-time reconciliation and archive expiry remain manual operational concerns. See `src/hosted_storage.py` and the [hosted runbook](../handbook/08-hosted-operations.md). | Test a restore that keeps legitimate snapshots, reconciles deletions, invalidates sessions, and respects archive and WAL expiry. |
| Hosted gate | Hosted admission limits are per worker. The Dockerfile packages the synthetic demo. No hosted ingress configuration has been verified. See `src/hosted_api.py` and `Dockerfile`. | Add shared gateway limits for pre-auth and aggregate traffic, exercise proxy trust and TLS configuration, and verify a deployable artifact. |
| Resolved after audit | Hosted preview now runs in the browser and the normal import flow submits mapped columns. The hosted browser test checks that a synthetic unmapped identifier stays out of the request. | Continue testing mapped-only upload. Descriptors selected by the user can still contain identifying details. |
| P1 | Runtime validates remote PostgreSQL TLS settings. Alembic consumes its configured URL separately. See `src/hosted_api.py` and `migrations/env.py`. | Reuse or verify the migration TLS policy independently. |
| P2 | Local SQLite is unencrypted and relies on OS permissions. The local private import checks host and origin, while the saved route also checks the peer. Google Fonts and an inline loader complicate a strict CSP. | Keep local binding, align peer checks, and verify a staged CSP and HSTS at the deployment edge. |

One-hour session digests, revocation, owner isolation, snapshot encryption, quota, bounded listing, retention and staged key rotation are implemented. Removing an operator credential prevents new sessions after worker restart. Existing sessions remain valid until expiration or revocation. The fresh audit did not identify cross-owner disclosure in reviewed source or test observations.

The previous minimatch and cryptography advisories were remediated. The full scans at the time of the upgrades reported zero known advisories. [Dependency upgrade evidence](../engineering/implementation-log.md)
