# Current test report

Fresh rerun on 12 November 2026.

| Check | Observed result |
| --- | --- |
| `start_app.ps1 -Smoke` with cryptography 50.0.0 | Local production build passed. Python reported 64 passed, one PostgreSQL-only skip and one warning in 2.46 seconds. |
| ESLint and Node test suite | Lint exited 0 and 17 frontend tests passed. |
| Hosted Python with disposable PostgreSQL 18.6 | 21 passed and one warning in 4.96 seconds. Alembic upgraded to head. |
| Hosted production build and HTTPS Chromium | Passed. Verified session exchange, pagination, owner switching, sign-out revocation, expiry clearing, restore and deletion. Vite retains the WebGL chunk-size warning. |
| Frozen adversarial challenge, 32 debits | 16 TP, 4 FP, 5 TN, 7 FN. F1 74.42%. Calendar mode changes four cadence assignments while preserving binary counts. |
| Frozen blinded merchant holdout, 51 debits | 27 TP, 4 FP, 5 TN, 15 FN. F1 73.97%. Exact commitments recovered 5/11 and cadence correct 27/42. No suggested links, so suggestion precision remains undefined. |
| Historical real-data import | The earlier Chromium run ingested 6,567 de-identified MoneyData rows. Recurrence labels were unavailable. |
| Docker | Image execution remains unverified locally. |

Reproduce the frozen replays with `python -m src.benchmark_holdout --compare-calendar` and `python -m src.evaluate_merchant_holdout`. Holdout metrics describe synthetic fixtures. [Detailed implementation evidence](../engineering/implementation-log.md)
