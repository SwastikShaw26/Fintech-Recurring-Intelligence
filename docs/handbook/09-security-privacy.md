# 9. Security, privacy and operational limits

FinSight works with transaction histories. A merchant descriptor, amount or date can reveal private information even when the statement contains no account number. Treat real CSVs, saved copies, exports, database backups and logs as potentially sensitive.

## 9.1 Follow the data

| User action | Where data goes | How long the application keeps it |
| --- | --- | --- |
| Open the bundled demo | The browser and server read synthetic fixtures. | As part of the demo. The fixtures are project assets. |
| Select a CSV and preview it | The file is read in browser memory. | While needed in the import view. The original file remains wherever you opened it. |
| Analyze mapped rows locally | The browser sends the selected columns to the local analysis API. | The analysis lives in the current tab unless explicitly saved. |
| Analyze mapped rows in hosted mode | The browser sends selected columns to the configured HTTPS origin. | Transient analysis until the tab clears it, unless explicitly saved. Hosting logs and infrastructure need their own privacy configuration. |
| Save a local workspace | A configured SQLite file receives a mapped snapshot. | Until you delete that saved copy. The file relies on operating-system access controls. |
| Save a hosted copy | PostgreSQL stores encrypted mapped data and history details, plus metadata needed for access, ordering and expiry. | Visible until expiry or explicit deletion. Live database cleanup and backup expiry run on separate lifecycles. |
| Mark revocation progress | Demo progress can use browser-local storage. Private checklist state stays in the tab. | Demo progress can survive a refresh. Private progress does not form part of a saved statement snapshot. |
| Enter a balance into the cash planner | The value stays in the current view's memory. | Until you leave that view or clear its state. FinSight does not fetch a bank balance. |
| Export data or calendar events | Your browser downloads a file. | Governed by your download location and any apps or cloud services that receive it. |

Hosted and local analysis submit semantic mapped columns, so an unused column is excluded. A mapped description can still contain a sensitive reference. Preview it before sending. Merchant links and overlap review may also send mapped rows from the open statement so the analyzer can recalculate. [Import UI](../../frontend/src/components/StatementImport.tsx) · [CSV projection](../../frontend/src/components/importQuality.ts) · [Request helpers](../../frontend/src/components/statementRequest.ts)

### Exercise with a synthetic file

Use this made-up example to understand what field minimization does:

```csv
date,description,amount,internal note
2026-01-05,Example Library,-100,This column is not mapped
2026-02-05,Example Library,-100,This column is not mapped
2026-03-05,Example Library,-100,This column is not mapped
```

1. Open **Import statement** and select the file. Preview renders without an analysis request.
2. Map the first three fields. Leave **internal note** unmapped.
3. Analyze and inspect the result. The amount is mapped as a debit under the negative-amount convention.
4. For a developer lab, open the browser's Network panel and inspect only this synthetic request. The payload should exclude the fourth column. Developer-tools captures can contain tokens and financial rows, so avoid sharing captures from private sessions.

The hosted browser smoke performs a similar check with a synthetic private marker in an unmapped column. [Hosted Chromium check](../../frontend/tests/hosted-statement.browser.mjs)

## 9.2 Accounts, owners and sessions

**Authentication** establishes who is calling. **Authorization** decides what that caller may do. FinSight's hosted operator provisions a random sign-in credential and configures a mapping from its SHA-256 digest to an owner UUID. A UUID is a randomly generated or otherwise assigned identifier. An owner UUID groups hosted data. It does not identify a bank account.

The hosted flow has two token types:

1. The **operator sign-in credential** is sent as an authorization bearer header to `POST /api/hosted-session`. FinSight hashes it and finds its configured owner. A **bearer** is a secret accepted from whoever presents it, so share it only with the intended owner.
2. The **session token** is a different random value issued by the server. The database stores its digest, owner and expiry. The browser holds the token in memory and sends it to the same HTTPS origin. Statement requests look up an active session before analysis. The original operator credential is for exchange.

A **digest** is a fixed-length fingerprint. The application compares token digests and keeps no copy of the original session token in PostgreSQL. This reduces what a session-table copy contains. Bearer tokens must still be protected during entry and in browser memory. [Session exchange](../../src/hosted_api.py) · [Session storage](../../src/hosted_storage.py) · [Hosted browser transport](../../frontend/src/components/statementRequest.ts)

Sessions last one hour and each owner may have ten active sessions. Sign-out clears the private view in the current tab and sends a revocation request. A successful server revocation removes the digest, and later requests fail across workers. Work that passed authentication before revocation may finish. If revocation fails, the UI reports it and the server session can remain until expiry. Reloading clears browser state without necessarily revoking the server session.

Removing an operator credential from configuration and restarting all workers stops future exchanges with it. Existing session digests remain active until revoked or expired. A restored database must invalidate old session rows before serving traffic. [Hosted runbook](08-hosted-operations.md)

## 9.3 Owner boundaries

The owner identity for statement operations comes from the session lookup. A supplied statement ID selects a candidate record, and the query also checks that the record belongs to the authenticated owner. Active-only operations check expiry. The list cursor controls page position and the server reapplies owner and expiry filters on each page. Period comparison accepts two to four owned copies and returns observed amounts by currency over the shared dates.

