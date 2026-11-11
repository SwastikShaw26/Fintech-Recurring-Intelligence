# FinSight: Comprehensive Repository Engineering Report

**Document**: `docs/engineering/project-understanding.md`  
**Evaluation Standard**: Ground truth code inspection via `audit-context-building` principles  
**Target Environment**: hackFront India 2026 (Problem T4.1 — *The Auto Debits Nobody Can Find*)  
**Scope**: Full repository analysis (Architecture, Features, Algorithms, Data Flows, APIs, Schemas, Discrepancies, and Limitations)  

---

## 1. Executive Summary

**FinSight** is a specialized fintech intelligence application designed to detect, analyze, and surface recurring subscription payments and auto-debits from personal financial transactions (specifically tailored to Indian banking, UPI AutoPay, and RBI mandate ecosystems). 

The system operates as a **two-tier architecture**:
1. **Python / FastAPI Backend** (`src/`): Executes rule-based heuristic pattern detection (`src/detect_recurring_v3.py`), generates payment-mechanism-specific cancellation guidance conforming to NPCI/RBI regulations (`src/cancellation_guide.py`), evaluates benchmark accuracy against ground-truth labels (`src/evaluate_detector_v3.py`), and serves REST API endpoints and static assets (`src/api.py`).
2. **React 19 SPA Frontend** (`frontend/`): Built with TypeScript, Vite, and Lucide React icons, adhering to an editorial paper ledger design system (`DESIGN.md`, `frontend/src/App.css`), presenting spend overviews, recurring commitments, transaction tables, alerts, and live benchmark evaluation metrics.

---

## 2. Architecture & Data Flow

### 2.1 Concrete System Topology

```
+-----------------------------------------------------------------------------------+
|                                 Client Layer                                      |
|                  React 19 SPA (frontend/src/App.tsx & App.css)                    |
|             Design: Warm editorial ledger (--canvas: #ECE9E1, --surface: #F8F6EF)  |
+------------------------------------------+----------------------------------------+
                                           | HTTP Requests (Port 8000)
                                           v
+-----------------------------------------------------------------------------------+
|                             FastAPI Backend (src/api.py)                          |
|                                                                                   |
|  Endpoints:                                                                       |
|  - GET /api/health                    - GET /api/summary                          |
|  - GET /api/transactions              - GET /api/commitments                      |
|  - GET /api/commitments/{id}          - GET /api/alerts                           |
|  - GET /api/cancellation-guide/{pm}   - GET /api/evaluation                       |
|  - GET /{full_path:path} (Serves built frontend from frontend/dist/)               |
+-------------------+---------------------------------------+-----------------------+
                    | Reads on-demand (CSV-backed)          | Uses helper
                    v                                       v
+----------------------------------------+  +---------------------------------------+
|              Data Layer                |  |        Cancellation Module            |
|                                        |  |      (src/cancellation_guide.py)       |
| Raw Data (data/raw/):                  |  |                                       |
| - synthetic_transactions.csv (56 rows) |  | Regulatory frameworks:                |
| - ground_truth_labels.csv    (56 rows) |  | - UPI AutoPay: NPCI OC No. 223        |
|                                        |  | - Card E-Mandate: RBI/2024-25/64       |
| Processed Outputs (data/processed/):   |  | - Bank NACH/eNACH: NPCI NACH rules    |
| - recurring_candidates_v3.csv (10 rows)|  +---------------------------------------+
| - transaction_predictions.csv (56 rows)|
| - evaluation_v3_errors.csv   (0 errors)|
+-------------------+--------------------+
                    ^
                    | Generates / Writes
+-------------------+---------------------------------------------------------------+
|                        Offline Heuristic Processing Pipeline                      |
|                                                                                   |
| 1. Generator:  src/generate_dataset.py   -> Generates raw transactions & labels   |
| 2. Validator:  src/validate_dataset.py   -> Integrity & schema checks             |
| 3. Detector:   src/detect_recurring_v3.py-> Normalizes, groups, detects cadence,   |
|                                             flags price changes & anomalies       |
| 4. Evaluator:  src/evaluate_detector_v3.py-> Computes TP/FP/FN/TN, Precision,    |
|                                              Recall, F1 against ground truth       |
| 5. Inspector:  src/inspect_errors.py     -> Debug tool for prediction mismatches  |
+-----------------------------------------------------------------------------------+
```

### 2.2 End-to-End Data Flow

