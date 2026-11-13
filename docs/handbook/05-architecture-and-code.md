# 05. Architecture and code tour

Architecture describes how work moves between the browser, the server, files and databases. Start with the first trace even if you plan to work on hosted mode. The core analysis is shared.

## Trace 1: Open the synthetic dashboard

1. [start_app.ps1](../../start_app.ps1) creates a temporary runtime directory. It points `FINSIGHT_PROCESSED_DIR` and `FINSIGHT_FRONTEND_DIST` at scratch subdirectories and builds the frontend with a same-origin API URL.
2. [detect_recurring_v3.py](../../src/detect_recurring_v3.py) reads `data/raw/synthetic_transactions.csv` and the configured alias map. It writes detector candidates and one prediction per debit.
3. Uvicorn listens for HTTP requests and calls the FastAPI `app` in [src/api.py](../../src/api.py). The SPA is mounted after API routes. The browser first loads the HTML, then JavaScript and styles.
4. [main.tsx](../../frontend/src/main.tsx) mounts React. [App.tsx](../../frontend/src/App.tsx) fetches summary, transactions, commitments and alerts. The API reads generated CSVs, links evidence and formats JSON. The browser uses the loaded data to display navigation and projections.
5. The **Evaluation & audit** view loads a separate generated artifact. It describes benchmark evidence. It does not change the dataset shown in the ledger.

~~~text
Bundled synthetic CSV ──→ detector ──→ generated CSVs ──→ FastAPI ──→ React
Frozen fixtures ──→ benchmark runner ──→ benchmark-results.json ──→ benchmark view
~~~

A generated file can be recreated from source input and code. Use a disposable output directory while testing detector changes. A rebuild updates what the server serves. A browser refresh by itself cannot regenerate detector files. The optional [Node demo adapter](../../src/server.js) is a separate implementation for synthetic data with contract differences. The Python application is canonical for local and hosted statement workflows.

### Files worth opening first

| File | Question it answers |
| --- | --- |
| [frontend/src/App.tsx](../../frontend/src/App.tsx) | Which view is active? Which dataset is open? How does the details dialog get its data? |
| [src/api.py](../../src/api.py) | Which route handles the request? Which conditions return an error? How are commitments assembled? |
| [src/private_statement.py](../../src/private_statement.py) | How are CSV cells interpreted and normalized? How are repeated rows and refunds handled? |
| [src/detect_recurring_v3.py](../../src/detect_recurring_v3.py) | How do transactions become recurring candidates? |
| [frontend/src/components/milestones.ts](../../frontend/src/components/milestones.ts) | How does a detected cadence turn into a future estimate? |
| [src/hosted_api.py](../../src/hosted_api.py) | Who may exchange a credential or act on a hosted copy? |
| [src/hosted_storage.py](../../src/hosted_storage.py) | Where are rows stored, encrypted, read, or removed? |

## Trace 2: Analyze a CSV

Follow the browser path from [StatementImport.tsx](../../frontend/src/components/StatementImport.tsx) to [importQuality.ts](../../frontend/src/components/importQuality.ts). A CSV parser must distinguish a delimiter from a comma inside quotes, and a line break inside a quoted field from the end of a record. The preview is generated in the browser. After mapping, the browser projects only the selected fields into a new CSV and remaps indices. A title in an unmapped balance column will not be transmitted by the normal UI. Sensitive values in the chosen description field still go to the selected server.

[statementRequest.ts](../../frontend/src/components/statementRequest.ts) sends the payload to the loopback endpoint in local mode or to the configured same-origin HTTPS host in hosted mode. A POST sends a request body. The server does not trust a client merely because the browser has already validated the preview. It checks the origin or authenticated session, request size and JSON, then parses and validates the mapped CSV again.

`analyze_statement` in [api.py](../../src/api.py) coordinates this work:

1. `parse_statement` checks CSV shape. `map_statement` normalizes dates and positive amount magnitudes, assigns directions, and creates statement-local transaction IDs.
2. For overlap review, the server validates the existing mapped rows and computes exact matches and ambiguous additions. A review response does not apply the merge. The apply request recomputes the plan and validates explicit exclusions.
3. Merchant links and dismissals are checked against the current debit descriptors. The analyzer scopes recurring identifiers to the analysis ID.
4. The detector processes debit rows. Refund reconciliation can associate credits with plausible debits separately. The resulting enriched ledger preserves both sides as observed records.
5. `build_commitments` associates transaction evidence with detector candidates. `build_alerts` adds review signals. The frontend replaces or updates the active analysis.

Merchant Review resends mapped records with explicit corrections. Suggestions are proposals. User-confirmed links are the input that changes grouping. To debug a surprising merge, inspect the original descriptions, confirmed links and transaction IDs before looking at projections.

## Trace 3: Understand a candidate

The detector groups normalized descriptors and aliases, sorts transactions, and may split supported parallel price tiers. Each debit enters one partition. Exact price levels are kept together when their evidence supports a single regular stream. Overlapping independently regular price tiers may become separate commitments.

The detector measures intervals between charges. Monthly, quarterly and annual are regular cadence categories. The calendar-aware path evaluates possible billing slots and tolerates limited posting drift or a missing slot. Some series receive an irregular classification. Review flags mark evidence such as unusually different amounts. A qualifying nominal INR start can remain in a recurring stream. The result is a hypothesis from observed records, with heuristic confidence and evidence.

