# Baseline verification — 12 November 2026

| Check | Command or procedure | Result |
| --- | --- | --- |
| Frontend build | From frontend, `npm run build -- --outDir <temp> --emptyOutDir` | Exit 0. Vite 8.3.5, 1,963 modules. Existing lazy WebGL chunk 923.54 kB minified / 244.35 kB gzip and size warning |
| Frontend lint | From frontend, `npm run lint` | Exit 0 |
| Frontend tests | `node --localstorage-file=<temp> --test frontend/tests/*.test.mjs frontend/revocation-guide.test.mjs` | 10 passed, 0 failed |
| Python benchmark tests | `python -m unittest discover -s tests -p test_benchmark_holdout.py` | 2 passed |
| Full Python suite | With declared requirements installed into isolated temp target and PYTHONPATH set, `python -m pytest -q -p no:cacheprovider` | 16 passed, 1 warning in 0.95 s. Starlette TestClient/httpx deprecation; pytest-asyncio also emitted an unset fixture scope notice |
| Original demo regression | V3 detector and evaluator with CSV output paths redirected to temporary files | 56 debits, 10 groups, TP 45, FP 0, TN 11, FN 0; precision, recall, F1 all 1.000 |
| Challenge replay | `src.benchmark_holdout.evaluate()` in memory; compare to bundled JSON | Exact artifact match. 32 debits, 8 cases, 10 merchant keys, TP 16, FP 4, TN 5, FN 7. Precision 80.0%, recall 69.6%, F1 74.4% |
| npm advisory check | `npm audit --json`; `npm audit --omit=dev --json` | Full audit exited 1 with 10 moderate dependency entries attributable to one dev-toolchain advisory. Production-only exited 0 with 0 findings |

Node 26.13.0, npm 11.20.0, and bundled Python 3.12.14 were used. The working-copy virtual environment points at a missing Python 3.14 executable. Tests used an isolated Python dependency directory instead. Detector outputs and Vite builds used temporary directories. This audit did not repeat browser interaction testing. Earlier feature verification is recorded in the implementation reports.

## Exploratory detector checks

A temporary CSV carried 17 synthetic debits in four groups. V3 classified four observations with one skipped monthly cycle as monthly, classified a same-day duplicate as recurring without a review flag, rejected four weekly charges as non-recurring, and split a monthly price drop into tiers that missed the first two charges. These probes do not contribute to either published benchmark.

Registry advisory: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Python advisory scanning was outside this run.

## Release verification

This file records the pre-release audit baseline. The final local release passed 25 Python tests, 10 frontend tests, lint, the clean-checkout build, and synthetic and real-data Chromium workflows. See the [final release verification](implementation-log.md#final-release-verification).

## Current audit

The 12 November 2026 rerun is recorded in the [current test report](../engineering-evaluation/test-report.md), including fresh build, lint, Python, frontend, Chromium and holdout results. The earlier entries on this page are historical baselines.
