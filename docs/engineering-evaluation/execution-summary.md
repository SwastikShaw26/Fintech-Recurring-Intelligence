# Engineering evaluation summary — 12 November 2026

The re-audit covered the current working tree. Independent specialists reviewed hosted safety, product correctness, and PostgreSQL verification. An independent judge checked the evidence and reproduced the stale forecast issue.

- Local and hosted production builds, lint, 64 Python tests, 17 frontend tests and 21 live PostgreSQL tests passed. Hosted HTTPS Chromium covered owner isolation, pagination and revocation.
- Amount-tier ownership is corrected. Frozen holdouts remain at 74.42% and 73.97% synthetic F1. Historical MoneyData testing verifies ingestion at realistic volume.
- A stale 100-unit monthly commitment still adds 1,200 units to annual totals. Forecast confidence and the renewal inbox are the strongest next product work.
- The independent rubric scored 79.15/100. Local use conditionally passes and the disposable hosted pilot is verified. Public hosted release remains gated on database roles, shared ingress limits, backup reconciliation, and Docker verification.

[Architecture](architecture-audit.md) · [Security](security-audit.md) · [Tests](test-report.md) · [Research](research-report.md) · [Verdict](judge-verdict.md) · [Product roadmap](../engineering/feature-roadmap.md#product-expansion-proposals)
