---
name: project-discovery
description: Stage 1 read-only engineering and product assessment for FinSight. Discovers architecture, validates documentation claims against source, audits quality and security, runs baseline tests, and produces an evidence-backed roadmap.
tools: Read, Bash, Grep, Glob
user_invocable: true
---

# Project Discovery Workflow (Stage 1)

This workflow conducts a strict read-only product and engineering assessment of the FinSight codebase. It establishes baseline truth before any code changes occur.

## Execution Constraints
- **Strictly Read-Only**: Do not modify application source code or delete user data.
- **Evidence-Based**: Never claim tests pass or features exist without inspecting code or executing verification commands.
- **Stop Gate**: Conclude by presenting the prioritized roadmap and waiting for explicit user approval. Do NOT start implementation.

## Steps

### Step 1: Inventory & Codebase Inspection
- Map all source files, configurations, datasets, and documentation assets (`src/`, `config/`, `data/`, `frontend/`, `tests/`, `docs/`).
- Use `audit-context-building` principles to map key modules, imports, function contracts, and dependencies.
- Record findings into `docs/engineering/repository-inventory.md`.

### Step 2: Architecture & Data Flow Mapping
- Trace data ingestion, pipeline stages, recurrence detection logic, and frontend API interactions.
- Document the concrete architecture (vs conceptual diagrams) in `docs/engineering/architecture.md`.

### Step 3: Feature Inventory & Claim Verification
- Extract claims made in `README.md`, `DESIGN.md`, and other docs.
- Compare each claim against actual code implementation to classify features as Implemented, Partially Implemented, or Missing.
- Document discrepancies in `docs/engineering/feature-inventory.md`.

### Step 4: Baseline Testing
- Run existing test suites (e.g. `pytest tests/`) if virtual environment / dependencies are available.
- Capture raw test logs, pass/fail counts, execution times, and missing test areas.
- Record results in `docs/engineering/baseline-test-results.md`.

### Step 5: Multi-Specialist Technical Audit
- Audit correctness, cyclomatic complexity, coupling, and modularity using `code-review-pro`.
- Audit security, injection risks, hardcoded secrets, input sanitization, and CORS using `security-review`.
- Audit project dependencies and supply chain risks using `dependency-auditor`.
- Formulate and test hypotheses on algorithm limitations using `hypothesis-testing-engine`.
- Synthesize all findings into `docs/engineering/audit-findings.md`.

### Step 6: Roadmap & Recommendations
- Prioritize technical debt, architectural enhancements, test coverage gaps, and potential product features based on audit evidence.
- Produce `docs/engineering/feature-roadmap.md`.

### Step 7: Decision Gate (STOP)
- Present the executive summary and prioritized feature list to the user.
- **Halt execution**: Prompt the user to select which feature to proceed with in Stage 2 (`feature-execution`).

