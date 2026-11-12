# Architecture audit — current worktree

| Priority | Finding | Proposed correction |
| --- | --- | --- |
| P1 | `milestones.ts:68–80` adds annualized amounts before applying recency and evidence flags. A 100-unit monthly charge with four observations, last seen January 5, 2022, still contributed 1,200 annual units as of November 12, 2026. The output also marked it stale. `ForecastPanel.tsx:23–37,84–99` uses the resulting amounts for savings and infers compared months from observed rows. | Propagate statement coverage, latest supported price, and recency into projections and savings. Keep a stale scenario visible with its assumptions and separate totals. |
| P1 | `src/api.py` derives estimates from the historical median even when the detector keeps a supported price step together. | Use the supported current tier where established and show historical and projected values separately. |
| P1 | CSV overlap matching in `src/private_statement.py:124–141` uses exact occurrences. The importer lacks a review of ambiguous overlaps and explicit date-range provenance. Hosted preview currently uploads before mapping. | Add a local preview, typed coverage and a before/after comparison. |
| P1 | Hosted saved copies are listed by UUID in `HostedWorkspace.tsx`. The local comparison groups currency but does not align coverage periods. | Add names, versions and explicit period-aligned comparison. |
| P2 | `App.tsx` owns navigation, session state and loaded views. Public demo endpoints rebuild overlapping data from fixture CSVs. | Extract typed frontend contracts and feature data hooks incrementally. Evaluate a versioned immutable synthetic snapshot after measuring repeated work. |

The previous amount-tier ownership issue was addressed with disjoint partitions and seven regressions. Parallel variable-price or same-price plans can remain ambiguous. The canonical FastAPI service shares analysis across local and hosted modes. [Implementation log](../engineering/implementation-log.md) · [Current architecture](../architecture.md)
