---
name: finsight-code-audit
description: Inspects FinSight architecture, module boundaries, code hygiene, coupling, and scalability limitations with line-level evidence.
---

# FinSight Code & Architecture Audit Skill

Use this skill to audit repository architecture, backend and frontend code, database/CSV persistence, and error handling.

## Instructions
1. Inspect `src/`, `config/`, and `frontend/` files systematically.
2. Identify hardcoded heuristics, tight coupling, and brittle assumptions.
3. Every finding must include exact file paths and line numbers.
4. Distinguish between confirmed functional defects and maintainability/code smell issues.
5. Output structured findings to `docs/engineering-evaluation/architecture-audit.md`.

