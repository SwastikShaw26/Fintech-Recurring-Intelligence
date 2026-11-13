# 10. Contribute and look up terms

[Contents](README.md) · [Previous chapter](09-security-privacy.md)

## 10.1 Find the right starting point

| If you want to change | Start with | Verify |
| --- | --- | --- |
| A screen, route, or view state | `frontend/src/App.tsx`, then the feature component | TypeScript build, lint, keyboard and browser smoke |
| The CSV preview or mapping | `StatementImport.tsx` and `importQuality.ts` | Browser parser tests, overlap tests, mapped-only upload |
| How private rows are normalized | `src/private_statement.py` and `src/api.py` | CSV contract and overlap regressions |
| How a pattern is found | `src/detect_recurring_v3.py` | Detector invariants and both frozen holdouts |
| Forecast arithmetic and explanations | `milestones.ts`, `ForecastPanel.tsx`, and `ledgerAnswers.ts` | Date edge cases, reviewed totals, deterministic answers |
| Mandate status and tracker | `cancellation_guide.py`, `revocationGuide.ts`, `RevocationTracker.tsx` and `revocationStorage.ts` | User reports, reset, progress isolation and reduced motion |
| Local storage | `src/local_statement_store.py`, `SavedStatement.tsx` | Migration, ownerless local scope and separate nicknames |
| Hosted accounts or sessions | `src/hosted_api.py`, `src/hosted_storage.py`, `migrations/` and `HostedWorkspace.tsx` | Live PostgreSQL, two owners, retention, expiry and browser flow |
| Evaluation | `src/benchmark_holdout.py`, `src/evaluate_merchant_holdout.py`, `BenchmarkDashboard.tsx` | Frozen labels, reproducible counts and displayed artifact |

## 10.2 Your first small change

Pick a single existing behavior. For a practice change, add a new unit case for a cash buffer with two same-day charges and one following-day charge. Start with `frontend/tests/expansion-tools.test.mjs`. Ask how the expected value should change when the total lands exactly on the minimum buffer.

Write the expected numbers on paper. Add an assertion. Run the focused file, then lint. Inspect `git diff` and `git status --short`. These commands show what changed and which files are untracked. They do not stage or commit files. Check that statements, secret files and generated artifacts are absent from your proposed change.

If you change a feature, map its callers first. Write down the old behavior other views depend on and the new behavior the user asked for. Check empty data, a typical case and one edge case. Keep unrelated refactors separate so a reviewer can see what changed.

## 10.3 Prepare a review

1. Describe the user action that changed.
2. List the affected entry points and data boundaries.
3. Include observed test, lint, build and browser results with commands.
4. Describe migrations, compatibility with prior snapshots and recovery implications.
5. Link the applicable handbook chapter, implementation log or benchmark report.
6. Record known limitations that a reader could otherwise mistake for guarantees.

The repository separates discovery from feature execution. Roadmap proposals require approval before implementation. See [engineering instructions](../../AGENTS.md), [decisions](../engineering/decisions.md) and [implementation log](../engineering/implementation-log.md).

## 10.4 Glossary

| Term | Meaning here |
| --- | --- |
| Account | A local nickname or a statement's account context. Hosted authentication maps a credential to an owner. |
| Alembic | The tool that applies database schema revisions in order. |
| API | The HTTP interface that exchanges data with the frontend. |
| Bearer token | A credential sent in the Authorization header. Anyone holding a valid token can use it until it expires or is revoked. |
| Cadence | The inferred schedule, such as monthly, quarterly or annual. |
| Commitment | A recurring-payment candidate inferred from evidence. |
| CSV | A text table with separated fields, usually comma-separated, with rules for quoting values. |
| Debit and credit | Money leaving and entering an account, as represented in the normalized statement. |
| Descriptor | The text a statement provides about a transaction. It may differ from the merchant's public name. |
| Evidence | The observed rows and rules that support a pattern, signal or projection. |
| Fixture | A controlled sample input for reproducible tests. |
| Holdout | A separately labeled set used for evaluation. The provided holdouts are synthetic. |
| ID and UUID | A value identifying a record. A UUID has a standardized text form. IDs do not prove account or mandate status. |
| Issuer | The institution that can confirm the current status of a relevant payment authorization. |
| JSON | Structured text used for API messages and some exports. |
| Loopback | An address that reaches this computer, such as `127.0.0.1`. |
| Migration | A versioned change to database structure. |
| Origin | A browser boundary made of protocol, host and port. |
| Projection | An estimate derived from past evidence and a billing model. |
| React state | A component's current values. Changes trigger a UI render. |
| Retention | How long a hosted saved copy remains available and when its expired row is purged. |
| Snapshot | An explicitly saved copy of mapped statement data and related corrections. |
| Synthetic data | Artificial transactions designed for a demo or test. |
| TLS | The protocol that protects data in transit for HTTPS. |
| UPI, card, PPI and NACH | Payment mechanisms with different provider workflows. Use the guidance associated with the observed payment route. |

## 10.5 Project records

- [Requirements](../requirements.md) and [design system](../../DESIGN.md)
- [Architecture map](../engineering/architecture.md) and [data contract](../data_contract.md)
- [Feature inventory](../engineering/feature-inventory.md), [roadmap](../engineering/feature-roadmap.md) and [audit findings](../engineering/audit-findings.md)
- [Audit and verdict](../engineering-evaluation/execution-summary.md), [tests](../engineering-evaluation/test-report.md) and [research](../engineering-evaluation/research-report.md)
- [Account Aggregator research](../engineering/account-aggregator-research.md) and [synthetic dataset specification](../../data/dataset_specification.md)

[Contents](README.md) · [Project README](../../README.md)
