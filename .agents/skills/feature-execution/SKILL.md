---
name: feature-execution
description: Stage 2 implementation and verification workflow for FinSight. Begins strictly after user feature approval. Coordinates planning, TDD implementation, testing, code/security review, and verification.
tools: Read, Write, Bash, Grep, Glob
user_invocable: true
---

# Feature Execution Workflow (Stage 2)

This workflow implements an approved feature or enhancement following rigorous test-driven development, peer reviews, and verification.

## Prerequisites
- A feature from `docs/engineering/feature-roadmap.md` must be explicitly selected and approved by the user.
- Document the approval and key architectural decisions in `docs/engineering/decisions.md`.

## Execution Protocol

### Step 1: Feature Specification & Scope Definition
- Read and clarify the requirements for the approved feature.
- Investigate affected files, classes, models, and dependencies using `audit-context-building`.
- Formulate acceptance criteria and an implementation plan.

### Step 2: Task Decomposition & Delegation
- Decompose the implementation plan into modular, bite-sized tasks.
- If native subagents are available, delegate decoupled tasks (e.g., research, test authoring, linting/security scanning) using `invoke_subagent` following `sub-agent-orchestrator` patterns.
- If running in single-agent sequential mode, execute each phase sequentially with clear boundary separation. Do not fake parallel agents.

### Step 3: Test-Driven Development (TDD)
- Adhere strictly to `test-driven-development` guidelines:
  1. **Red**: Write a failing test covering the feature or bug fix. Run it and verify it fails for the expected reason.
  2. **Green**: Write the minimal production code needed to make the test pass.
  3. **Refactor**: Clean up the code while keeping tests green.
- Leverage `property-based-testing` for algorithmic edge cases and mathematical invariants.
- If debugging unexpected test failures, use `systematic-debugging`.

### Step 4: Full Test Suite & Browser Verification
- Run the entire test suite to ensure zero regressions across existing components.
- If the feature touches web UI, interactive dashboards, or frontend APIs, verify functionality using `playwright`.

### Step 5: Independent Code & Security Review
- Conduct a code quality and architecture review using `code-review-pro`.
- Conduct a targeted vulnerability and security scan using `security-review`.
- Optionally solicit a fresh review perspective using `second-opinion` or `panel-review`.
- Fix any identified issues or regressions, re-running test suites to verify fixes.

### Step 6: Evidence Verification Before Completion
- Apply `verification-before-completion`: Execute all test suites and linters cleanly. Confirm zero failures before declaring completion.
- Never state that code is working without verbatim terminal proof.

### Step 7: Implementation Documentation
- Log changes, test outputs, resolved challenges, and verification results in `docs/engineering/implementation-log.md`.
- Present the final report to the user.

