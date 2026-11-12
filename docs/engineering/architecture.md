# Engineering architecture map

| Boundary | Source and behavior |
| --- | --- |
| Synthetic input | `data/raw/synthetic_transactions.csv` and `config/merchant_aliases.json` feed `src/detect_recurring_v3.py`. Labels remain separate for evaluation. |
| Canonical API | `src/api.py` serves demo artifacts, assembles commitments, and runs private analysis. The separate `src/server.js` adapter covers the demo with contract differences. |
| Statement normalization | `src/private_statement.py` parses selected fields, validates amounts and dates, matches overlapping occurrences, and suggests possible refunds. `src/merchant_review.py` supplies conservative suggestions. |
| Local storage | `src/local_statement_store.py` manages explicit named SQLite snapshots. The comparison route analyzes selected accounts independently and groups available summaries by known currency. |
| Hosted storage | `src/hosted_api.py` maps provisioned bearer credentials to owner IDs at the HTTPS boundary. `src/hosted_storage.py` persists AES-GCM snapshots via SQLAlchemy and the Alembic schema. Expiry filters access. |
| Browser | `frontend/src/App.tsx` coordinates navigation and loaded data. Statement, forecast, review, assistant and tracker components handle feature interactions. Hosted credentials and private tracker state are held in tab memory. |
| Forecast and mandate evidence | `milestones.ts` projects fitted billing slots when available. `cancellation_guide.py` supplies guidance. User-reported revocation and subsequent observed debits remain distinct from issuer confirmation. |
| Verification and packaging | `src/benchmark_holdout.py` emits the synthetic explorer artifact. `src/evaluate_merchant_holdout.py` scores the blinded fixture. The Dockerfile packages the synthetic demo. CI defines separate PostgreSQL and Chromium checks. |

[Architecture audit](../engineering-evaluation/architecture-audit.md) · [Deployment and run instructions](../../README.md)
