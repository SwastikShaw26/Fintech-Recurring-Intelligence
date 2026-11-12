# FinSight — Recurring Payment Intelligence

FinSight analyzes recurring-payment patterns in a synthetic demo or user-provided statements. It shows the evidence behind each pattern, projects future charges, and helps users track cancellation steps with their payment provider. Local analysis is the verified release path. An opt-in hosted workspace is available for pilot verification.

## What works today

| Area | Current behavior |
| --- | --- |
| Overview | Estimated monthly equivalent, annual estimate, review queue, commitment preview, and subscription timeline |
| Recurring payments | Searchable pattern ledger and detail dialog with supporting transactions, cadence, heuristic score, and provider guidance |
| Transactions | Statement ledger with payment methods and detector review flags |
| Revocation tracker | Browser-local progress, a reset action, and a separate **Marked as revoked (user-reported)** action. The animated FinSight emblem has a static fallback |
| Subscription timeline | One next estimate per regular pattern, observed billing events, month navigation, and links into commitment details |
| Evaluation & audit | Interactive confusion matrix, scenario explorer, and transaction evidence from the generated synthetic challenge artifact |
| Forecast and review | 30-day debit calendar, annualized estimates, conditional savings, payment-change evidence, and opt-in in-app reminders |
| Statement workspaces | Private CSV analysis, merchant review, optional named SQLite workspaces, and an authenticated hosted snapshot flow |
| Ask FinSight | Deterministic answers from loaded forecast and review evidence |

The detector uses normalized descriptors, a small alias map, amount-tier heuristics, and timing windows for monthly, quarterly, annual, and some irregular patterns. The app shows inferred patterns and projections. Banks and issuers remain the source for mandate status and actual charges.

## Run locally

Start from the repository root. Use a compatible Python installation and Node/npm supported by the Vite version in the frontend lockfile.

```powershell
python -m pip install -r requirements.txt
.\start_app.ps1
```