1. **Ingestion & Aliasing**: `detect_recurring_v3.py` reads `data/raw/synthetic_transactions.csv`. It filters for debit transactions (`direction == "debit"`), parses dates into `datetime.date`, and applies alias mapping from `config/merchant_aliases.json` (e.g. mapping `CLDNST DIGITAL` and `CLOUDNEST RENEWAL` to `CLOUDNEST`).
2. **Stream Splitting & Interval Analysis**: Transactions sharing a canonical merchant key are passed through `split_streams()` to separate independent pricing tiers (e.g. 599 vs 899 quarterly) while preserving nominal verification charges (<= 10 INR) and price increases (199 -> 249). The dates are sorted, and consecutive inter-transaction day gaps are computed.
3. **Cadence Classification & Scoring**: Gaps are evaluated against predefined ranges:
   - Monthly: 28–31 days
   - Quarterly: 85–95 days
   - Annual: 350–380 days
   - Irregular: Span >= 60 days with amount spread <= 10%
   Heuristic confidence scores (0.0 to 1.0) and descriptive evidence strings are computed.
4. **Outlier Filtering & Individual Prediction**: Transactions with amount deviations > 10% from the median trigger `review_required = True`. Outliers deviating > 30% from established patterns are rejected as non-recurring. Output records are written to `recurring_candidates_v3.csv` and `transaction_predictions.csv`.
5. **Runtime Serving**: `src/api.py` reads the CSV files into memory per HTTP request. In addition, `api.py` augments each commitment with regulatory cancellation guidance retrieved dynamically from `src/cancellation_guide.py`.
6. **Frontend Consumption**: `frontend/src/App.tsx` fetches data from `/api/summary`, `/api/commitments`, `/api/transactions`, `/api/alerts`, and `/api/evaluation`. It provides client-side filtering, modals with cancellation guides, and renders benchmark metric cards.

---

## 3. Detailed Component Deep-Dive

### 3.1 Primary Detection Engine: `src/detect_recurring_v3.py`
- **Purpose**: Batch-processes transaction logs to infer recurring obligations and flags unusual charges.
- **Internal Mechanics**:
  - `load_aliases()`: Reads `config/merchant_aliases.json`.
  - `read_transactions()`: Filters strictly for debit rows.
  - `split_streams()`: Distinguishes parallel subscription tiers under the same merchant identity when amount differences exceed 30% and both have >= 3 observations, preserving nominal trial charges (<= 10 INR).
  - `classify_intervals()`: Matches the median interval against `CADENCES`.
  - Confidence Formula:
    - Fixed Cadence: $0.7 \times \text{interval\_consistency} + 0.3 \times \min(\text{len}(rows)/5, 1.0)$
    - Irregular: $0.5 \times \min(\text{len}(rows)/5, 1.0) + 0.5 \times \max(0.0, 1.0 - \text{amount\_spread}/0.10)$
- **Dependencies**: Standard library only (`csv`, `json`, `collections.defaultdict`, `datetime.date`, `pathlib.Path`, `statistics.median`). Zero external ML or data frame dependencies (no pandas, no scikit-learn).
- **Limitations**:
  - Fixed cadence boundaries: Hardcoded window for monthly (28–31 days) fails if transactions occur across irregular calendar months (e.g., February with 28 days followed by a 31-day month).
  - Scalability: Operates in memory with full file reads. Not optimized for multi-tenant streaming or millions of rows.

### 3.2 Cancellation Guidance Engine: `src/cancellation_guide.py`
- **Purpose**: Translates technical payment descriptors into verified Indian regulatory cancellation procedures.
- **Internal Mechanics**:
  - Encapsulates structured dictionaries mapped by payment method:
    - `"upi autopay"`: NPCI UPI AutoPay Guidelines (OC No. 223), step-by-step UPI app navigation, PIN authorization, mandate pause/revoke.
    - `"card"`: RBI Recurring E-Mandate Framework (RBI/2024-25/64), merchant billing routes, card issuer e-mandate hubs (SI-Hub), token deletion safeguards.
    - `"bank mandate"`: NPCI NACH regulations, NetBanking mandate stops, physical branch cancellation form procedures, UMRN lookups.
    - `"upi"`: Standard manual UPI clarification.
- **Dependencies**: None (pure Python dict lookup).
- **Limitations**: Static guidance; cannot check real-time mandate status or execute cancellation actions via banking APIs.

### 3.3 Evaluation Engine: `src/evaluate_detector_v3.py` & `src/inspect_errors.py`
- **Purpose**: Computes binary classification benchmark metrics against `data/raw/ground_truth_labels.csv`.
- **Internal Mechanics**:
  - Evaluates debit transactions only.
  - Compares `predicted_recurring` against `is_recurring`.
  - Computes Precision, Recall, F1-Score, Accuracy, and confusion matrix counts (TP, FP, FN, TN).
  - Logs detailed discrepancy rows to `data/processed/evaluation_v3_errors.csv`.
