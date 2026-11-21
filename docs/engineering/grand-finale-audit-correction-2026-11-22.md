# Grand-finale audit correction — 22 November 2026

## Correction

The 21 November discovery report was based on the checkout at `9e33707`.
That was not the latest merged project state. The current checkout is:

- Repository: `C:/projects/Fintech-Recurring-Intelligence`
- Branch: `main`
- HEAD: `2bad6e8`
- `0a3efb35` is an ancestor of HEAD through the Sarvam/frontend merge.
- `main` is one local commit ahead of `origin/main` (`80378b2`).
- One worktree is registered; no separate active worktree was found.

The previous “missing” labels for Sarvam, the Neo4j explorer UI, and the
freelancer planner were stale and are withdrawn.

## Current feature status

| Feature | Current assessment | Evidence |
|---|---|---|
| Sarvam AI | Implemented locally; live provider verification requires `SARVAM_API_KEY`. | `src/sarvam_service.py`, `src/assistant_routes.py`, `src/sarvam_app.py`, `frontend/src/services/sarvamClient.ts`, `frontend/src/components/LedgerAssistant.tsx` |
| Neo4j evidence explorer | Implemented locally; live graph lookup remains unverified/partial. | `frontend/src/components/GraphEvidencePanel.tsx`, `frontend/src/services/graphEvidence.ts`, `frontend/src/App.tsx:858-860` |
| Freelancer planner | Implemented as a local selection-and-forecast journey; durable saved labels remain intentionally unavailable. | `frontend/src/components/BusinessExpensePlanner.tsx`, `frontend/src/App.tsx:638-640`, `docs/engineering/finale-runbook.md` |
| Forecast reliability UI | Implemented for current data with freshness/coverage caveats; contract still needs declared statement coverage for stronger claims. | `frontend/src/components/ForecastPanel.tsx`, `src/api.py:277-338`, `docs/engineering/finale-runbook.md` |
| ArgosX documentation | Present, but the baseline PDF and final scanner result are not in the repository. | `docs/engineering/argosx-remediation.md:1-18` |
| Market/customer evidence | Not inventable from repository inspection. | `docs/engineering/finale-runbook.md:29-30` says actual interview evidence is retained outside Git. |

## Fresh verification in this environment

- Raw frontend Node test command discovered 30 tests: **25 passed, 5 failed**.
  The five failures are all `localStorage is not defined` in
  `frontend/tests/revocationStorage.test.mjs`; this is a harness mismatch, not
  evidence that the feature implementation is absent. The project runbook
  records the browser/local-storage harness result as 30 passed.
- `npm run lint --prefix frontend` could not be reproduced because installed
  `frontend/node_modules` lacks `@eslint/js`.
- `npm run build --prefix frontend` could not be reproduced because installed
  `frontend/node_modules` lacks `vite/client` and Node type definitions.
- The targeted Python run did not finish within the command window; this is
  consistent with the current Neo4j availability probe and is not reported as
  a passing result.

## Remaining current risks (not stale feature gaps)

1. `src/api.py:771-775` calls `is_available()` synchronously before starting
   the ingestion thread. `src/neo4j_service.py:40-47` calls
   `verify_connectivity()` without an explicit bounded timeout. A missing Neo4j
   instance can therefore delay private statement analysis.
2. The graph read route requires `analysis_id`, but it has no authenticated
   owner boundary (`src/graph_routes.py:16-34`). The UI disables hosted lookup,
   which limits exposure locally, but this is not sufficient for a hosted
   rollout.
3. `src/neo4j_service.py:76-83` can create descriptor nodes from a transaction
   merged only by ID without explicitly setting its description in that branch;
   `merchant_display_name` is also not used. Live graph verification should
   confirm descriptor and merchant evidence quality.
4. Business labels remain process-memory only
   (`src/graph_routes.py:9,55-60`); the freelancer planner itself is working
   locally but does not provide durable personal/business classification.
5. `src/api.py:767-769` builds commitments inside the transaction loop. This is
   a current code defect candidate: repeated work occurs for each transaction,
   and an empty transaction list can leave `commitments` unbound.

## Final corrected conclusion

The project was not correctly characterized as missing the Member 2 features.
The latest merged code contains those features and supporting tests/docs. The
appropriate release status is:

**Feature-complete locally for the planned Sarvam, explorer, freelancer, and
forecast journeys; not yet fully release-verified for live Sarvam/Neo4j,
deployment security, durable freelancer labels, or external ArgosX/interview
artifacts.**

The earlier discovery report should be read as superseded for feature presence,
while its Neo4j reliability and authorization concerns remain valid pending
targeted fixes or live verification.
