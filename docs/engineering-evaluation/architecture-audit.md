# Architecture audit — current worktree

| Priority | Finding | Proposed correction |
| --- | --- | --- |
| P1 | `milestones.ts:68–80` adds annualized amounts before applying recency and evidence flags. A 100-unit monthly charge with four observations, last seen January 5, 2022, still contributed 1,200 annual units as of November 12, 2026. The output also marked it stale. `ForecastPanel.tsx:23–37,84–99` uses the resulting amounts for savings and infers compared months from observed rows. | Propagate statement coverage, latest supported price, and recency into projections and savings. Keep a stale scenario visible with its assumptions and separate totals. |
| P1 | `src/api.py` derives estimates from the historical median even when the detector keeps a supported price step together. | Use the supported current tier where established and show historical and projected values separately. |
| P1 | CSV overlap matching uses exact occurrences. Browser preview, mapped-only submission, and review of possible conflicts now ship. Completeness still depends on the statement coverage the user can establish. | Carry explicit coverage into the forecast and use format-specific fixtures to verify mapping and overlap behavior. |
| P1 | Hosted snapshots now support names, versions and common-period comparison. Local comparison still groups results by currency across each saved statement's full history. | Align local comparison periods when coverage is known. |
| P2 | `App.tsx` owns navigation, session state and loaded views. Public demo endpoints rebuild overlapping data from fixture CSVs. | Extract typed frontend contracts and feature data hooks incrementally. Evaluate a versioned immutable synthetic snapshot after measuring repeated work. |

The previous amount-tier ownership issue was addressed with disjoint partitions and seven regressions. Parallel variable-price or same-price plans can remain ambiguous. The canonical FastAPI service shares analysis across local and hosted modes. [Implementation log](../engineering/implementation-log.md) · [Current architecture](../architecture.md)
