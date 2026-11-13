# The FinSight Handbook

A practical guide to using, understanding, extending, and operating FinSight. It assumes you can open a terminal and a browser. The first chapter teaches the commands and the programming primer explains the languages used in the code.

## How to read this book

**If you want to use the app**, read chapters 1 through 3. Start with the synthetic demo, then use the sample CSV exercise before working with a personal statement.

**If you want to change the code**, run the demo first, then read chapters 4 through 7. Trace one transaction all the way from a file to a UI card. Use chapter 10 when preparing your first change.

**If you want to operate an instance**, read the data boundaries in chapters 3 and 9, then use chapter 8. Practice with synthetic data and a disposable database before considering a hosted pilot.

## Contents

| Chapter | What you can do after reading it |
| --- | --- |
| [1. Run FinSight](01-getting-started.md) | Set up a clean environment, run the app, choose a port, and diagnose startup errors. |
| [2. Use the workspace](02-using-finsight.md) | Follow the ledger, forecast, reminders and mandate workflows. |
| [3. Import and manage statements](03-statement-import.md) | Map a CSV, inspect overlap, and manage saved copies. |
| [4. Programming primer](04-programming-primer.md) | Read the Python, TypeScript, React and SQL used in this repository. |
| [5. Architecture and code](05-architecture-and-code.md) | Follow the application and detector through their normal entry points. |
| [6. API and data reference](06-api-and-data.md) | Inspect request and response contracts and understand statement fields. |
| [7. Test, evaluate and debug](07-testing-and-debugging.md) | Choose a verification command, interpret results, and reproduce detector metrics. |
| [8. Hosted operations](08-hosted-operations.md) | Configure and test the synthetic container or hosted PostgreSQL pilot. |
| [9. Security and privacy](09-security-privacy.md) | Trace data movement, storage, expiry, deletion, and operational boundaries. |
| [10. Contribute and look up terms](10-contributing-and-reference.md) | Pick the right files, make a scoped change, and find deeper references. |

## Conventions

- Commands default to the **repository root**, the folder containing `README.md`, `src/`, and `frontend/`.
- PowerShell snippets use Windows paths. Shell snippets for macOS and Linux are marked Bash.
- Replace placeholders such as `YOUR_PROJECT_FOLDER` before running a command. Examples use synthetic merchants and disposable databases.
- **Observation** means a row supplied in a statement. **Inference** means a conclusion drawn by the detector. **Projection** means an estimate derived from that inference. **User report** means a checklist attestation.
- The handbook describes current behavior. The [implementation log](../engineering/implementation-log.md) preserves dated verification evidence. The [roadmap](../engineering/feature-roadmap.md) records proposed work.

[Project README](../../README.md) · [Start chapter 1](01-getting-started.md)

