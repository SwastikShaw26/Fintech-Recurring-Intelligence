# Current feature inventory

| Capability | Current state |
| --- | --- |
| Recurring detector | Calendar and interval heuristics, exact aliases, disjoint amount-tier assignment and irregular fallback. Similar variable tiers and same-price plans can still be ambiguous. |
| Statement import | Browser-side CSV preview, mapped-only submission, versioned layout presets, overlap review and refund suggestions. The earlier MoneyData workflow handled 6,567 de-identified rows. |
| Merchant review | Explainable alias, normalization and spelling suggestions. Confirm, dismiss or undo links and recalculate while preserving original descriptions. |
| Forecast and timeline | Fitted calendar anchors, a 30-day forecast, monthly and annual estimates, and a cash buffer scenario from a user-entered balance. Stale patterns can still affect headline totals. |
| Savings and review | Conditional savings for selected commitments and evidence for possible duplicates, sustained amount changes and billing gaps. |
| Mandate tracking | Provider guidance, checklist, static emblem fallback and a scoped activity timeline and download with user reports and subsequent loaded charges. |
| Local persistence | Opt-in named SQLite workspaces with export and deletion. Selected-account overview aggregates separately analyzed results by currency. |
| Hosted workspace | HTTPS credential exchange, one-hour revocable sessions, encrypted named snapshots, versions, atomic replacement, period-aligned comparisons, quotas and retention. Verified on disposable PostgreSQL 18.6 and Chromium. Public release and Docker remain open. |
| Assistant and reminders | Deterministic answers, opt-in in-app reminders, and local iCalendar download with merchant and amount disclosure off by default. |
| Evaluation | Synthetic replay, detector-aware challenge explorer, and blinded synthetic holdout. The real-data workflow lacks labels for an accuracy estimate. |
| Live connections | CSV remains the input. Bank connectivity, issuer-confirmed cancellation and payment execution are outside the current implementation. |

See the [handbook](../handbook/README.md) for walkthroughs and the [implementation log](implementation-log.md) for verification evidence.