- **Current Metric Status**:
  - Evaluated debits: 56
  - True Positives (TP): 45
  - True Negatives (TN): 11
  - False Positives (FP): 0
  - False Negatives (FN): 0
  - Precision: 100.0%, Recall: 100.0%, F1: 1.000, Accuracy: 100.0%.

### 3.4 REST API Server: `src/api.py`
- **Purpose**: Serves the RESTful JSON API and mounts the React production build (`frontend/dist/`).
- **Endpoints Implemented**:
  - `GET /api/health`: Service status, synthetic data flag, detector version (`v3` or `v2-fallback`).
  - `GET /api/summary`: Aggregates transaction counts, detected pattern counts, estimated annual spend, review alerts.
  - `GET /api/transactions`: Paginated transaction list with search by description/id, direction filtering, and review status filtering.
  - `GET /api/commitments`: Candidate commitment list with cadence, search, and review filtering, sorted by estimated annual cost.
  - `GET /api/commitments/{id}`: Detailed commitment view enriched with supporting transaction history and cancellation guidance.
  - `GET /api/alerts`: List of `amount_deviation` and `irregular_pattern` review alerts.
  - `GET /api/cancellation-guide/{payment_method}`: Standalone endpoint for regulatory cancellation steps.
  - `GET /api/evaluation`: Real-time benchmark calculation returning confusion matrix and error list.
  - `GET /{full_path:path}`: Static SPA handler serving `frontend/dist/` with caching headers.
- **Dependencies**: `fastapi`, `uvicorn`, `starlette`, `pydantic`.

### 3.5 Frontend Client: `frontend/src/App.tsx` & `App.css`
- **Purpose**: User-facing ledger interface.
- **Design System**: Warm editorial ledger adhering to `DESIGN.md`:
  - Custom color tokens: `--canvas` (`#ECE9E1`), `--surface` (`#F8F6EF`), `--line` (`#CBC7BC`), `--ink` (`#242A25`), `--muted` (`#4D5A51`), `--evergreen` (`#24563F`), `--attention` (`#79551F`).
  - Typography: DM Serif Display (headings), Plus Jakarta Sans (body UI), JetBrains Mono (financial amounts and dates).
- **Views**:
  - **Overview**: Annual spend estimate, detected pattern counts, review flags, recent transactions, and review alerts.
  - **Recurring Payments**: Filterable table of recurring commitments with confidence badges and interactive detail modal.
  - **Transactions**: Full ledger table with status pills and search.
  - **Evaluation & Audit**: Visual confusion matrix, live benchmark metrics (100% Precision/Recall/F1), audit notes.
- **Dependencies**: `react` 19, `react-dom` 19, `lucide-react`, `vite`, `typescript`. Note: `recharts` and `@tailwindcss/vite` are installed in `package.json`, but `App.css` intentionally uses pure CSS variables to prevent CSS reset collisions.

### 3.6 Data Generation & Validation: `src/generate_dataset.py` & `src/validate_dataset.py`
- **Purpose**: Programmatic generation of synthetic transaction histories covering 8 merchant scenarios.
- **Scenarios Modeled**:
  - `M001` (StreamBee): Fixed subscription (199 INR) + Price hike (199 -> 249 INR) + Irregular one-offs.
  - `M002` (CloudNest): Descriptor shift (`CLDNST DIGITAL` -> `CLOUDNEST RENEWAL`) across two tier streams (599 INR vs 899 INR).
  - `M003` (FitTrail): Annual membership (1499 INR) + Single store purchase (outlier).
  - `M004` (LearnLoop): Annual subscription (2499 INR).
  - `M005` (NewsSpring): Monthly subscription with slight amount variance (310 INR).
  - `M006` (TuneHarbor): Irregular recurring stream (149 INR).
  - `M007` (SafeVault): Trial-to-paid pattern (1 INR verification -> 499 INR monthly).
  - `M008` (PixelForge): Monthly subscription with occasional timing drift (399 INR).

---

## 4. Complete Feature Inventory & Verification Matrix

Below is a point-by-point comparison between claimed features in documentation (`README.md`, `DESIGN.md`, `docs/architecture.md`) and the actual implementation in source code.

