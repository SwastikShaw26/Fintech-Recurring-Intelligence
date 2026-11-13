# FinSight

FinSight turns a bank statement into a ledger of recurring payment patterns. Explore the transactions behind a pattern, estimate upcoming charges, compare saved statements, and track the cancellation steps you take with your provider.

**New to the project?** Start with the [FinSight Handbook](docs/handbook/README.md). It teaches the application and its code from the beginning.

## Start on Windows

**Double-click `Run FinSight.cmd`** in the repository folder. It opens FinSight in your default browser once the local server is ready. Subsequent launches reuse the frontend build and synthetic detector outputs until their inputs change. Press **Ctrl+C** in the launcher window to stop the server.

For one-time setup, install Python 3.12 and Node.js 26 with npm, then run these commands from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The launcher prefers port 8000 and chooses a free loopback port if necessary. It prints the address in its window. Double-clicking again opens the instance already started by this checkout's launcher. For macOS, Linux, or separate frontend and backend commands, see [Run FinSight](docs/handbook/01-getting-started.md).

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
