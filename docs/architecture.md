# FinSight architecture

Current working tree assessed on 12 November 2026. See the [engineering architecture map](engineering/architecture.md) for source boundaries and [audit findings](engineering/audit-findings.md) for verified risks.

```text
Synthetic statement CSV + merchant alias map
  → Python V3 detector
  → candidate and prediction CSVs
  → FastAPI (canonical) or local Node demo adapter
  → React summary, transactions, commitments, and review queue

Commitment and transaction data → browser milestone projections
Commitment and cancellation guidance → browser-local checklist and report

Private CSV → browser preview and mapping → mapped rows → loopback FastAPI → in-memory V3 analysis
Merchant links → reanalysis of mapped fields in the same tab
Explicit local save → named SQLite workspace → owner-selected restore or comparison

Hosted browser → same-origin HTTPS → operator credential exchange → revocable session digest
  → authenticated FastAPI statement action
  → transient V3 analysis or owner-scoped AES-GCM snapshot in PostgreSQL
  → named version history and shared-period comparison

Separate labeled synthetic challenge fixtures
  → V3 baseline replay → generated JSON → Evaluation & audit
```

React 19, TypeScript, and Vite power the frontend. It uses Lucide icons, GSAP transitions, and a lazy-loaded Three.js/React Three Fiber emblem. The detector groups normalized debit descriptors and produces inferred candidates and debit predictions. Label files feed evaluation only.

FastAPI and the working-copy Node adapter serve JSON and can serve a built SPA. The benchmark view imports its generated challenge artifact. FastAPI owns private import and saved workspaces. The browser keeps private checklist state and hosted session tokens in tab memory. Saved snapshots require explicit action. The synthetic container disables both local statement routes. Hosted mode uses Alembic-managed snapshot and session tables and has passed tests on disposable PostgreSQL. The Docker image and least-privilege hosted deployment remain verification targets. [Setup guide](handbook/01-getting-started.md)
