# Repository inventory

| Area | Key contents |
| --- | --- |
| `src/` | FastAPI backend; local Node adapter; V3 detector and evaluator; earlier detector/evaluator snapshots; synthetic generation, validation, and error inspection; cancellation guide; challenge runner |
| `config/` | Exact merchant alias map |
| `data/raw/` | Synthetic transactions, ground-truth CSV, and separately labeled adversarial JSON |
| `data/processed/` | Ignored generated candidate, prediction, and error CSVs; tracked placeholder |
| `frontend/src/` | React entry point, app shell and styles, revocation tracker and emblem, timeline and date math, benchmark view and generated evidence |
| `frontend/public/`, `frontend/dist/` | Static assets and compiled SPA. Rebuild before serving the current source from port 8000 |
| `tests/`, `frontend/tests/` | API tests, benchmark reproducibility tests, evaluation plan, and Node tests for timeline and revocation behavior; additional guidance test at frontend root |
| `requirements.txt`, `frontend/package*.json`, `start_app.ps1` | Runtime dependencies, lockfile, and PowerShell launcher |
| `docs/`, `research/`, `.agents/skills/` | Design, product contract, implementation history, research, and repository workflows |

The audit covers the current working tree. Git currently reports the new frontend components, challenge runner and fixtures, and Node adapter as untracked. A clone of the last commit does not contain those working-copy features.