Hosted versions and replacements also check the owner, require an active predecessor and reject an outdated predecessor. A replacement removes the predecessor within the same transaction that inserts the new copy. A successful replacement does not remove existing downloads or prior backups. [Storage operations](../../src/hosted_storage.py) · [Hosted action dispatch](../../src/hosted_api.py)

Tests exercise application-level owner isolation on real PostgreSQL. The current schema does not configure row-level policies and CI uses its PostgreSQL service credentials for both migration and runtime. Production work should prove that a restricted app identity can perform intended operations and lacks schema administration privileges. Database row policies can add a second boundary once runtime, migration and cleanup roles are designed and tested. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [Current defensive audit](../engineering-evaluation/security-audit.md)

## 9.4 Encryption, backups and retention

**Encryption at rest** protects saved values while they are stored. Hosted snapshots and account-history details use AES-GCM. FinSight generates a fresh nonce for each encryption. It binds the ciphertext to the owner and statement IDs and separates payload and history contexts. This association helps the application detect tampering or ciphertext moved to another row. Owner and statement IDs, expiry, version, lineage and save timestamps are queryable metadata. A database copy can expose those fields even when the payload remains encrypted. [Encryption and associated data](../../src/hosted_storage.py)

**Encryption in transit** protects traffic between endpoints. The hosted frontend expects HTTPS and refuses redirects for hosted requests. PostgreSQL TLS protects the separate server-to-database connection. Database snapshots contain ciphertext, but the application processes readable data when it analyzes or restores a statement. Encryption therefore complements access controls on the app host, environment and network.

Hosted copies can have retention from one to 90 days. The API defaults to 30. List and restore exclude expired rows. The hosted worker attempts live database cleanup at startup and every 15 minutes, in bounded batches of 500 snapshots and 500 sessions per cycle. PostgreSQL skips rows another transaction is locking. Large backlogs can require multiple cycles. A live row deletion is one step in the lifecycle. Replicas, WAL archives, database pages and exported files have their own behavior. [Retention implementation](../../src/hosted_api.py) · [Storage maintenance](../../src/hosted_storage.py) · [PostgreSQL recovery](https://www.postgresql.org/docs/current/continuous-archiving.html)

The local SQLite path does not encrypt snapshots. It is an opt-in convenience for a trusted machine. Check the directory's access controls, device encryption and backup policy before saving a real statement. Remove saved copies from FinSight and separately manage the original CSV and downloads. [Local storage](../../src/local_statement_store.py)

## 9.5 Logs and monitoring

When reporting a problem, capture the application version, route name, status code, approximate time, and whether it was the local, demo or hosted mode. Prefer a synthetic reproduction over attaching financial data.

| Appropriate for a diagnostic record | Keep out of routine logs and reports |
| --- | --- |
| Release revision, service mode, coarse operation category | Authorization headers, token values, database passwords and encryption keys |
| HTTP status and latency | Request and response bodies with mapped transactions |
| Aggregate purge counts and failed-operation categories | Raw files, merchant names, amounts and saved names |
| Synthetic test fixture label | Real account numbers, transaction references and browser screenshots containing records |

The hosted browser test checks that session tokens and private records stay out of local and session storage during its exercise. The API's no-store header guides browser and intermediary caching. Operators still need to configure their proxy, monitoring, capture and error-reporting tools to avoid collecting financial payloads. The app page also requests fonts externally in the current frontend, so local analysis should not be described as a guarantee of zero browser network activity. [HTTP headers](../../src/api.py) · [Frontend document](../../frontend/index.html) · [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

## 9.6 Capacity controls and remaining hosted gates

| Control | Implemented scope |
| --- | --- |
| Import bounds | The API reads JSON with a 2.5 MB limit. Statement parsing validates rows and columns. |
| Hosted upload duration | The admitted body read is bounded to 15 seconds. |
| Hosted statement admission | Eight in-flight per worker, two per owner, and 60 admitted requests per owner per rolling minute. |
| Hosted authentication calls | The worker also limits concurrent database-backed session operations. |
| Snapshot capacity | 50 active saved snapshots per owner. Existing over-quota data can still be listed and deleted. |
| Active session capacity | Ten per owner across workers. |
| Saved listing | Pages of up to 20, sorted by expiry and ID. |

Per-worker admission starts after origin and credential handling and does not implement a shared gateway budget. Public hosted release still needs verified ingress limits, production database roles, backup expiry and deletion reconciliation, deployment packaging and operational monitoring. Those requirements concern the deployment itself. The local and disposable hosted test results establish behavior in their exercised configurations. [Current roadmap](../engineering/feature-roadmap.md) · [Current audit](../engineering/audit-findings.md)

## 9.7 Export and financial meaning

- A calendar export is a local file until you import or share it. Generic titles are the default. If you include merchant names or amounts and then import the file into a synced calendar, the recipient's settings govern sharing and retention.
- A commitment activity export describes evidence linked to one commitment. It can contain a report date, a billing gap or an observed debit. The presence of a later charge can prompt follow-up. Neither the activity nor the absence of a later observed charge confirms issuer status.
- FinSight uses a deterministic assistant grounded in loaded forecast and review data. Its current workflow does not send financial records to an external AI service.
- CSV import is the available input. A future Account Aggregator connection has distinct consent, eligibility and operational requirements. [Account Aggregator research](../engineering/account-aggregator-research.md)

For the practical controls behind these boundaries, see [Operating FinSight](08-hosted-operations.md). For audit results, see the [engineering evaluation](../engineering-evaluation/execution-summary.md).