| Feature / Capability | Documented Claim | Verified Code Status | Evidence / Implementation Details |
|---|---|---|---|
| **Descriptor Resolution** | Resolves shifting bank descriptors to canonical merchant names via alias map | **VERIFIED** | `config/merchant_aliases.json` maps `CLDNST DIGITAL` & `CLOUDNEST RENEWAL` to `CLOUDNEST`. Applied in `detect_recurring_v3.py` lines 101-105. |
| **Price Tier Separation** | Distinguishes parallel subscription plans under same merchant (e.g. 599 vs 899) | **VERIFIED** | `split_streams()` in `detect_recurring_v3.py` lines 69-93 separates distinct amount groups when ratio > 1.3. |
| **Multi-Cadence Detection** | Identifies Monthly, Quarterly, Annual, and Irregular intervals | **VERIFIED** | Handled in `classify_intervals()` and fallback irregular logic (`detect_recurring_v3.py` lines 56-67, 137-178). |
| **Price-Change Alerts** | Flags charges deviating from historical median beyond threshold | **VERIFIED** | `AMOUNT_OUTLIER_THRESHOLD = 0.10` flags deviations in `detect_recurring_v3.py` lines 204-224; `/api/alerts` exposes them in `api.py`. |
| **Trial-to-Paid Detection** | Detects nominal verification charges (<= 10 INR) preceding recurring amounts | **VERIFIED** | `split_streams()` explicitly preserves rows if `distinct_amounts[0] <= 10.0` (`detect_recurring_v3.py` line 82). |
| **Outlier Isolation** | Rejects one-off purchases from membership streams | **VERIFIED** | Tested on `FITTRAIL` one-off transaction; excluded by `amount_deviation > 0.30` check in `detect_recurring_v3.py` lines 216-220. |
| **Regulatory Cancellation Guide** | Actionable steps referencing Indian frameworks (NPCI, RBI) | **VERIFIED** | Fully implemented in `src/cancellation_guide.py` and exposed via `/api/commitments/{id}` and `/api/cancellation-guide/{pm}`. |
| **Evaluation Benchmark** | Precision, Recall, F1-Score computed against ground-truth labels | **VERIFIED** | Implemented in `src/evaluate_detector_v3.py` and served live at `/api/evaluation`. Live scores: 1.0 / 1.0 / 1.0. |
| **Single-Port Serving** | FastAPI serves both API and React SPA from port 8000 | **VERIFIED** | `src/api.py` lines 609-624 mounts `frontend/dist/assets` and serves `frontend/dist/index.html`. |
| **Warm Editorial Ledger UI** | Paper-toned aesthetic matching `DESIGN.md` | **VERIFIED** | Implemented in `frontend/src/App.css` and `App.tsx` with all tokens (`--canvas`, `--surface`, `--ink`, etc.). |
| **Recharts Spend Trend Chart** | Documented in README as part of Overview page | **DISCREPANCY (REMOVED)** | README claims "Recharts line chart for spend overview", but per `DESIGN.md` line 42, fabricated spend trend chart was removed because no monthly history endpoint exists. `App.tsx` has no Recharts component. |
| **Database Storage** | Planned modules mentioned in `docs/architecture.md` | **DEVIATION (BY DESIGN)** | Architecture planned `src/data_loader.py`, `src/merchant_resolver.py`, etc. Implemented cleanly in consolidated modules `src/detect_recurring_v3.py` and `src/api.py`. Stores data in CSV, not SQL. |
| **Sarvam AI / Neo4j Integration** | Mentioned in `docs/architecture.md` as future exploration | **NOT IMPLEMENTED** | Deferred per architecture notes; not present in source code. |

---

## 5. Algorithmic Deep-Dive

### 5.1 Recurrence Classification & Cadence Heuristics

The cadence classification algorithm operates on debit transaction timestamps:

$$\Delta t_i = \text{Date}_i - \text{Date}_{i-1} \quad (\text{in days})$$

$$\widetilde{\Delta t} = \text{median}(\{\Delta t_1, \Delta t_2, \dots, \Delta t_n\})$$

Cadence classification rules:
- **Monthly**: $28 \le \widetilde{\Delta t} \le 31$
- **Quarterly**: $85 \le \widetilde{\Delta t} \le 95$
- **Annual**: $350 \le \widetilde{\Delta t} \le 380$

Consistency condition:
At least 2 intervals must match the cadence window, and the proportion of matching intervals must be $\ge 50\%$:
$$\text{interval\_consistency} = \frac{|\{\Delta t_k : \text{low} \le \Delta t_k \le \text{high}\}|}{|\{\Delta t\}|} \ge 0.5$$

If no cadence matches, but total span $\ge 60\text{ days}$ and amount spread $\le 10\%$:
$$\text{cadence} = \text{"irregular"}$$

### 5.2 Confidence Scoring Formulation

