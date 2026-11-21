# FinSight grand-finale discovery — 21 November 2026

## Scope and decision gate

This is a read-only Stage 1 assessment of the current working tree against the
CTRL+SLOTH finale plan. No application source, tests, configuration, or user
data were changed. The working tree already contained uncommitted edits; those
were preserved and assessed as-is.

## Working-tree state

- Base commit: `9e33707` (`test: add test payload json file with transaction data`).
- Existing uncommitted files: `src/api.py`, `src/graph_routes.py`.
- Existing untracked files: `pytest.ini`, `tests/test_neo4j_service.py`.
- Recent commits already introduce `src/neo4j_service.py` and graph routing.

## Actual architecture

1. `src/api.py` exposes the local FastAPI app and imports the V3 detector.
   Private CSV analysis maps rows, runs `detect()`, builds commitments, alerts,
   and a forecast-oriented response.
2. The current working tree calls `is_available()` synchronously during private
   analysis, then starts a daemon thread for graph ingestion
   (`src/api.py:764-797`).
3. `src/neo4j_service.py` creates `Analysis`, `Transaction`, `Descriptor`,
   `Merchant`, and `Commitment` nodes with `MERGE`, and exposes a commitment
   evidence query scoped by `analysis_id` (`src/neo4j_service.py:50-172`).
4. `src/graph_routes.py` mounts evidence and classification routes under
   `/api/graph` (`src/api.py:70-76`). Classifications are held in the module
   `_classifications` dictionary, not durable storage
   (`src/graph_routes.py:9,55-60`).
5. The React app currently renders detector evidence and local commitment
   activity, but contains no request to `/api/graph` and no Neo4j evidence panel
   (`frontend/src/App.tsx:810-885`; repository-wide search found no frontend
   graph/evidence API call).

## Finale feature status

| Finale requirement | Status | Evidence |
|---|---|---|
| Neo4j connection and graph ingestion | Partial | Service and ingestion hook exist, but availability is synchronous and live DB behavior was not verified. |
| Idempotent, analysis-scoped graph evidence API | Partial | `MERGE` and scoped query exist; tests mock the driver/evidence response and do not prove a live Neo4j round trip (`tests/test_neo4j_service.py:27-173`). |
| Neo4j evidence explorer UI | Missing | No frontend call to the graph routes; commitment modal only shows detector evidence (`frontend/src/App.tsx:843-851`). |
| Forecast freshness/coverage warnings | Partial | Backend `compute_forecast_quality` exists in the uncommitted `src/api.py:273-329`, but it uses `date.today()`, lacks statement-range coverage, has no regression test, and is not rendered by `ForecastPanel.tsx`. |
| Freelancer business/personal workflow | Partial | Classification routes exist, but state is process-local and `/summary/business` returns count/IDs only; no expenditure total or frontend controls (`src/graph_routes.py:37-111`). |
| Sarvam multilingual assistant | Missing | `LedgerAssistant.tsx` uses deterministic local `answerLedgerQuestion`; no Sarvam service or assistant route exists. |
| ArgosX baseline/final reports | Missing from repository | No ArgosX report artifacts or remediation log were found. |
| Three customer interviews | Not evidenced | No interview records were found; customer feedback must be supplied by the team, not invented by the agent. |
| Market Fit Canvas / Persona Matrix | Not evidenced | No current finale submission artifacts were found. |

## Confirmed technical findings

### P0 — Neo4j outage can stall statement analysis

`src/api.py:766-768` calls `is_available()` before starting the background
thread. `src/neo4j_service.py:40-47` calls the driver's default
`verify_connectivity()` with no explicit short timeout. A local run with no
reachable Neo4j did not complete the full pytest command within 30 seconds;
this path is the leading verified cause and needs an explicit bounded timeout or
non-blocking health strategy before the live demo.

### P0 — Live graph integration is not proven

The Neo4j tests patch both the driver and the route's evidence function
(`tests/test_neo4j_service.py:74-93`, `136-155`). They verify mocked control
flow, not creation/query behavior against a Neo4j instance. The finale claim
“real graph queries, not hardcoded demo JSON” therefore remains unverified.

