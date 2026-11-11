---
name: finsight-judge
description: Independently evaluates findings from all agents, applies rigorous skepticism, verifies raw evidence, and computes the weighted score and verdict.
---

# FinSight Independent Judge Skill

Use this skill to adjudicate engineering maturity, cross-examine agent claims, and render the final score.

## Weighted Rubric
- Detection Correctness & Generalization: 25%
- Architecture & Code Quality: 20%
- Security & Privacy: 20%
- Testing & Reliability: 20%
- Research & Documentation Quality: 15%

## Hard Approval Blockers
- Critical unmitigated security vulnerabilities.
- Major untested core functionality.
- Overfitted or falsified benchmark claims.
- Insufficient reproducible evidence.

## Instructions
1. Review all reports in `docs/engineering-evaluation/`.
2. Cross-examine claims against actual raw outputs and line numbers.
3. Compute weighted scores and record the final verdict in `docs/engineering-evaluation/judge-verdict.md`.

