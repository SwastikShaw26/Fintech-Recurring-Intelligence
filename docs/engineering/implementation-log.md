# Next release implementation log

## Canonical demo and serving boundary

- Replaced the FastAPI catch-all file handler with Starlette's contained static mount. API responses use `Cache-Control: no-store`.
- The Node demo adapter now uses a local origin allowlist, checks resolved static file containment, and handles non-string searches and invalid payment-method encoding.
- The PowerShell launcher isolates detector output and the production build in a new temporary directory. Its smoke mode checks the served bundle, API routes, and benchmark reproducibility. The SPA requests the canonical API from the same origin in this mode.
- Added regression tests for API cache policy, missing static files, and the JavaScript bundle referenced by the served HTML. The first two failed before implementation. The fresh smoke run passed 19 tests and frontend lint passed. Vite still warns about the existing 3D chunk.
- Regenerated the benchmark artifact because detector configuration changed its source fingerprint. Counts stayed at 16 TP, 4 FP, 5 TN, and 7 FN.

Clean-checkout and browser smoke verification, stable identity, revocation-aware projections, detector improvements, and private import remain release work.

## Stable commitment identity and revocation-aware timeline

- V3 writes a namespaced commitment ID derived from the resolved merchant and, for split streams, the amount tier. Both servers prefer the generated ID. Candidate numbers still link predictions to groups within a detector run.
- Stable IDs survive input and candidate reordering while the detected merchant and stream structure stay the same. A changed alias or split/merge can legitimately produce a new ID. Old CSVs retain the former backend-specific fallback. Existing browser progress under old IDs is retained in storage without automatic reassignment, since those IDs can no longer be safely matched after a reorder.
- Upcoming milestones show their last observed debit date and an explicit user-reported revocation label where applicable. Projections and observed history remain visible so a local report does not imply issuer confirmation.
- The reorder and tier-isolation regression failed before V3 emitted commitment IDs. The updated launcher passed 20 Python tests, frontend lint passed, and all 10 frontend tests passed. The regenerated benchmark artifact retained its existing confusion counts.

## Private CSV analysis

- Added a loopback-only FastAPI preview and analysis endpoint with a bounded JSON body, CSV and row validation, and explicit column, date, and debit-sign mapping. Private analysis calls the same V3 engine in memory with a separate per-analysis identity namespace. The bundled demo alias map is excluded from private analysis.
- The browser keeps imported results and checklist progress in tab memory. Clearing the private statement restores the demo view. The original source CSV stays under the user's control. Imports are never written to the detector's CSV output files.
- Two regression tests failed before the route existed. The updated launcher passed 22 Python tests. Build, lint, and all 10 existing frontend tests passed. The separately runnable `frontend/tests/private-statement.browser.mjs` passed against the production build served by FastAPI at a 375 px viewport. It used a synthetic DMY CSV to verify preview, mapping, detection, checklist isolation, clear, and reload.
- Real-statement verification remains pending an authorized local CSV. The browser fixture verifies functionality only.

## Calendar-aware detection, merchant review, and clean checkout

- V3 now checks calendar slots when the original interval windows cannot classify a stream. A fit needs at least three observations, one adjacent cycle, and 75% coverage. It allows up to three days of posting drift and one missed cycle per gap, with month-end clamping. Timeline projections still anchor to the last observed posting date.
- The baseline and calendar modes were replayed on the same disjoint synthetic merchant groups with `python -m src.benchmark_holdout --compare-calendar`. Each scored 16 TP, 4 FP, 5 TN, and 7 FN (74.4% F1). The four shifted charges moved from irregular to monthly. The suite was authored with detector knowledge and does not establish independent generalization.
- Users can explicitly link or unlink debit descriptors from an imported statement. Reanalysis sends only mapped fields to the local endpoint and keeps the original descriptions in the ledger. Changed commitments lose their previous in-memory revocation reports. Unaffected commitments retain them.
- Created a disposable local Git snapshot with only release source and synthetic fixtures, then cloned it without existing dependencies, detector outputs, or built assets. Offline npm installation, build, and 24 Python tests passed in that checkout. Chromium against its production FastAPI server passed the synthetic benchmark and private import, link/unlink, and clear workflows. Lint and all 10 focused frontend tests passed in the working copy. The actual repository release is still uncommitted.

