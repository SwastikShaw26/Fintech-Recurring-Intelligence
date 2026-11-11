---
name: finsight-full-review
description: Main entry point for the autonomous multi-agent engineering evaluation system for FinSight. Coordinates Specialists A through D, invokes Judge E, and synthesizes deliverables.
---

# FinSight Master Evaluation Orchestrator

Execute this skill to perform a complete autonomous evaluation of the FinSight repository.

## Execution Order
1. **Repository Baseline**: Check Python/Node runtime, package status, and directory layout.
2. **Specialist Invocations**:
   - Agent A (`finsight-research`): Regulatory compliance & algorithmic literature.
   - Agent B (`finsight-code-audit`): Architecture & code smells.
   - Agent C (`finsight-security-audit`): Security, privacy & CORS posture.
   - Agent D (`finsight-testing`): Automated test execution & adversarial holdout evaluation.
3. **Consolidation & Cross-Check**: Check for contradictions in findings.
4. **Independent Adjudication**: Agent E (`finsight-judge`) applies the 5-part weighted rubric and evaluates blockers.
5. **Synthesis**: Generate `improvement-roadmap.md` and `execution-summary.md`.

## Deliverables
All reports are generated in `docs/engineering-evaluation/`.

