# Feature 7 implementation

Open **Evaluation & audit** in FinSight. The dashboard displays animated benchmark KPIs, a filterable confusion matrix, scenario bars, and the input and output for each synthetic debit. The evidence includes the fixture label, detector classification, cadence, heuristic score, and rationale. GSAP respects reduced motion. The app reads the generated JSON at build time, so the dashboard works without a live benchmark endpoint.

## Provenance and scope

V3 processes debits, normalizes descriptors with an optional alias map, splits some amount tiers, and detects monthly, quarterly, annual, or irregular recurrence from timing and amount rules. It assigns per-transaction predictions, flags amount outliers, and emits a heuristic score. The score is not a calibrated probability.

The existing V3 evaluator replays the repository's synthetic transaction and ground-truth CSVs. A fresh replay returned 45 TP, 0 FP, 11 TN, and 0 FN across 56 debits, with precision, recall, and F1 each 1.000. The repository provides no established independent split for that benchmark, and its alias configuration explicitly names cases in the original corpus.

The Feature 7 fixtures are 32 separately authored synthetic debits across eight scenarios. The scenario premises supply the binary labels before scoring. All ten resolved merchant keys are distinct from the original corpus and from other scenario groups. The runner uses the unchanged V3 detector and existing alias configuration. It writes input and intermediate predictions into a temporary directory and joins predictions to the fixture labels by ID. Detector, fixture, and alias fingerprints are recorded in the artifact. No detector rules or aliases were tuned against the suite.

This is a preliminary synthetic holdout replay. The cases were authored with knowledge of the detector and drawn from a small, deliberately challenging set. They were not independently collected, randomly sampled, or drawn from bank data. Results measure debit-level classification, and do not score cadence correctness, merchant resolution accuracy, or commitment-level generalization.

## Reproduce

Run these from the repository root with Python 3.10 or newer.

```powershell
python -m src.benchmark_holdout
python -m unittest discover -s tests -p test_benchmark_holdout.py
```

The first command regenerates `frontend/src/components/benchmark-results.json`. The second verifies the confusion formulas, one result per debit, per-scenario totals, deterministic replay, and agreement with the checked-in artifact. For a production frontend refresh, rebuild from `frontend` with `npm run build`.

| Evaluated debits | TP | FP | TN | FN | Precision | Recall | F1 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 16 | 4 | 5 | 7 | 80.0% | 69.6% | 74.4% |

Precision is TP / (TP + FP). Recall is TP / (TP + FN). F1 is 2TP / (2TP + FP + FN). Undefined denominators render as unavailable.

V3 classified all four separately authorized monthly purchases as recurring. It missed four recurring debits in the descriptor-change case, two with incomplete history, and one variable-amount debit. The shifted-date case matched all four binary labels through the irregular fallback. The explorer shows that cadence in the row evidence.

## Verification

- The benchmark generation command completed and both Python unit tests passed. The installed Python runtime lacked pytest, so the existing pytest API suite could not start.
- Frontend build and lint exited 0. All 10 existing focused frontend tests passed. Vite reported the existing lazy-loaded 3D bundle size warning.
- Chromium against the local demo API verified Overview data, navigation to Evaluation & audit, the displayed benchmark totals, keyboard activation of confusion cells, filtered scenario and transaction evidence, and the 375 px layout with reduced motion.

## Implementation files

- `src/benchmark_holdout.py`
- `data/raw/adversarial_benchmark_v1.json`
- `tests/test_benchmark_holdout.py`
- `frontend/src/components/benchmark-results.json`
- `frontend/src/components/BenchmarkDashboard.tsx`
- `frontend/src/components/BenchmarkDashboard.css`
- `frontend/src/App.tsx`
