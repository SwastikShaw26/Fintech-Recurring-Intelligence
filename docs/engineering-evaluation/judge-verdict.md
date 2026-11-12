# Independent judge verdict — 12 November 2026 re-audit

**Conditional pass for local use. Disposable hosted pilot verified. Public hosted release withheld.**

| Dimension | Weight | Score / 100 | Contribution |
| --- | --- | --- | --- |
| Detection correctness and generalization | 25% | 70 | 17.50 |
| Architecture and code quality | 20% | 76 | 15.20 |
| Security and privacy | 20% | 78 | 15.60 |
| Testing and reliability | 20% | 89 | 17.80 |
| Research and documentation | 15% | 87 | 13.05 |
| **Total** | **100%** | | **79.15** |

The judge confirmed the amount-tier regression coverage and reproduced stale annualization independently. Hosted tests establish application-level isolation on a disposable stack. Deployment gates remain for restricted database roles, shared ingress budgets, backup deletion and session reconciliation, and container execution. The score is a qualitative engineering assessment. [Evidence and limitations](execution-summary.md)
