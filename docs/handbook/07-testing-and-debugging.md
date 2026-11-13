# 7. Test, evaluate and debug

[Contents](README.md) · [Previous chapter](06-api-and-data.md) · [Next chapter](08-hosted-operations.md)

## 7.1 What counts as evidence

A unit test checks a small piece of behavior in isolation. An API test checks a request and response through the server. A browser test exercises the built app in Chromium. A build checks TypeScript and produces deployable files. A linter checks code conventions and potential errors. A benchmark compares predictions with labeled fixtures. Each check answers a different question.

| Question | Use |
| --- | --- |
| Will the production frontend compile? | `npm run build --prefix frontend` or the scratch launcher. |
| Did a small calculation change? | A focused Node or Python test. |
| Can a person complete the workflow? | A Playwright browser script against the real app. |
| Can another owner see the saved data? | Hosted API tests and a two-owner HTTPS browser workflow. |
| Did detection behavior change? | The frozen challenge and merchant holdout, with counts and case inspection. |
| Will the whole change survive a fresh environment? | A clean install and the repository CI workflow. |

A green test is evidence for its assertions and inputs. A skip means its check did not run. An existing warning can coexist with an exit code of zero. Record the command, environment, result, and scope when reporting evidence.

## 7.2 Windows smoke and focused tests

From the root, using the virtual environment from chapter 1:

```powershell
.\start_app.ps1 -Python .\.venv\Scripts\python.exe -Smoke
npm run lint --prefix frontend
$testStorage = Join-Path $env:TEMP ('finsight-tests-' + [guid]::NewGuid() + '.json')
node "--localstorage-file=$testStorage" --test frontend/tests/*.test.mjs frontend/revocation-guide.test.mjs
```

