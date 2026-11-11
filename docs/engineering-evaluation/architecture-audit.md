# Architecture and Code Quality Audit Report

**Agent**: Agent B — Code and Architecture Auditor  
**Skill**: `finsight-code-audit`  
**Date**: November 11, 2026  
**Status**: Verified with Line-Level Evidence  

---

## 1. Architectural Overview & System Boundaries

The FinSight codebase consists of:
1. **Python FastAPI Backend (`src/`)**: Provides REST endpoints (`api.py`), static heuristic detection scripts (`detect_recurring_v3.py`), benchmark evaluation (`evaluate_detector_v3.py`), and regulatory guidance (`cancellation_guide.py`).
2. **React 19 / TypeScript Frontend (`frontend/src/`)**: A Single Page Application (SPA) built with Vite, Tailwind CSS, Lucide icons, and Recharts.
3. **Data Tier (`data/`)**: Flat-file CSV storage split between `data/raw/` (`synthetic_transactions.csv`, `ground_truth_labels.csv`) and `data/processed/` (`recurring_candidates_v3.csv`, `transaction_predictions.csv`).

While functional as a demonstration prototype, the codebase exhibits critical architectural limitations, tight coupling, and maintainability concerns.

---

## 2. Confirmed Defects & Architecture Smells

### Defect 1: Tight Heuristic Overfitting to Synthetic Dataset
* **Location**: `src/detect_recurring_v3.py`, Lines 63–80:
```python
def split_streams(rows: list[dict]) -> list[list[dict]]:
    if len(rows) <= 3:
        return [rows]
    amounts = [r["amount"] for r in rows]
    distinct_amounts = sorted(list(set(amounts)))
    if distinct_amounts[0] <= 10.0:
        return [rows]
    if len(distinct_amounts) == 2 and distinct_amounts[1] / distinct_amounts[0] > 1.3:
        c1 = [r for r in rows if abs(r["amount"] - distinct_amounts[0]) < 10]
        c2 = [r for r in rows if abs(r["amount"] - distinct_amounts[1]) < 10]
        if len(c1) >= 3 or len(c2) >= 3:
            return [c for c in [c1, c2] if c]
    return [rows]
```
* **Impact**: Critical maintainability and generalization defect.
  - The condition `len(distinct_amounts) == 2` explicitly hardcodes an assumption that a merchant has exactly two price tiers (matching Scenario S002/S010 in the synthetic dataset). If a merchant has three subscription tiers (e.g., Basic ₹199, Standard ₹499, Premium ₹799), `split_streams` collapses all transactions into a single bucket, ruining recurrence detection.
  - The magic number `10.0` INR hardcodes the trial verification threshold specifically to pass Scenario S007 (₹1 trial fee).

### Defect 2: In-Memory Full CSV Reloading on Every API Request
* **Location**: `src/api.py`, Lines 130–135, Lines 230–240:
```python
def load_transactions() -> list[dict]:
    rows = read_csv(TRANSACTIONS_FILE)
    predictions = load_predictions()
    ...
```
* **Impact**: Severe scalability blocker.
  Every invocation of `/api/transactions`, `/api/commitments`, `/api/summary`, and `/api/alerts` reads raw CSV files from disk, re-parses every row, performs repetitive string normalization, and reconstructs dictionaries in memory. Under concurrent load or with a production dataset (>100,000 transactions), this produces extreme disk I/O thrashing, high latency, and high CPU usage.
* **Remediation**: Implement a proper persistent database (SQLite / PostgreSQL) or an in-memory cached state repository with change invalidation.

### Defect 3: Monolithic Frontend Component Architecture
* **Location**: `frontend/src/App.tsx` (832 lines) and `frontend/src/App.css` (851 lines).
* **Impact**: Poor modularity and high technical debt.
  The entire dashboard UI—including navigation tabs, KPI cards, transaction search tables, commitment detail modals, cancellation guidance displays, and evaluation metrics charts—is crammed into a single monolithic component (`App.tsx`). This violates basic Single Responsibility and component decomposition principles.

### Defect 4: Rigid Exact-Match Merchant Alias Architecture
* **Location**: `src/detect_recurring_v3.py`, Lines 88–92 & `config/merchant_aliases.json`:
```python
for row in transactions:
    desc = row["description"].strip().upper()
    merchant_key = aliases.get(desc, desc)
    groups[merchant_key].append(row)
```
* **Impact**: High operational fragility.
  Merchant resolution is governed solely by exact string dictionary lookups. The alias file only defines mappings for `CLDNST DIGITAL` and `CLOUDNEST RENEWAL`. Any real-world variance (such as bank POS prefixes, UPI transaction IDs, or date stamps appended to descriptors) bypasses grouping completely.

---

## 3. Maintainability & Code Hygiene Evaluation

| Metric | Assessment | Evidence / Observation |
|---|---|---|
| **Separation of Concerns** | Poor | Backend mixes HTTP routing, file parsing, business heuristics, and static file serving in `api.py`. Frontend is a single 832-line file. |
| **Data Integrity & Schema** | Moderate | Pydantic is declared in requirements, but API internal endpoints pass raw loosely-typed Python dicts rather than validated Pydantic schema models. |
| **Error Handling** | Moderate | API handles file missing errors gracefully, but lacks structured exception handlers for malformed CSV rows. |
| **Configuration Management** | Acceptable | Paths are relative to `PROJECT_ROOT` using `pathlib.Path`, ensuring cross-platform path resolution. |

---

## 4. Priority Refactoring Recommendations

1. **Decompose `frontend/src/App.tsx`**: Extract sub-components into `frontend/src/components/` (`MetricsSummary.tsx`, `TransactionTable.tsx`, `CommitmentCard.tsx`, `CancellationModal.tsx`).
2. **Transition from CSV to SQLite**: Adopt SQLAlchemy / SQLModel with SQLite for persistent querying, proper indexing on `transaction_id` and `date`, and fast pagination.
3. **Pydantic Response Schemas**: Define explicit Pydantic response models for all API endpoints to guarantee contract consistency and auto-generate Swagger schemas.