The launcher builds the SPA and generates synthetic detector outputs in a temporary directory, then serves both through FastAPI on [port 8000](http://127.0.0.1:8000). Run `.\start_app.ps1 -Smoke` to build the same isolated demo and run the Python API and benchmark tests. The launcher accepts `-Python` and `-Port` overrides.

For frontend development with hot reload, run:

```powershell
python -m src.detect_recurring_v3
python -m uvicorn src.api:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open [FinSight](http://127.0.0.1:5173). The frontend uses `VITE_API_URL` or defaults to `http://127.0.0.1:8000`. For single-port serving, build the frontend with `npm run build` and start or restart the API so it can serve the generated `frontend/dist`.

The current working copy also contains a local Node demo adapter. After generating the detector CSVs, run `node src/server.js` **instead of** Uvicorn to use it. Both servers use port 8000. The adapter has known contract differences and is currently untracked in Git, so use FastAPI for a clean checkout.

## Evaluation

```powershell
python -m src.benchmark_holdout
python -m src.benchmark_holdout --compare-calendar
python -m unittest discover -s tests -p test_benchmark_holdout.py
python -m pytest -q
```

The benchmark command generates the JSON used by **Evaluation & audit**. On 32 separately authored synthetic challenge debits, V3 scored **80.0% precision, 69.6% recall, and 74.4% F1** (16 TP, 4 FP, 5 TN, 7 FN). The suite uses disjoint merchant keys but was authored with knowledge of V3. The original 56-debit fixture replay is a regression check and has no established independent split. Both evaluations are debit-level and synthetic.

For frontend checks, run `npm run lint` and `npm run build` from `frontend`. See the [current test report](docs/engineering-evaluation/test-report.md) for observed results and environment limits.

## Project documentation

- [Current architecture](docs/architecture.md) and [data contract](docs/data_contract.md)
- [Repository inventory](docs/engineering/repository-inventory.md) and [feature inventory](docs/engineering/feature-inventory.md)
- [Audit findings](docs/engineering/audit-findings.md) and [prioritized roadmap](docs/engineering/feature-roadmap.md)
- [Current audit and release verdict](docs/engineering-evaluation/execution-summary.md) and [product expansion proposals](docs/engineering/feature-roadmap.md#product-expansion-proposals)
- [Revocation tracker](docs/engineering/feature-05-implementation.md) and [benchmark implementation](docs/engineering/feature-07-implementation.md)

## Analyze a private statement

Start the local FastAPI launcher and open **Import statement**. Choose a UTF-8 CSV with a header row, preview the rows, and map date, description, and amount. Select either one amount column with a direction or sign convention, or separate debit and credit columns. Payment method is optional. The importer accepts ISO, day-first slash dates, and month-first slash dates. Choose INR, GBP, USD, EUR, or unspecified source units. FinSight does not convert amounts.

FinSight analyzes the statement in memory on this computer. Results and private checklist progress stay in the current tab. **Clear private statement** removes the imported session and restores the synthetic demo. Reloading also clears the session. This action leaves the original CSV on disk. The importer handles up to 10,000 rows and uses the loopback FastAPI server.

After importing, return to **Import statement → Review merchant descriptors** to link two descriptions that you know belong to the same merchant. Linking or removing a link recalculates the analysis. The ledger preserves the original descriptions. Progress for a commitment is cleared if its supporting transactions change.

When importing a second export, enable **Combine with the current statement** only if both files cover complete days for the same account and currency. FinSight matches overlapping occurrences and keeps repeated rows within each export. In **Transactions**, a labeled refund or reversal credit may show a possible match to a same-amount debit within 30 days. The ledger keeps both rows and sends ambiguous matches to review.

Local analysis requires no account. The hosted workspace uses operator-provisioned credentials. Bank connectivity and cross-device revocation history remain unavailable. Accuracy on real statements requires labeled evaluation data.

### Optional local SQLite storage

To enable **Save locally** and **Restore saved statement**, configure a database path outside the repository before launching FastAPI:

```powershell
$store = Join-Path $env:LOCALAPPDATA 'FinSight'
New-Item -ItemType Directory -Path $store -Force | Out-Null
$env:FINSIGHT_LOCAL_DB = Join-Path $store 'statement.sqlite3'
.\start_app.ps1
```

In **Import statement → Local saved statement**, enter a nickname to save the current analysis, or select a nickname from **List saved accounts** to restore or delete its saved copy. The app analyzes one workspace at a time. A nickname holds one analysis with its mapped fields and merchant links. To replace it with a different analysis, explicitly delete its saved copy first. Existing single-workspace databases migrate to **Default workspace**. You can also export the current analysis as JSON.

Use **List saved accounts → Combined account overview** to compare two to eight saved statements. The overview shows transaction and inferred commitment counts and available annualized estimates. Each statement is analyzed independently. Totals are grouped by known currency and span the full histories of the selected statements.

The SQLite file is unencrypted and relies on local OS access controls. Use this mode only with a trusted local machine and server process. Deleting a saved copy leaves downloaded exports, original CSVs, and current tab data under your control.

The private workflow was verified in Chromium on 6,567 de-identified real transactions from [MoneyData v1](https://doi.org/10.17632/dnxtg6n4rv.1). See the [release verification log](docs/engineering/implementation-log.md) for provenance and the distinction between workflow and accuracy checks.

## Containerized synthetic demo

With a running Docker engine:

```powershell
docker build --tag finsight-demo .
docker run --rm --read-only --publish 127.0.0.1:8027:8000 finsight-demo
```

Open http://127.0.0.1:8027. The image builds the frontend and generates its synthetic detector outputs before startup. It runs as a non-root user with the private import and local statement endpoints disabled. The Docker health check uses `/api/ready` to check for build artifacts. Restart the app after provisioning frontend assets because FastAPI registers its static mount at startup.

## Hosted statement API

The opt-in hosted backend accepts operator-provisioned bearer credentials over its configured HTTPS origin. Install `requirements-hosted.txt`, set the configuration below in the process secret store, and run `python -m alembic upgrade head` before starting the FastAPI server in hosted mode.

| Variable | Value |
| --- | --- |
| `FINSIGHT_DEPLOYMENT_MODE` | `hosted` |
| `FINSIGHT_HOSTED_ORIGIN` | Exact HTTPS origin without a trailing slash |
| `FINSIGHT_HOSTED_DATABASE_URL` | SQLAlchemy `postgresql+psycopg` URL. A remote database requires `sslmode=verify-full` and its trusted CA configuration |
| `FINSIGHT_HOSTED_ENCRYPTION_KEY` | 32 random bytes as 64 hexadecimal characters, kept separately from the database |
| `FINSIGHT_HOSTED_FALLBACK_KEYS` | Optional JSON array of up to three distinct 64-character hex read keys, excluding the primary key |
| `FINSIGHT_HOSTED_CREDENTIALS` | JSON object mapping each operator sign-in credential's lowercase SHA-256 hex digest to its owner's UUID. Generate values with `secrets.token_urlsafe(32)` and deliver them privately. Remove a digest and restart all workers to prevent new sessions from that credential |

The TLS endpoint must preserve the configured host. If TLS terminates at a reverse proxy, configure Uvicorn to trust forwarded scheme headers only from that proxy's address and keep the Uvicorn listener private. Disable logging of authorization headers and financial request bodies.

Build the frontend with `VITE_FINSIGHT_HOSTED=true` and serve the result from the same HTTPS origin. Open **Import statement → Hosted workspace**, enter the provisioned credential, then import a CSV. Selecting a file sends the full CSV to the configured host for preview. Remove columns you do not want to send before selecting the file. Use **Save hosted copy** to choose retention and confirm storage. Signing out clears the tab's credential and current analysis. Use **Refresh hosted statements** after returning to the import page to list saved copies.

For API clients, send the operator sign-in credential as a bearer header to `POST /api/hosted-session`. It returns a separate session token and expiry. Send the session token as the bearer header on JSON POST requests to `/api/hosted-statement`. The `analyze` action accepts a `statement` in the private CSV request format. The `save` action requires a mapped statement, `save_confirmed: true`, and optionally `retention_days` from 1 to 90, with a default of 30. It returns a statement ID and expiry. Use `list` to retrieve active IDs, `load` to retrieve a mapped analysis, and `delete` to remove it. Load and delete require a `statement_id`.

Sessions expire after one hour. An owner can have up to ten active sessions. Send `DELETE /api/hosted-session` with the session bearer to revoke it across workers without restarting. Requests that already passed authentication may finish. The browser clears the private view on expiry or sign-out. Reloading clears the tab state while the server session remains until expiry. On migration from revision 0001, apply Alembic revision 0002 before routing traffic to the new build and stop old workers that still accept the operator credential on statement endpoints. Exclude the `hosted_sessions` table's rows from restorable backups or clear them in the restored database before opening traffic.

Expiry removes a snapshot from list and load immediately. While hosted mode runs, each API worker deletes up to 500 expired database rows at startup and every 15 minutes. PostgreSQL workers skip rows currently locked by another transaction. Configure monitoring for `Hosted retention batch failed` and repeated `full_batch=True` messages. Database-row deletion and backup, WAL and replica retention follow separate lifecycles.

Use `/api/ready` for routing decisions. In hosted mode it checks the snapshot table as well as the frontend and synthetic assets. `/api/health` remains a process liveness check.

Each hosted owner can keep up to 50 active snapshots across credentials and API workers. Expired snapshots do not count toward the limit. A save at capacity returns HTTP 409 until a snapshot is deleted or expires. Upgrade all hosted workers together to enforce the quota consistently across writers.

Hosted lists return up to 20 active snapshots at a time, ordered by expiry and then ID. Pass the returned `next_cursor` as `cursor` in the next list request. In the browser, **Next saved statements** advances and **Refresh hosted statements** returns to the first page. Refresh to see any new copies inserted before the current page.

Each API worker admits up to eight hosted requests at once, with up to two concurrent requests and 60 requests per rolling minute per authenticated owner. HTTP 429 includes `Retry-After`. The server allows up to 15 seconds to receive an admitted body. These limits are per worker and reset on restart. Configure shared gateway limits for deployment-wide traffic and unauthenticated requests.

### Rotate hosted encryption keys

1. Deploy keyring-capable code to every hosted worker. Generate a new 32-byte key in your secret store. Keep the current write key as primary and add the new key as a fallback on every worker.
2. After all workers can read both keys, switch the new key to primary and retain the old key as a fallback. Verify a snapshot saved before the switch and one saved after it. If you roll back the write key, keep keyring-capable code and both read keys.
3. Retire the old key only after all live snapshots written under it have expired and been purged, and all still-restorable backups, WAL archives, and replicas that need it have expired or been migrated. A live snapshot can last up to 90 days after the last old-key write. Keep a record of the final write and backup expiry times without recording key material.

Rotation changes the key for new writes. Existing snapshots retain their original encryption. For a recovery drill, restore into an isolated database and check owner access, expiry, and deletion history before opening traffic. Restoring a backup can reintroduce a snapshot explicitly deleted after that backup. A deletion reconciliation policy and emergency re-encryption procedure remain hosted release requirements.
