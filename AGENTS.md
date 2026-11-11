# FinSight Engineering Guidelines & Agent Instructions

This document governs agent-driven and human-assisted engineering operations across the FinSight repository. Every orchestrator, subagent, and engineering workflow must adhere strictly to these operational rules and standards.

---

## 1. Core Operating Principles

1. **Understand existing code before changing it**: Always map call graphs, read definitions, inspect contracts, and establish assumptions before making any modifications.
2. **Treat repository documentation as claims to verify against implementation**: Never assume README, docstrings, or architecture documents represent ground truth until verified against executed code and raw source files.
3. **Never claim tests passed unless they were actually executed**: All assertions of passing tests, clean builds, or lint success require fresh, verbatim terminal execution output.
4. **Do not invent research sources, benchmarks, or agent results**: Ground all claims, algorithmic performance metrics, regulatory interpretations, and citations in verifiable sources.
5. **Use the installed skills where they materially help**: Leverage specialized skills (e.g. `audit-context-building`, `code-review-pro`, `security-review`, `test-driven-development`, `verification-before-completion`, `sub-agent-orchestrator`, etc.) systematically.
6. **Separate research, implementation, testing, and independent review**: Maintain strict role and phase separation. Code authoring and code reviewing/verification must not compromise independence.
7. **Prefer small, reviewable changes**: Implement the minimum coherent delta required to fulfill requirements or fix defects. Avoid bulk unreviewed edits.
8. **Never overwrite or delete user data without approval**: Protect datasets, user configurations, baseline databases, and production state against unapproved modification or deletion.
9. **Never commit, push, deploy, or upload sensitive information without approval**: Maintain confidentiality of credentials, keys, PII, and production artifacts at all times.
10. **Never implement proposed features before user approval**: Engineering proposals and roadmaps must be explicitly greenlit by the user before code execution begins.

---

## 2. Agent Execution & Delegation Protocol

FinSight supports both **native subagent orchestration** (via subagent tools: `invoke_subagent`, `define_subagent`, `manage_subagents`) and a **deterministic sequential fallback** if running in single-agent environments.

### Delegation Rules:
- When native subagents are invoked, provide clear, bounded roles and prompts.
- Subagents must operate with clear contracts and return structured evidence.
- Parallel executions should only be dispatched when tasks are strictly decoupled.
- In sequential fallback mode, the lead orchestrator assumes each specialist persona sequentially, maintaining rigorous context discipline between steps.

---

## 3. Standard Two-Stage Engineering Workflow

All major changes in the repository follow a two-stage lifecycle:

```
+-------------------------------------------------------------+
|                Stage 1: Project Discovery                   |
| (Read-Only Assessment -> Audit -> Evidence-Backed Roadmap)  |
+-------------------------------------------------------------+
                              |
                              v
                   [ User Decision Gate ]
                              |
                              v
+-------------------------------------------------------------+
|                Stage 2: Feature Execution                   |
|  (Specification -> Plan -> TDD -> Review -> Verification)   |
+-------------------------------------------------------------+
```

### Stage 1: `project-discovery`
- **Mode**: Read-only engineering and product assessment.
- **Goal**: Form an exhaustive understanding of code reality vs documentation claims, execute baseline test suites, conduct multi-specialist audits, and present a prioritized feature roadmap.
- **Completion Gate**: **STOP and wait for user approval**. No implementation may proceed without explicit user selection.

### Stage 2: `feature-execution`
- **Mode**: Targeted implementation and verification.
- **Prerequisite**: An approved feature from Stage 1.
- **Goal**: Implement the chosen feature through strict TDD (Red-Green-Refactor), conduct independent code and security reviews, execute browser/unit/integration verification, and document outcomes.

---

## 4. Deliverable Structure

All permanent engineering artifacts produced by these workflows are stored in:
`docs/engineering/`

The standard deliverables are:
- `repository-inventory.md`: Complete source, config, test, and asset inventory.
- `architecture.md`: Actual system architecture and data flows verified against source code.
- `feature-inventory.md`: Discovered functional features compared against README claims.
- `baseline-test-results.md`: Verbatim execution logs and pass/fail analysis of baseline tests.
- `audit-findings.md`: Multi-perspective audit covering correctness, security, performance, and maintainability.
- `feature-roadmap.md`: Prioritized, evidence-backed engineering recommendations and proposals.
- `decisions.md`: Architecture Decision Records (ADRs) and user feature approvals.
- `implementation-log.md`: Step-by-step record of feature execution, TDD cycles, review feedback, and verification evidence.

*Note: Files are created only when their corresponding workflow phase is executed; empty or speculative reports are prohibited.*