A small example shows why the distinction matters. Three debits around the last day of each month can support a month-end pattern even when February is shorter. February 28 is an observed posting date. The fitted billing day can still be 31. The forecast should clamp a slot to the last day of the target month and return to day 31 when the month supports it.

A candidate ID joins predictions to generated candidates. A commitment ID identifies an inferred pattern for the browser and can change when evidence or grouping changes. A bank reference, an analysis UUID and a hosted snapshot UUID identify different things. Never use a guessed recurrence or an ID to tell a user that their bank mandate exists or has been revoked.

## Trace 4: Follow a browser feature

`App.tsx` sets the active view and passes data into components. Navigation is primarily a page state within one workspace. It is not a set of standalone server pages. This map helps locate an interaction.

| Feature | Starting point | Data used |
| --- | --- | --- |
| Subscription timeline | [SubscriptionTimeline.tsx](../../frontend/src/components/SubscriptionTimeline.tsx) | Commitments, dates, amounts and linked transactions. |
| Forecast and savings | [ForecastPanel.tsx](../../frontend/src/components/ForecastPanel.tsx) | Fitted or observed billing dates, heuristic amounts, selection and review state. |
| Cash buffer | [CashBufferPlanner.tsx](../../frontend/src/components/CashBufferPlanner.tsx) | A user-entered balance and selected projected debits. Values live in the component state. |
| Calendar export | [ReminderPanel.tsx](../../frontend/src/components/ReminderPanel.tsx) and [calendarExport.ts](../../frontend/src/components/calendarExport.ts) | Selected supported estimates. The browser creates a download. |
| Commitment activity | [CommitmentActivityPanel.tsx](../../frontend/src/components/CommitmentActivityPanel.tsx) and [commitmentActivity.ts](../../frontend/src/components/commitmentActivity.ts) | Linked transactions, review signals and a user revocation report. |
| Mandate tracker | [RevocationTracker.tsx](../../frontend/src/components/RevocationTracker.tsx) | Provider guidance, checked steps and explicit user report. |
| Hosted copies | [HostedWorkspace.tsx](../../frontend/src/components/HostedWorkspace.tsx) | Session token, owner-scoped snapshot summaries, versions and comparison. |

Styling starts with CSS custom properties, named values such as `--inset` used across views. The animation libraries add GSAP transitions and a React Three Fiber seal with a non-WebGL fallback. Reduced-motion behavior should remain functional. Keep a user-facing value, such as a warning or date, in accessible HTML even when adding motion.

## Trace 5: Save a copy

A statement analysis is transient unless the user saves. A named local SQLite workspace stores normalized rows and merchant decisions. Local restoration reruns analysis. The database file relies on local filesystem access controls. Hosted storage is separate. No code copies a local SQLite database into PostgreSQL as part of signing in.

Hosted mode exchanges an operator-provisioned credential for a one-hour bearer session. The server stores a digest and resolves it on subsequent requests. A successful save normalizes the selected fields and encrypts the snapshot with AES-GCM. The owner UUID and statement UUID are bound to the ciphertext. Snapshot name and period details are encrypted in separate metadata. Operational columns such as ID, owner, expiry and version allow indexing and lifecycle management. Alembic revisions evolve the schema.

Each owner has a quota. Listings use pages and an expiry-and-ID cursor. The snapshot table has expiry and owner indexes so queries can select one owner's active copies. The API filters by owner and expiry. Hosted comparison uses the inclusive intersection of selected statement periods and keeps each statement's totals separate by currency. This avoids adding two versions of the same snapshot together.

Deleting a live snapshot and expiring copies in the active database are separate from backup retention. A database restore needs operational deletion reconciliation and session invalidation. The [security audit](../engineering-evaluation/security-audit.md) records release gaps, including deployment role boundaries and shared ingress limits.

## Trace 6: Verify behavior without tuning to the answer key

The original synthetic replay exercises the bundled demo. [benchmark_holdout.py](../../src/benchmark_holdout.py) runs the synthetic adversarial fixture and writes the dashboard artifact. [evaluate_merchant_holdout.py](../../src/evaluate_merchant_holdout.py) scores a separately labeled synthetic merchant fixture and reports debit metrics, cadence and exact commitment recovery.

Labels are the expected answers used by evaluators. They must stay out of prediction inputs. A false positive is a debit predicted to recur when its label says it does not. A false negative is a missed recurring debit. Precision measures the share of predicted recurring debits that match the labels. Recall measures the share of labeled recurring debits recovered. F1 combines the two. A synthetic fixture checks known scenarios. It cannot establish real-world accuracy.

The real-data browser workflow checks authorized import and browser behavior. It does not have recurrence labels. Before experimenting with model changes, freeze a labeled evaluation set, keep real records outside Git, and avoid tuning against the benchmark used for final comparison.

## Exercises

1. Open the synthetic ledger and trace one displayed transaction from its ID through `/api/transactions` and the source CSV.
2. Compare `first_observed_date`, `last_observed_date` and `billing_anchor_date` for a detected recurring commitment. Explain each field in plain language.
3. Open the forecast helper and trace the condition that prevents an irregular cadence from producing a projected date.
4. Open `tests/test_detector_amount_tiers.py` and identify the assertion that proves one transaction cannot belong to two different displayed commitments in the test.

Continue to [API and data](06-api-and-data.md) for concrete request examples and field rules.