The launcher builds and runs pytest with scratch outputs. To run just the detector regressions or CSV importer tests:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests/test_detector_amount_tiers.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_import_quality.py
node --test frontend/tests/calendarExport.test.mjs
```

A pytest dot means a test passed. A failure prints the test name, the failing assertion, and the observed result. Read the first failure from the assertion upward before trying several changes at once. `-k overlap` filters by test name. `-x` stops on the first failure.

Hosted Python tests need `requirements-hosted.txt`. With that installed and no `FINSIGHT_TEST_POSTGRES_URL`, most hosted tests use temporary SQLite. PostgreSQL-only checks can skip. Set `FINSIGHT_TEST_POSTGRES_URL` only to a disposable test PostgreSQL service. The fixture creates a separate schema and removes that schema at teardown. See [Hosted operations](08-hosted-operations.md).

## 7.3 Run the browser tests

Playwright sends real clicks, uploads and keyboard events to Chromium. Use a disposable app instance. The private smoke can save and delete snapshots when local storage is enabled. Avoid pointing a test at a personal workspace.

One approach is to install Playwright into a temporary tool directory. This keeps it out of the frontend dependency manifest.

```powershell
$browserTools = Join-Path $env:TEMP ('finsight-browser-' + [guid]::NewGuid())
npm install --prefix $browserTools --no-save --no-audit --no-fund playwright@1.65.0
node (Join-Path $browserTools 'node_modules/playwright/cli.js') install chromium
$env:FINSIGHT_PLAYWRIGHT = Join-Path $browserTools 'node_modules/playwright/index.mjs'
$env:FINSIGHT_SMOKE_ORIGIN = 'http://127.0.0.1:8000'
node frontend/tests/private-statement.browser.mjs
node frontend/tests/calendar-export.browser.mjs
```

Start the app in a separate terminal first. To exercise local saves, point both terminals at the same fresh absolute `FINSIGHT_LOCAL_DB` path outside the repository. The browser script uses the variable to decide whether to exercise saves, and the server uses it to open the database. The calendar smoke uses a deterministic synthetic fixture and checks the downloaded file.

| Script under `frontend/tests/` | Purpose |
| --- | --- |
| `private-statement.browser.mjs` | Local preview, import, review, activity download, cash planning, and optional SQLite. |
| `calendar-export.browser.mjs` | Selection, redaction, optional disclosure and the downloaded iCalendar file. |
| `hosted-statement.browser.mjs` | HTTPS session lifecycle, mapped upload, owner switch, pagination, restore and delete. |
| `hosted-account-history.browser.mjs` | Named saves, period comparison and atomic replacement. |
| `moneydata.browser.mjs` | Workflow exercise on a locally supplied authorized dataset. |
| `deployment.browser.mjs` | Synthetic Docker profile and absence of private import navigation. |

Read each script's top-level environment requirements before running it. The hosted scripts use synthetic operator credentials and an HTTPS disposable service. The MoneyData harness takes `FINSIGHT_MONEYDATA_CSV`. Use the [historical implementation notes](../engineering/implementation-log.md) for dataset provenance and evidence.

## 7.4 Read detector metrics

The detector predicts whether each debit belongs to a recurring pattern. Ground truth is a separate label.

- A **true positive** is a recurring debit predicted as recurring.
- A **false positive** is a nonrecurring debit predicted as recurring.
- A **true negative** is a nonrecurring debit predicted as nonrecurring.
- A **false negative** is a recurring debit the detector missed.

Precision divides true positives by predicted positives. Recall divides true positives by labeled positives. F1 is the harmonic mean of precision and recall. For the 32-debit challenge, 16 true positives and 4 false positives give precision `16 / 20 = 80%`. Seven false negatives give recall `16 / 23 ≈ 69.57%`. Together they give F1 about 74.42%.

```powershell
.\.venv\Scripts\python.exe -m src.benchmark_holdout --compare-calendar
.\.venv\Scripts\python.exe -m src.evaluate_merchant_holdout
```

The first command compares calendar fitting with the baseline. The second reports debit metrics, cadence and exact commitment recovery for the blinded synthetic fixture. With no proposed merchant links, suggestion precision has no denominator. Debit-level F1 and exact commitment recovery measure different things. The latter expects the correct set of debits in a commitment.

The original bundled fixture is a demo regression. The two holdouts are synthetic. The MoneyData workflow exercised import at realistic volume and lacked labels for recurring-payment accuracy. Preserve these distinctions in charts, reports and presentations.

Running `python -m src.benchmark_holdout` without arguments writes the artifact imported by the evaluation dashboard. Regenerate it when changing detector behavior or the fingerprint. Check the diff and record any metric change. Preserve frozen fixture labels during evaluation.

## 7.5 A debugging recipe

1. Write down the profile, browser origin, and exact action.
2. Try the action with the smallest synthetic fixture that exhibits the problem.
3. In the browser Network tab, inspect the method, endpoint, status, and response shape. Keep tokens and private rows out of screenshots and logs.
4. Compare the observed request with the contract in [API and data](06-api-and-data.md).
5. Follow the response into the component. Look for stale state, duplicate React keys, and assumptions about empty arrays.
6. Add a regression check that would fail before your change.
7. Run the smallest test first. Then run the wider suite and browser path that use the affected code.

Examples include a forecast that includes a stale debit, two accounts whose date ranges do not intersect, and a canceled import that should leave the current analysis intact. Test the data states deliberately rather than trying to reproduce them with a real financial account.

## 7.6 CI and interpreting results

The repository workflow has a standard verification job and a hosted PostgreSQL job. The standard job installs dependencies, generates the demo, builds, runs lint and tests, runs local browser smokes, and attempts a Docker image smoke. The hosted job installs hosted dependencies, applies migrations to disposable PostgreSQL, builds the hosted frontend, and runs HTTPS browser tests with synthetic owners.

A workflow file is configuration. Verify an actual run before reporting that CI passed. Likewise, a passing disposable PostgreSQL test does not establish production role separation, gateway limits, backup retention or recovery policy. Record those as separate checks. [Workflow](../../.github/workflows/verify.yml) · [Test evidence](../engineering-evaluation/test-report.md)

[Contents](README.md) · [Hosted operations](08-hosted-operations.md)