## Real-data candidate

[MoneyData v1](https://doi.org/10.17632/dnxtg6n4rv.1) is a CC BY 4.0 research release of de-identified real bank transactions. The authors' [published CSV](https://github.com/thevisgroup/MoneyVis/tree/master/data) was downloaded to a local temporary file only. It contains 6,567 records, separate debit and credit columns, and no currency column. The current single-amount INR importer has not been tested on it. Support split amounts and an explicit source-unit display before using it, and avoid importing irrelevant account fields. The temporary file can be found by the `finsight-moneydata-*.csv` prefix in the local user Temp directory.

## Final release verification

| Requirement | Evidence |
| --- | --- |
| Clean startup and canonical server | Cloned a disposable Git snapshot of final release source and synthetic fixtures, with no prebuilt SPA, detector outputs, or node_modules. Offline lockfile install, detector generation, production build, and the canonical FastAPI smoke launcher passed. The working project remains the delivery location. |
| Static serving, origins, and isolation | FastAPI uses a contained static mount. The Node demo adapter also checks resolved containment. API responses are noncacheable. The private route enforces loopback host and approved browser origins, keeps no session store, and leaves the demo data unchanged. |
| Stable IDs and timeline | Detector regression exercises input reorder and split-tier identity. Chromium checked the commitment modal and a user-reported revocation that persisted across refresh for the synthetic workspace. |
| Merchant review and recurrence | API and browser checks link/unlink descriptors and preserve the original statement descriptions. The calendar regression covers month-end drift and missed cycles. The merchant-disjoint synthetic comparison returned 74.4% F1 in both modes, with four drift debits corrected to monthly. |
| Private statement workflow | Chromium verified preview, mapping, validation, private checklist isolation, and clearing. The import accepts signed amounts or split debit and credit columns, with explicit currency or unspecified source units. |
| Real data and ML gate | MoneyData browser check passed. The real dataset lacks reliable recurrence labels, and the detector-aware synthetic suite is too small for a defensible ML comparison. The release continues to use the heuristic detector. |

### Real-data workflow result

The [MoneyData v1 research release](https://doi.org/10.17632/dnxtg6n4rv.1), Robert Laramee, CC BY 4.0, describes de-identified real transactions. The [authors' published CSV](https://github.com/thevisgroup/MoneyVis/tree/master/data) stayed in the local temporary directory. The browser harness passed only dates, descriptions, and debit/credit amounts. Sort codes, account numbers, balances, and other unmapped fields were excluded. Source units were displayed without assuming INR. No real rows were included in either Git repository or sent to an external service.

The real-data browser check processed **6,567 rows**, including **6,122 debits** and **445 credits**, and surfaced **48 inferred commitments**. It verified both upload requests went to the same loopback origin, browser storage stayed empty, and clearing and reloading returned to synthetic mode. These are workflow observations. No real-data precision, recall, or F1 is available.

### Reproduce locally

- `.\start_app.ps1 -Smoke` builds and validates the demo. Final clean run passed 25 Python tests. The frontend suite passed 10 tests, and lint passed in the working copy. Vite still warns about the existing 3D chunk.
- With the canonical production server running, `node frontend/tests/private-statement.browser.mjs` checks the synthetic workflows.
- With the authors' local CSV in `FINSIGHT_MONEYDATA_CSV`, `node frontend/tests/moneydata.browser.mjs` repeats the real-data workflow check. The scripts use installed Playwright or the module path in `FINSIGHT_PLAYWRIGHT`, and accept `FINSIGHT_SMOKE_ORIGIN`, `FINSIGHT_CHROME`, and `FINSIGHT_PYTHON` overrides.

## Expansion phase 1.1 — Overlapping imports and guidance maintenance

- Private CSV preview suggests mappings for common bank headers. With explicit confirmation that both exports cover complete days for the same account and currency, analysis combines them in memory. Matching is exact across normalized dates, descriptions, amounts, directions, and payment methods. Occurrence counts preserve repeats observed within either export. Credits remain credits and do not become recurring debit candidates.
- Deduplication cannot distinguish identical payments across partial-day or filtered exports. Use separate analyses for those exports. The merge retains merchant links and recalculates commitments. Affected checklist reports are invalidated when their supporting transactions change.
- Updated card e-mandate references in both server paths and revised withdrawal guidance using the [RBI Digital Payments – E-mandate Framework, 2026](https://rbi.org.in/scripts/BS_ViewMasDirections.aspx?id=13374). Removed unsupported timing guarantees for UPI and bank mandate cancellation.
- Opt-in persistence, export and deletion of saved records, and dedicated refund reconciliation remain part of the active expansion goal.

## Expansion phase 1.1 — Refund review

- Private analysis now suggests possible full refunds when an explicitly labeled refund or reversal credit matches a debit by normalized merchant, amount, and payment method within 30 days. Confirmed merchant links can help resolve the descriptor. A match must be unique in both directions. Ambiguous, partial, or unmatched credits require review.
- Transaction history retains the original debit and credit, preserves amount-review flags, and labels suggested matches separately. The suggestions do not alter recurring detection or net spending estimates. The current import and merchant-review paths both recompute the suggestions from the mapped rows.
- Added a regression for one unique full refund, multiple identical candidate debits, and an ordinary unlabeled credit. Opt-in persistence and saved-statement lifecycle remain upcoming.

## Expansion phase 1.1 — Optional SQLite workspace

- Added explicit save, restore, export, and delete controls. SQLite is disabled unless `FINSIGHT_LOCAL_DB` is an absolute path outside the repository. The storage route checks same origin and loopback host and client. Normal private analysis remains transient.
- The database stores one workspace with mapped transaction fields, merchant links, currency, and its analysis ID. Restore re-runs analysis. Saving a different workspace conflicts until the existing one is explicitly deleted. The database uses SQLite secure deletion and relies on OS file access controls. It is unencrypted, and deletion does not erase backups or exported files.
- The production build, lint, and all 30 Python tests passed. Chromium verified explicit save, JSON download, restore after reload, deletion, and a failed restore after deletion using a disposable synthetic database.

## Expansion phase 1.2 — Merchant suggestions and blinded holdout

Private review now proposes links from exact configured aliases, punctuation and spacing normalization, and bounded spelling similarity. Suggestions give a reason and never change detection until confirmed. Different numeric tokens block fuzzy suggestions. Confirmed links can be removed. Dismissed pairs can be restored. Both decisions are scoped to the statement and carried through overlapping imports, JSON export, and explicitly saved SQLite workspaces.

A separate agent authored `data/raw/merchant_holdout_v1.json` without access to detector code, existing fixtures, or scores. Labels were assigned from synthetic scenario premises. The evaluator checks descriptor and alias-key separation from the original and earlier challenge fixtures and sends only transaction features to detection. Reproduce with `python -m src.evaluate_merchant_holdout`.

| Check | Result |
| --- | --- |
| Debit classification | 51 debits, 27 TP, 4 FP, 5 TN, 15 FN. Precision 87.10%, recall 64.29%, F1 73.97% |
| Cadence | 27 correct out of 42 expected recurring debits, counting missed debits as incorrect |
| Commitment recovery | 5 of 11 expected commitments recovered with exactly the same debit membership. 8 predictions, zero mixed-merchant groups |
| Review proposals | Zero proposed pairs. False-merge rate and suggestion precision are undefined for this fixture. Targeted tests cover alias, spelling, and numeric guards |

The fixture has nine cases and includes one refund credit outside the debit metrics. The test pins its SHA-256. The results describe synthetic scenarios and do not establish real-world accuracy. No ML comparison was run because suitable real recurrence labels are unavailable.

The production build and lint passed. Chromium verified suggestion confirmation, dismissal, undo, and restoring a saved workspace with its dismissal intact.

## Expansion phase 1.3 — Billing anchors, forecasts, and savings

- The detector emits the fitted billing day and latest fitted slot when it can align the final supporting debit to the selected schedule. Both APIs carry these fields. The timeline advances from the fitted slot so early postings do not repeat an already paid slot and late postings do not shift the cadence. If a fit is unavailable, it uses the last observed debit.
- The **Forecast** view shows the next 30 calendar days, estimated annual renewals, monthly equivalent, annualized obligations, and a comparison of gross recorded debits in the latest two calendar months represented by the statement range. It flags short, stale, or variable evidence and leaves unsupported amounts unestimated.
- The savings comparison uses only the commitments the user selects. It assumes cancellation takes effect before another charge and incurs no fee. User-reported revocations stay visible in obligations, with separate labeling, and are excluded from selectable savings to avoid counting them twice.
- The synthetic challenge artifact was regenerated for the updated detector fingerprint. Its binary confusion counts were unchanged. Forecasts are planning estimates from observed data, with no issuer confirmation or probabilistic confidence intervals.

## Expansion phase 1.3 — Transaction review

- The canonical FastAPI review feed adds possible duplicates, sustained amount changes, and charges after a gap for demo and private data. It leaves transactions and detector decisions intact. The Node adapter retains its previous review feed.
- Duplicate candidates share a date, normalized descriptor, amount, and payment method. Distinct credits are excluded. A sustained shift requires two earlier and two recent debits on distinct dates with similar amounts within each pair and at least a 15% shift between pairs. Suggested refunded debits are excluded from that check.
- A gap signal requires a detected regular cadence, an earlier cadence-consistent interval, and a later interval at least 1.65 times the nominal cadence. Evidence shows all three supporting records. Missing statement coverage, ordinary repeat purchases, and plan adjustments can produce signals.
- The **Review** view filters signal types, expands the supporting records, and opens the associated commitment where available. The transaction evidence is explanatory and does not establish unauthorized billing or issuer status.

## Expansion phases 1.3 and 2.0 — Mandate follow-up, reminders, and CI

- The commitment dialog shows the date of a user-reported revocation and any linked debits dated after that India-local calendar day. Same-day records have no reliable posting order. The absence of later loaded debits does not verify issuer status.
- Forecast offers opt-in in-app reminders with a 1, 3, 7, 14, or 30 day window and an optional annual-renewals filter. Reminders exclude user-reported revoked commitments. Only preferences persist in browser storage. The app displays reminders when Forecast is open. External delivery and background scheduling remain separate work.
- Added `.github/workflows/verify.yml` for a fresh dependency install, synthetic production build, Python and Node tests, lint, and a same-origin Chromium smoke. The workflow uses bundled synthetic inputs and a disposable SQLite file. The commands were exercised locally. GitHub-hosted execution remains unverified.
- Production build, lint, 34 Python tests, 13 frontend tests, and local Chromium passed. Browser checks covered persistence of reminder preferences and the follow-up shown after private attestation.

## Expansion phase 2.0 — Local explanations and Account Aggregator research

- **Ask FinSight** answers supported questions about projected charges, sustained increases, possible duplicates, and billing gaps. It derives answers from loaded forecast entries and structured review signals. Results link to commitments, Forecast, or Review and show supporting transaction rows when available.
- Answers are deterministic, and unsupported questions direct the user to the supported list. Questions and answers remain in the browser. The assistant has no external AI dependency or financial-data transfer.
- [Account Aggregator research](account-aggregator-research.md) records RBI eligibility, consent, and partnership questions. Live integration remains contingent on authorization and a verified regulated recipient.
- Build, lint, 34 Python tests, and 15 frontend tests passed locally.

## Expansion phase 2.0 — Named local workspaces

- Added opt-in account nicknames and scoped list, save, restore, and delete operations to the existing loopback SQLite workflow. Legacy saved analyses migrate to Default workspace in one transaction. A named workspace cannot be silently overwritten by a different analysis.
- Production build succeeded, with the existing WebGL chunk-size warning. Python smoke reported `35 passed, 1 warning in 0.87s`. Frontend lint exited successfully.
- The production Chromium smoke saved two synthetic workspaces, restored merchant review state after reload, and verified that deleting Default workspace left the Business statement intact. The interface currently opens one workspace at a time. Hosted identity and a combined multi-account view are still pending.

Independent review caught a stale list entry after deleting through a Unicode-equivalent nickname. The UI now uses the server's refreshed list. The expanded Chromium run exited 0 and checked the alternate spelling and the surviving workspace. The final Python smoke reported `35 passed, 1 warning in 0.77s`. Node reported `15` passes and `0` failures. Saves from multiple tabs for the same analysis still use last-write-wins.

## Expansion phase 2.0 — Combined local account overview

- In Local saved statement, list saved accounts and select two to eight for an opt-in comparison. Each saved statement is reanalyzed under its own analysis ID. The API reads the selected payloads in one SQLite query and returns summaries. It never reruns detection on pooled transactions.
- The view displays all loaded transaction counts and inferred commitments by account. Annual estimates cover commitments with supported estimates. Combined totals group by known currency without conversion or date-range alignment. Unspecified currency remains visible only in individual account rows.
- The regression failed before the overview action was implemented. The production smoke reported `36 passed, 1 warning in 0.79s`. Build and lint exited 0, 15 Node tests passed, and the final Chromium run compared two synthetic accounts at a 375px viewport before restoring and deleting an individual workspace. Vite retained its existing WebGL chunk-size warning.

## Expansion phase 2.0 — Synthetic deployment profile

- Added a multi-stage Docker build with an allowlisted build context, baked synthetic artifacts, non-root runtime and a readiness probe. The demo profile disables both statement routes before parsing the request and hides the import navigation. The container starts Uvicorn with proxy-header processing and access logs disabled.
- The demo boundary regression initially failed with `422` instead of `404`. The production smoke later reported `37 passed, 1 warning in 0.81s`. The frontend build and lint exited 0 and all 15 Node tests passed. Chromium rendered the synthetic timeline and confirmed the import action was absent in a production build of the demo profile served directly by local FastAPI.
- Docker build could not connect to the Linux engine on this machine. The CI workflow now builds the image, checks readiness and disabled imports, and runs the same Chromium smoke against the container. Container execution and GitHub-hosted CI are still unverified. Authenticated hosted storage remains separate.

## Expansion phase 2.0 — Hosted statement storage foundation

- Added optional hosted dependencies, SQLAlchemy snapshot operations, and Alembic revision `0001_hosted_statements`. Snapshots are encrypted with AES-256-GCM and fresh nonces, with the owner and statement UUIDs bound to the ciphertext. The database stores the UUIDs and expiration timestamps as queryable metadata. The storage caller must supply the authenticated owner. No hosted statement endpoint uses this storage yet.
- List and load exclude expired snapshots. Delete is owner-scoped and a maintenance operation purges expired rows. API controls, secret provisioning, key rotation, backup expiry, and scheduling the purge remain pending.
- With hosted dependencies installed, Python reported `40 passed, 1 warning in 1.32s`. SQLite applied the migration and exercised scoping, encryption, ciphertext swapping, UTC normalization, expiry, and deletion. `python -m alembic upgrade head --sql` emitted PostgreSQL UUID, BYTEA and TIMESTAMP WITH TIME ZONE DDL.
- Added a CI job with a PostgreSQL service and a unique disposable schema per test. Live PostgreSQL verification remains pending. Docker Desktop's Linux engine was unavailable and this machine has no local PostgreSQL installation.

## Expansion phase 2.0 — Authenticated hosted statement API

- The opt-in hosted FastAPI lifespan validates PostgreSQL connectivity and the snapshot columns before starting. It requires an exact HTTPS origin and certificate verification for remote PostgreSQL. Hosted mode leaves the two local statement routes disabled.
- The new endpoint checks the operator-provisioned bearer credential before reading the body. It derives ownership from the credential digest. It supports transient preview and analysis, consented encrypted snapshots with 1–90 day retention, owner-scoped list and restore, and explicit deletion.
- The regression initially failed because the hosted module did not exist. The final production smoke reported `42 passed, 1 warning in 1.87s`. It covers no-auth rejection, HTTPS and origin checks, transient preview, explicit save, cross-owner list/load/delete isolation, deletion, and rejection of unsupported database configuration.
- Local API integration used temporary SQLite behind the storage interface. The existing PostgreSQL CI job now also exercises the hosted lifespan on its disposable PostgreSQL service. That CI execution remains unverified here. Hosted UI integration, automated physical purge, and deployment verification remain pending.

## Expansion phase 2.0 — Hosted browser workspace

- The hosted frontend reuses the CSV mapper, merchant review, and private analysis views through the authenticated hosted API. The workspace provides consented save, retention selection, restore, delete, and JSON export. The bearer stays in tab memory. Sign-out invalidates callbacks from the previous session and clears the open analysis.
- The transport regression failed before the hosted request helper was added. Final local verification reported 16 frontend tests and `42 passed, 1 warning in 1.29s` in Python. The production build and lint exited 0, with the existing WebGL chunk warning.
- Independent Chromium verification over HTTPS used real FastAPI and a disposable migrated SQLite store. It verified sign-in, transient import, confirmed save, owner switch, reload, restore, and deletion, with empty browser storage. The PostgreSQL CI job now builds the hosted frontend and runs the browser test over HTTPS against its PostgreSQL service. That CI run is still unverified.

## Audit follow-up — Amount-tier ownership and live PostgreSQL

- The detector partitions exact amount groups only where their regular histories overlap and the pooled dates do not support a single adequately spaced regular schedule. Unassigned prices are evaluated separately. Chronological two-tier changes retain one commitment, and the nominal-start exception is limited to qualifying INR series. Original and hosted CSV analysis pass the selected currency into detection where applicable. Close variable tiers and same-price plans can remain ambiguous. Annual totals for price steps still use the historical median.
- Independent testing reproduced five original failures. Independent review found two further cases, a one-off price hiding parallel plans and rotating prices splitting a regular monthly stream. Both were reproduced before correction. The final production build and Python smoke exited 0 with `49 passed, 1 warning in 1.34s`. The WebGL chunk-size warning remains.
- Frozen synthetic challenge before and after: TP/FP/TN/FN 16/4/5/7, F1 74.42%. Blinded merchant holdout: 27/4/5/15, F1 73.97%, cadence 27/42 and exact commitment recovery 5/11, all unchanged. Original demo replay remained 45/0/11/0. The generated explorer artifact was refreshed for the detector fingerprint.
- A separate verification agent used disposable loopback PostgreSQL 18.6 from `@embedded-postgres/windows-x64@18.6.0-beta.19`. All five hosted storage tests passed against the live server, including migration, authenticated startup, isolation, encryption, expiry and deletion. The production hosted build and Chromium smoke also passed over local HTTPS using the real FastAPI lifespan and two synthetic credentials. Temporary servers were stopped. Docker, snapshot restore across process restart and database outage behavior were outside this run.

## Audit follow-up — Hosted retention and database recovery

- Hosted API workers run one retention batch at startup and every 15 minutes. A transaction selects at most 500 expired IDs before deleting them. PostgreSQL skips locked rows and sets local lock and statement timeouts. Active rows are preserved. The worker retries errors, logs aggregate outcomes without SQL diagnostics, and joins before its engine is disposed.
- Hosted readiness probes the database and returns a generic 503 when it is unavailable. The liveness route stays independent. Both the retention and readiness regressions failed before their respective changes.
- Fresh local suite: `53 passed, 1 skipped, 1 warning in 1.38s`. The skip requires live PostgreSQL. The verification agent's latest run on disposable PostgreSQL 18.6 reported `10 passed, 1 warning in 2.57s`, including the row-lock and retention tests.
- A real HTTPS FastAPI process restored the same synthetic snapshot after restarting the API and database, rejected another owner's restore, and returned 503 from readiness and restore during a database outage. Readiness and restore recovered after PostgreSQL restarted while FastAPI remained live. Deletion succeeded after recovery. Cold hosted startup with the database down failed as expected.
- Docker's Linux engine remains unavailable. Backup expiry, key rotation, and configured operator alerting remain open. Database-row deletion does not establish physical erasure from backups or storage media.

## Audit follow-up — Staged hosted key rotation

- Hosted storage writes AES-GCM snapshots with the configured primary key and can read with up to three distinct fallback keys. The ciphertext format and owner/statement binding are unchanged. Config errors fail before connecting to PostgreSQL. The README records a two-stage rollout, rollback procedure and retirement criteria.
- The rotation regression failed on the single-key store and passed after the change. Final local suite: `58 passed, 1 skipped, 1 warning in 1.53s`. Independent live PostgreSQL 18.6 run: `15 passed, 1 warning in 2.77s`.
- The verification agent exported encrypted statement rows with binary PostgreSQL COPY and restored them into a separately migrated disposable database. The owner recovered snapshots from both key generations. A different owner could not restore them. Expiry and purge removed restored live rows at the cutoff while the archive remained unchanged until separately deleted. No plaintext or key material appeared in the archive. This was a logical row-backup drill, with no managed backup or WAL lifecycle exercised.
- Staged rotation affects new writes. Emergency re-encryption, reconciliation of user-deleted snapshots after backup restore, configured archive expiry and operational alerting remain open.

## Audit follow-up — Hosted snapshot quotas

- Hosted saves enforce 50 active snapshots per owner. PostgreSQL serializes competing saves for the same owner with a transaction-scoped advisory lock. A separate bounded count under READ COMMITTED checks capacity before insertion. SQLite scratch tests use an immediate write transaction. Expired rows do not consume slots. The hosted API returns HTTP 409 at capacity.
- The new quota test failed before implementation. It now checks that exactly one of two competing writes can claim the last slot, another owner retains capacity, and deletion frees a slot. The API test verifies the 409 response. Full local suite: `59 passed, 1 skipped, 1 warning in 1.56s`. The independent PostgreSQL 18.6 suite reported `16 passed, 1 warning in 2.86s`.
- Bounded listing for accounts already above the quota, request admission controls, and revocable sessions remain open.

## Audit follow-up — Bounded hosted snapshot listing

- Hosted list requests return up to 20 active IDs ordered by expiry and UUID. Continuation uses the last returned values and survives deletion or expiry of that row. Owner and active-expiry predicates apply independently to every page. The browser can advance or refresh to the first page.
- The pagination regression failed before implementation. Final production build and lint passed. Python reported `60 passed, 1 skipped, 1 warning in 1.61s`, and 16 frontend tests passed. The independent live PostgreSQL suite reported `17 passed, 1 warning in 3.15s`.
- The initial browser assertion waited for a native option to be visible. After switching to attachment and checking the exact select contents, the hosted production build and Chromium test passed over HTTPS against live PostgreSQL 18.6. The browser seeded 20 synthetic copies, opened the second page and verified the expected single ID. The repeated PostgreSQL suite reported `17 passed, 1 warning in 2.96s`.

## Audit follow-up — Hosted request admission

- Hosted authentication runs before admission and body reads. Per worker, the server allows eight in-flight requests total, two per authenticated owner, and 60 admitted requests per owner per rolling minute. Rejected requests return 429 with a retry interval. Slow bodies time out at 15 seconds with 408. The concurrency slot spans request reception and processing.
- The admission regression failed before implementation. Tests cover independent owner capacity, the worker ceiling, release after failure or body timeout, the rate window, and rejected requests leaving the body unread. Final local Python suite: `62 passed, 1 skipped, 1 warning in 1.78s`. The independent live PostgreSQL 18.6 suite reported `19 passed, 1 warning in 3.36s`. Hosted production build and the HTTPS Chromium workflow passed, including pagination.
- In-memory limits apply per process and reset on restart. Deployment-wide gateway limits and expiring revocable sessions remain open.

## Audit follow-up — Patched dependencies

- Hosted cryptography now pins 50.0.0. Current ESLint and typescript-estree releases still declare minimatch 10 ranges, so the frontend uses a temporary npm override to resolve the patched 11.0.1. Remove the override once the upstream dependency ranges allow a patched release.
- A clean scratch npm install resolved all minimatch paths to 11.0.1. Lint and build exited 0, and 16 frontend tests passed. npm audit and pip-audit against the hosted requirements both exited 0 with zero reported advisories.
- Python imported cryptography 50.0.0 and reported `62 passed, 1 skipped, 1 warning in 3.10s`. The independent live PostgreSQL 18.6 run reported `19 passed, 1 warning in 3.33s` and verified encrypted logical backup recovery for both key generations.

## Audit follow-up — Expiring hosted sessions

- Alembic revision 0002 adds a session table with token digests, owner IDs and expiry. Operator credentials are only accepted for exchange. Statement requests resolve the bearer digest against active sessions on each request. Sessions last one hour and are capped at ten per owner. Sign-out deletes the digest without requiring a restart, and hosted retention removes expired session rows.
- The frontend keeps the session token in memory, clears the private view at expiry or sign-out, and reports failed revocation. A stale response cannot reopen a previous signed-out workspace.
- The new storage regression was red before implementation. Fresh local suite: `64 passed, 1 skipped, 1 warning in 2.19s`. Live PostgreSQL 18.6: `21 passed, 1 warning in 4.14s`. Lint and all 17 frontend tests passed. The final hosted build and HTTPS Chromium flow passed, including exchange, revoked-token rejection, owner switching, sign-out failure and browser expiry clearing.
- Shared gateway limits, runtime database role isolation, backup deletion reconciliation and Docker verification remain open.
