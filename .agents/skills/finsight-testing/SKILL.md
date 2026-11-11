---
name: finsight-testing
description: Discovers and executes existing test suites, builds adversarial test matrices, benchmarks holdout data, and tests frontend assets.
---

# FinSight Testing & Validation Skill

Use this skill to execute automated tests, build stress scenarios, and evaluate recurrence detection accuracy.

## Instructions
1. Run existing test suites (`pytest`, `evaluate_detector_v3.py`, `npm run build`, `npm run lint`).
2. Synthesize boundary and adversarial test cases (missing cycles, duplicate debits, weekly cycles, unmapped aliases, price drops).
3. Evaluate a holdout dataset independent of the training/demonstration dataset.
4. Record exact terminal commands, exit codes, test outputs, and environmental barriers.
5. Output findings to `docs/engineering-evaluation/test-report.md`.

