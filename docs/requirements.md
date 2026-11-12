# FinSight product requirements

## Current local release

- Analyze the bundled synthetic statement and show recurring candidates with cadence, amount, and supporting evidence.
- Keep observed debits, inferred commitments, and projected payment dates distinguishable.
- Let users review guidance and record cancellation progress locally. A user report must stay distinct from issuer confirmation.
- Show the original regression and separate challenge-suite results with their provenance. The in-app benchmark presents the challenge suite.
- Keep interactive views keyboard accessible and respect reduced-motion preferences.

## Verified release capabilities

- Preview and validate a private CSV with field, date, amount, and currency mapping. Clear the imported session from the current tab.
- Link merchant descriptors explicitly and recalculate inferred commitments. Keep observed history visible alongside user-reported revocation.
- Reproduce the synthetic demo from a clean source snapshot and verify the private workflow on de-identified real data.
- Compare opt-in local workspaces by currency. Preserve separate account analysis and exclude unspecified currency from combined monetary totals.
- Let hosted pilot users preview, save with explicit retention, restore, export and delete owner-scoped snapshots. Local HTTPS browser verification used disposable SQLite.

## Future acceptance gates

- Verify live PostgreSQL isolation, deployment configuration, credential revocation, physical retention and recovery before hosting externally.
- Use an authorized, independently labeled real-data set before reporting real-world generalization. The blinded synthetic merchant holdout remains a regression benchmark.

See the [feature inventory](engineering/feature-inventory.md) for implementation status and the [roadmap](engineering/feature-roadmap.md) for approval candidates.
