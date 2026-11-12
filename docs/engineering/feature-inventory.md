# Current feature inventory

| Capability | Current state |
| --- | --- |
| Recurring detector | Calendar and interval heuristics, exact aliases, amount tiers and irregular fallback. The audit found overlapping tier assignments. |
| Statement import | Signed or split debit and credit CSVs, header suggestions, three date formats, overlap occurrence matching and refund suggestions. The historical MoneyData workflow handled 6,567 de-identified rows. |
| Merchant review | Explainable alias, normalization and spelling suggestions. Confirm, dismiss or undo links and recalculate while preserving original descriptions. |
| Forecast and timeline | Fitted calendar anchors where available, 30-day calendar, renewal projections, monthly and annual estimates, uncertainty notes and commitment detail navigation. |
| Savings and review | Conditional savings for selected commitments and evidence for possible duplicates, sustained amount changes and billing gaps. |
| Mandate tracking | Provider guidance, interactive checklist, animated emblem with static fallback, user-reported revocation, and evidence of subsequent loaded charges. |
| Local persistence | Opt-in named SQLite workspaces with export and deletion. Selected-account overview aggregates separately analyzed results by currency. |
| Hosted workspace | HTTPS credential exchange, one-hour revocable sessions, owner-scoped AES-GCM snapshots, quotas, pagination, retention and key rotation. Verified on disposable PostgreSQL 18.6 and Chromium. Public release and Docker remain open. |
| Assistant and reminders | Deterministic evidence-linked answers and opt-in in-app reminder windows. Email delivery and trained ML are absent. |
| Evaluation | Synthetic replay, detector-aware challenge explorer, and blinded synthetic holdout. The real-data workflow lacks labels for an accuracy estimate. |
| Live connections | CSV remains the input. Bank connectivity, issuer-confirmed cancellation and payment execution are outside the current implementation. |