### P1 — Graph evidence data can be incomplete

The ingestion query creates descriptor nodes from `tx.description` in the
commitment loop (`src/neo4j_service.py:76-83`), but does not explicitly set the
description on a transaction first created there. It also ignores
`merchant_display_name` and does not persist commitment-to-merchant or
analysis-to-commitment relationships. The evidence response consequently does
not yet prove the complete descriptor/merchant trace promised by the plan.

### P1 — Forecast quality is not yet an end-to-end feature

The uncommitted backend metadata checks observation count and days since the
last observation (`src/api.py:300-327`), but statement coverage is inferred from
the first/last commitment transaction rather than the imported statement's
actual date range (`src/api.py:288-296`). `ForecastPanel.tsx` only reports
unestimated entries and does not render this metadata (`frontend/src/components/ForecastPanel.tsx:41-50`).

### P1 — Business analysis is not an expenditure workflow

`/api/graph/summary/business` counts classified commitments and returns their
IDs (`src/graph_routes.py:97-111`); it does not sum observed or estimated costs.
The classifications are lost on process restart and are not attached to the
analysis payload or Neo4j graph (`src/graph_routes.py:9,55-60`).

### P1 — Existing working-tree source needs a regression check

In `src/api.py:762`, `commitments = build_commitments(...)` is indented inside
the transaction loop. This should be reviewed against the intended contract:
with an empty transaction list, `commitments` can remain unbound; with multiple
transactions, the same build is repeated unnecessarily.

## Baseline verification evidence

Commands were run from the repository root using the existing `.venv` and
frontend `node_modules`.

| Check | Result |
|---|---|
| Selected detector/import/merchant tests | **24 passed in 2.52s** |
| `pytest tests -q` | Did not complete within the 30-second command window; no pass claim made. |
| `pytest tests/test_api.py -q` | Did not complete within the 20-second command window; no pass claim made. |
| `pytest tests/test_neo4j_service.py -q` | Did not complete within the 20-second command window; no pass claim made. |
| `npm test --prefix frontend -- --runInBand` | Failed: frontend has no `test` script. |
| `npm run lint --prefix frontend` | Failed: `@eslint/js` is missing from installed `node_modules`. |
| `npm run build --prefix frontend` | Failed: `vite/client` and `node` type definitions are missing from installed `node_modules`. |

The frontend dependency tree is incomplete relative to `frontend/package.json`;
dependency installation is required before frontend verification can be rerun.

## Prioritized roadmap for Stage 2 approval

1. **P0: Make the primary private-import path resilient and testable.** Fix the
   `commitments` scope issue, bound Neo4j connectivity, add a configurable
   graph-disabled mode, and add tests for unavailable Neo4j and empty imports.
2. **P0: Complete and prove the Neo4j contract.** Define node/relationship
   properties, add constraints/indexes, preserve all transaction evidence,
   run a disposable real Neo4j integration test, and verify analysis isolation.
3. **P0: Ship the evidence explorer UI.** Add loading, empty, error, unresolved
   merchant, and accessibility states to the commitment detail view.
4. **P1: Finish the freelancer journey.** Persist classification within the
   analysis/session contract, calculate estimated recurring business spend, add
   filters and controls, and test the full flow.
5. **P1: Make forecast uncertainty visible and correct.** Carry statement
   coverage/recency from import metadata, exclude unsupported totals where
   required, render warnings, and add regression cases.
6. **P1: Restore a reproducible frontend verification environment.** Install
   lockfile dependencies in a clean environment, add the intended frontend test
   script if required, and rerun lint/build/browser checks.
7. **P2: Sarvam integration only after mandatory paths pass.** Keep it
   server-side, consent-gated, structured-data-grounded, and rule-based by
   fallback. The current repository has no implementation to validate.
8. **Submission evidence:** ArgosX reports, remediation log, customer
   interviews, market canvas, and persona matrix must be supplied or completed
   by the team; no synthetic evidence should be presented as real validation.

## Approval gate

Stage 2 implementation is intentionally paused. Select one approved feature
scope, preferably item 1–3 as a coherent Neo4j MVP slice, before any source
changes are made.
