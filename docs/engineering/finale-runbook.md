# FinSight finale runbook

## Sarvam setup

On Windows, set `SARVAM_API_KEY` in the PowerShell process that will launch FinSight. A secure prompt keeps the value out of shell history.

```powershell
$sarvamSecret = Read-Host 'Sarvam API key' -AsSecureString
$env:SARVAM_API_KEY = [System.Net.NetworkCredential]::new('', $sarvamSecret).Password
& '.\Run FinSight.cmd'
```

For Render, add `SARVAM_API_KEY` under **Web Service → Environment** on the backend service and restart or redeploy the approved release. Keep it out of Git, frontend environment variables, logs, URLs and screenshots. The service must run `src.sarvam_app:app`; the repository Docker default currently runs `src.api:app`. Confirm the entrypoint and public request controls with Member 1 before exposing a key-backed route. [Render environment variables](https://render.com/docs/configure-environment-variables)

Choose **Ask FinSight → supported forecast question → हिन्दी → consent → Explain with Sarvam AI** on synthetic data. An actual successful response containing a Hindi explanation is the live verification. If unavailable, continue the demo with the local evidence.

## Deployment and backend handoff

- Graph lookup uses `GET /api/graph/commitment/{commitment_id}/evidence?analysis_id=...`. Member 1 must bring the graph router and ingestion hook into the release, configure `NEO4J_URI`, `NEO4J_USER` and `NEO4J_PASSWORD` on the backend, confirm ingestion for the demo fixture and verify a successful lookup. The current contract conflates a missing graph record with a 503. Hosted lookup also needs an authenticated owner-scoped contract. Use an imported synthetic statement for the graph rehearsal.
- Keep the graph rehearsal loopback-only with synthetic records. On `origin/main`, the shared analyzer can send transaction descriptions, amounts, and dates from hosted imports to Neo4j, and `src/graph_routes.py` has no owner check on graph reads. The frontend disables hosted graph lookup. Before any private or public graph rollout, Member 1 must gate ingestion by data scope and authorize graph reads by owner.
- The classification routes on `origin/main` are `POST /api/graph/commitment/{commitment_id}/classify?analysis_id=...` with `expense_category: "business" | "personal"` and `GET /api/graph/commitments/classified?analysis_id=...`. Their process-memory dictionary clears on restart. Member 1 must provide durable owner-scoped reads and writes, with a documented statement/commitment identity lifetime, before enabling saved classification controls. The local planner sends no classification requests.
- Forecast uses loaded transaction dates and the existing commitment `transaction_count`, cadence, and last observed debit. To distinguish actual incomplete coverage from an observed range, provide declared coverage start/end, completeness or known gaps, and a freshness/as-of timestamp with its meaning and source. A local 90-day warning uses the latest loaded transaction date.
- For an approved public landing page, build with `FINSIGHT_PUBLIC_ORIGIN` set to its HTTPS origin. Set it for the **frontend build**, including passing it into the build stage if Docker is used. Leave it unset for private or provisional deployments.

## Submission

1. Agree on the release candidate and the presentation startup path with Member 1. Check readiness after a cold start.
2. Rehearse the same synthetic fixture that will appear on stage. Confirm graph ingestion and the live Hindi call on that machine.
3. Verify the production URLs and headers in the remediation log. Record a fresh ArgosX result only after running the scanner.
4. Retain the baseline PDF and actual interview evidence outside Git. Include only consented, anonymized findings in the submission.

## Local verification

The browser run used the Windows local launcher and an imported synthetic CSV. Screenshots are under the ignored `.finsight-run/finale-browser/` directory.

| Journey | Status | Endpoint and evidence |
| --- | --- | --- |
| Import statement → Analyze statement → Recurring payments → View Demo Paper Desk | Working | `POST /api/private-statement` returned 200 and the details dialog showed detection evidence. |
| Recurring payments → commitment details → Relationship evidence → Load graph evidence | Partial | The live local lookup returned 404. The fallback is visible in `02-relationship-unavailable.png`. Response parsing is unit-tested. Successful Neo4j connectivity remains pending. |
| Forecast → Forecast reliability → 30-day debit calendar | Working for current data | Uses loaded statement response, or the synthetic `GET /api/transactions` and `GET /api/commitments` data. Verified stale synthetic dates, coverage caveat, limited observations, and a projected charge with the imported CSV. See `01-stale-forecast.png` and `04-imported-forecast.png`. |
| Recurring payments → Freelancer business-cost planner → include and filter | Working for this view | Reuses loaded commitments and the existing forecast calculations without a classification request. See `03-business-planner.png`. Saved labels remain blocked. |
| Ask FinSight → 7-day question → Hindi → consent → Explain with Sarvam AI | Partial | `POST /api/assistant/explain` returned real HTTP 503 without a key. See `05-sarvam-missing-key.png`. Browser stubs verified English/Hindi request selection, Hindi display and stale response suppression. Local evidence stayed visible. |

The production build and targeted ESLint passed. Frontend tests reported 30 passed. Backend tests reported 73 passed, 1 skipped, and a Starlette TestClient deprecation warning. Browser assertions passed on rerun after correcting a selector for the navigation item’s count badge. The browser logged the expected graph 404 and assistant 503, plus a Three.js clock deprecation warning.
