# FinSight

FinSight turns a bank statement into a ledger of recurring payment patterns. Explore the transactions behind a pattern, estimate upcoming charges, compare saved statements, and track the cancellation steps you take with your provider.

**New to the project?** Start with the [FinSight Handbook](docs/handbook/README.md). It teaches the application and its code from the beginning.

## Start on Windows

Install Python 3.12 and Node.js 26 with npm. Open PowerShell in the repository folder, where you can see `start_app.ps1`, and run:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\start_app.ps1 -Python .\.venv\Scripts\python.exe
```

Open [FinSight on port 8000](http://127.0.0.1:8000). Keep the terminal running. Press **Ctrl+C** there to stop the app. The launcher generates synthetic detector output, installs frontend packages when Vite is missing, builds the frontend, and serves it with FastAPI.

If port 8000 is occupied, add `-Port 8001` to the launcher command and open [port 8001](http://127.0.0.1:8001). For macOS, Linux, separate frontend and backend commands, and install troubleshooting, see [Run FinSight](docs/handbook/01-getting-started.md).

## Explore the app

| Open | Try |
| --- | --- |
| **Overview** | Open a milestone and trace it to the supporting transaction history. |
| **Recurring payments** | Compare amounts and billing cadence. Open provider guidance and view commitment activity or download scoped evidence. |
| **Forecast** | Explore estimated charges, conditional savings, cash buffer scenarios, and optional calendar downloads. |
| **Review** | Inspect signals such as possible duplicates, sustained price changes, and charges after a gap. |
| **Import statement** | Preview a CSV locally, choose a column layout, and review overlap before combining exports. |
| **Ask FinSight** | Ask supported questions about the loaded evidence. Responses are generated from structured data. |
| **Evaluation & audit** | Explore synthetic challenge cases, including false positives and missed recurring debits. |

A detected pattern is an inference. A future charge is an estimate. **Marked as revoked (user-reported)** records a user action. Verify mandate status with the bank, issuer, or provider.

## Choose where your data goes

| Mode | Data and storage |
| --- | --- |
| **Synthetic demo** | Uses bundled sample data. The synthetic Docker profile disables private import. |
| **Local app** | Browser preview stays in the tab. Mapped rows go to loopback FastAPI for analysis. Named SQLite saves are opt-in, stored outside the repository, and unencrypted. |
| **Hosted pilot** | Mapped rows go to the configured HTTPS host after sign-in. Explicit saves use encrypted PostgreSQL snapshots with retention, versioning and period-aligned comparisons. |

Start with sample data. For storage, downloads, credentials, and recovery boundaries, see [Privacy and security](docs/handbook/09-security-privacy.md). For hosted configuration and deployment prerequisites, use the [operator guide](docs/handbook/08-hosted-operations.md).

## Develop and verify

```powershell
.\start_app.ps1 -Python .\.venv\Scripts\python.exe -Smoke
npm run lint --prefix frontend
```

The [testing chapter](docs/handbook/07-testing-and-debugging.md) covers unit tests, browser tests, CI, and both frozen holdouts. The synthetic challenge and blinded synthetic merchant holdout measure specific fixture outcomes. The real-data import exercise measured workflow behavior. It had no recurrence labels for an accuracy estimate.

## Reference

- [Complete handbook](docs/handbook/README.md)
- [Architecture](docs/architecture.md) and [data contract](docs/data_contract.md)
- [Feature inventory](docs/engineering/feature-inventory.md) and [implementation log](docs/engineering/implementation-log.md)
- [Audit reports](docs/engineering-evaluation/execution-summary.md) and [roadmap](docs/engineering/feature-roadmap.md)
- [Contributing workflow](docs/handbook/10-contributing-and-reference.md)
