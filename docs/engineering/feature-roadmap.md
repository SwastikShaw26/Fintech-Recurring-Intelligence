# FinSight feature roadmap

Refreshed 12 November 2026. Items below are proposed work. [Audit findings](audit-findings.md) · [Research](../engineering-evaluation/research-report.md) · [Implementation history](implementation-log.md)

## Current release

FinSight supports the synthetic demo, private CSV preview and mapping, overlap-aware imports, refund suggestions, merchant-link review, forecasts, savings estimates, mandate follow-up, in-app reminders, and a deterministic explanation assistant. Users can opt into named SQLite workspaces and compare account summaries by currency. The hosted pilot has an HTTPS browser flow, operator-provisioned credentials, and encrypted PostgreSQL snapshot storage with an Alembic migration. Hosted storage tests, HTTPS browser flow, process restart, and database outage recovery passed on disposable PostgreSQL 18.6. Docker remains unverified. [Implementation log](implementation-log.md)

## Proposed next work

| Order | Work | Acceptance evidence |
| --- | --- | --- |
| P0 completed | **Correct amount-tier ownership.** Each debit enters one partition. Evidence distinguishes supported overlapping exact-price plans, rotating prices, sustained price steps and INR nominal starts. | Seven regression cases passed. Both frozen holdouts and the original synthetic replay retained their debit metrics. |
| P0 in progress | **Verify the hosted stack.** Migrations, hosted API tests, HTTPS browser flow, restart and outage recovery passed on disposable PostgreSQL. | Verify the synthetic Docker image separately. |
| P0 for hosted release | **Operate retention and keys.** Hosted workers purge bounded batches of expired live rows and support staged write-key rotation. Add backup expiry, deletion reconciliation on recovery, emergency re-encryption and operator alarms. | Expired records disappear from reads and live storage. A recovery drill preserves authorized snapshots and respects deletion rules. Operator alarms cover purge failures and backlog. |
| P0 for hosted release | **Harden identity and capacity.** Hosted saves enforce a 50-active-snapshot quota per owner and list in pages of 20. Per-worker limits and expiring, revocable sessions are in place. Add shared gateway limits and validate runtime DB permissions and tenant boundaries. | Verify limits under controlled load, two-owner isolation across reused DB connections and telemetry without private data. |
| P1 | **Qualify stale forecasts and savings.** Use statement coverage and recency to separate supported estimates from conditional scenarios. | Verify that old, sparse or incomplete history cannot silently contribute to headline totals. |
| P1 completed | **Update audited dependencies.** Hosted cryptography uses 50.0.0 and the frontend lockfile resolves minimatch 11.0.1 through a temporary npm override. | Both scans reported zero known advisories. Clean frontend install, lint, build, tests, live PostgreSQL and encrypted recovery passed. |
| P1 | **Expand evidence and import coverage.** Capture statement date-range coverage and improve bank-layout fixtures. Build a blinded, consented label set with real recurrence and merchant-pair labels. | Publish a provenance manifest and split by merchant/account. Report false merges, missed commitments, debit metrics and rolling-origin forecast error with coverage. Keep financial rows outside Git. |
| P1 | **Improve hosted account workflow.** Add descriptive snapshot names, chronological listing, explicit replace/version behavior and selected-account comparison. Align comparison periods when coverage is known. | Verify account switching, concurrent saves, preservation of corrections and no cross-account merging. Display unknown currencies separately. |
| P2 | **Improve actionable reminders.** Keep in-app preferences and research optional email delivery with limited content, unsubscribe and deduplication. | User controls opt-in and event types. Retries cannot send duplicate reminders. Financial details stay inside the app by default. |
| Later | **Evaluate model and data integrations.** Compare a lightweight linkage ranker only after labels exist. Keep bank connectivity in a synthetic sandbox pending a verified FIU route. | Measurable improvement against the frozen baseline and documented consent, eligibility and authorized access. |

Keep issuer confirmation distinct from user-reported revocation. Review guidance against the current RBI framework as provider flows change. [RBI e-mandate directions](https://rbi.org.in/scripts/FS_Notification.aspx?Id=13374&Mode=0&fn=9)

## Product expansion proposals

| Priority | Feature | First release and acceptance |
| --- | --- | --- |
| 1 | **Forecast confidence and renewal inbox** | Show statement coverage, last seen, and the current supported price beside each renewal. Group upcoming charges, price increases and stale patterns into actionable views. Unsupported or stale estimates stay out of headline obligations and savings. Verify recent price changes, missing coverage and old monthly series. |
| 2 | **Import quality center** | Preview and map locally before hosted upload. Show added, skipped and ambiguous overlap rows and let the user resolve conflicts before applying them. Add versioned CSV presets first, then an OFX file adapter with account-scoped transaction IDs. Verify repeat imports, missing fields and upload minimization. |
| 3 | **Account history and comparison** | Name hosted snapshots, show statement periods, and allow a period-aligned comparison with totals per currency. Provide clear version and replacement actions. Verify that account histories and merchant corrections remain scoped. |
| 4 | **Private calendar reminders** | Export selected estimated renewals as an on-demand calendar file with generic titles by default. Give users an explicit preview before including merchant names or amounts. Verify calendar date compatibility and exclude stale or unsupported events. |
| 5 | **Cash buffer planner** | Let users enter a starting balance for the current tab and inspect projected low-balance days under selected payment scenarios. Keep projected and observed amounts distinct, show data coverage and avoid implying live balance access. |
| 6 | **Commitment activity history** | Show observed price changes, skipped billing cycles, user-reported cancellations and later debits on one timeline. Make evidence export optional and redact unrelated transactions. Keep issuer verification separate. |

The first feature reuses the existing forecast and review evidence. The import quality center addresses the larger privacy and accuracy opportunity before adding new data sources. [Research and acceptance rationale](../engineering-evaluation/research-report.md)