For established periodic cadences (monthly, quarterly, annual):
$$\text{Confidence} = 0.7 \times \text{interval\_consistency} + 0.3 \times \min\left(\frac{N}{5}, 1.0\right)$$
where $N$ is the number of observed transactions in the stream.

For irregular cadences:
$$\text{Confidence} = 0.5 \times \min\left(\frac{N}{5}, 1.0\right) + 0.5 \times \max\left(0.0, 1.0 - \frac{\text{amount\_spread}}{0.10}\right)$$

### 5.3 Anomaly and Price-Deviation Detection

For each transaction $j$ in stream with median amount $\widetilde{A}$:
$$\text{deviation}_j = \frac{|A_j - \widetilde{A}|}{\widetilde{A}}$$

- If $\text{deviation}_j > 0.10$: transaction flagged with `review_required = True`.
- In an established cadence ($N \ge 4$), if $A_j > 10\text{ INR}$ and $\text{deviation}_j > 0.30$, transaction is classified as an isolated outlier (`predicted_recurring = False`).

---

## 6. API Interface Reference

All endpoints return JSON and are hosted under base URL `http://127.0.0.1:8000`:

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Returns service health, data mode (`synthetic`), and detector version. |
| `GET` | `/api/summary` | None | Returns high-level metrics: total transactions, debit count, detected patterns, estimated annual spend, alert counts. |
| `GET` | `/api/transactions` | `search`, `direction`, `review_required`, `limit`, `offset` | Filtered and paginated transaction ledger. |
| `GET` | `/api/commitments` | `cadence`, `search`, `review_required`, `limit` | Detected recurring commitments ordered by estimated annual cost. |
| `GET` | `/api/commitments/{id}` | Path parameter: `commitment_id` | Full commitment detail including transaction history and cancellation guide. |
| `GET` | `/api/cancellation-guide/{pm}` | Path: `payment_method`, Query: `merchant` | Specific regulatory cancellation guide. |
| `GET` | `/api/alerts` | None | Active amount-deviation and irregular-cadence alerts. |
| `GET` | `/api/evaluation` | None | Live confusion matrix and precision/recall/F1 metrics. |
| `GET` | `/{full_path:path}` | Any SPA path | Serves `frontend/dist/` assets and SPA fallback `index.html`. |

---

## 7. Current Architectural Limitations & Risks

1. **Storage Substrate (CSV Dependency)**:
   - All state is stored in plain CSV files. Every API request reads and parses CSVs from disk synchronously without database indexing or caching.
   - Concurrency risk: Concurrent write operations (regenerating data while API reads) can cause read corruptions.
2. **Hardcoded Cadence Tolerances**:
   - Monthly intervals are strictly bounded to 28–31 days. A charge occurring on the 1st of every month can have a gap of 28, 29, 30, or 31 days. Leap years or delayed bank settlements (e.g. charge posting after a weekend) spanning 32–33 days will fail the monthly interval filter.
3. **Synthetic-Only Data Isolation**:
   - The detector heuristics are finely tuned to the 56 transactions generated by `src/generate_dataset.py`. While this guarantees 100% precision and recall on the benchmark, generalization to messy, real-world bank statements (with variable OTP fees, currency conversions, or UPI reference suffixes) has not been tested against production data.
4. **Environment Python Linkage**:
   - The `.venv` virtual environment in the repository currently references a missing interpreter path (`C:\Python314\python.exe`), requiring direct execution via system python when running pytest outside the container.
5. **Lack of User Authentication & Multi-Tenancy**:
   - All transactions belong to a single global scope. There is no user ID, tenant separation, or access control.

---

## 8. Summary of Inspected Files

All assessments in this document are backed by direct line-by-line inspection of the following files:
- `AGENTS.md`
- `DESIGN.md`
- `README.md`
- `requirements.txt`
- `start_app.ps1`
- `UI_AUDIT.md`
- `config/merchant_aliases.json`
- `data/dataset_specification.md`
- `data/raw/synthetic_transactions.csv`
- `data/raw/ground_truth_labels.csv`
- `data/processed/recurring_candidates_v3.csv`
- `data/processed/transaction_predictions.csv`
- `data/processed/evaluation_v3_errors.csv`
- `docs/architecture.md`
- `docs/data_contract.md`
- `src/api.py`
- `src/cancellation_guide.py`
- `src/detect_recurring_v3.py`
- `src/evaluate_detector_v3.py`
- `src/generate_dataset.py`
- `src/validate_dataset.py`
- `tests/test_api.py`
- `frontend/package.json`
- `frontend/src/App.tsx`
- `frontend/src/App.css`

