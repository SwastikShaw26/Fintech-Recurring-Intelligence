# 🔍 FinSight — Fintech Recurring Intelligence

> **Hackathon:** hackFront India 2026 · **Problem:** T4.1 — The Auto Debits Nobody Can Find
> **Team:** CTRL+SLOTH · **Stage:** Working Prototype & Benchmark Verified ✅

---

## Table of Contents

1. [Vision & Problem Statement](#1-vision--problem-statement)
2. [Key Capabilities](#2-key-capabilities)
3. [Architecture Overview](#3-architecture-overview)
4. [Repository Structure](#4-repository-structure)
5. [Module Reference (Backend)](#5-module-reference-backend)
6. [Frontend Reference](#6-frontend-reference)
7. [REST API Endpoints](#7-rest-api-endpoints)
8. [Data Schemas](#8-data-schemas)
9. [Configuration](#9-configuration)
10. [Quick Start — One Command](#10-quick-start--one-command)
11. [Manual Setup & Running](#11-manual-setup--running)
12. [Running Tests](#12-running-tests)
13. [Evaluation Methodology & Results](#13-evaluation-methodology--results)
14. [Design Decisions & Principles](#14-design-decisions--principles)
15. [Known Limitations](#15-known-limitations)
16. [Team Task Reference](#16-team-task-reference)

---

## 1. Vision & Problem Statement

Banks and UPI apps routinely show transactions with cryptic, shifting merchant descriptors like `CLDNST DIGITAL`, `STRMBEE AUTO`, or `FITTRAIL 24SEPT`. People cannot tell:

- Is this a subscription I'm still paying for?
- Is this a one-off purchase or a recurring charge?
- Did my subscription fee quietly increase last quarter?
- How do I actually cancel — mandate revoke, UPI AutoPay, or something else?

**FinSight** addresses this by applying heuristic pattern analysis to a user's transaction history to surface recurring financial commitments with:

- Plain-language merchant names resolved from cryptic descriptors
- Cadence detection (monthly, quarterly, annual, irregular)
- Price-change alerts with percentage deviation from historical amounts
- Trial-to-paid detection (e.g. Rs.1 auth charge → recurring Rs.299)
- Step-by-step cancellation guidance conforming to **Indian regulatory frameworks** (UPI NPCI, RBI card e-mandate, NACH/eNACH)

---

## 2. Key Capabilities

| Capability | Description |
|---|---|
| **Descriptor Resolution** | Resolves evolving merchant descriptors (e.g. `CLDNST DIGITAL` to `CLOUDNEST RENEWAL`) using the `config/merchant_aliases.json` alias map, without conflating separate price tiers |
| **Multi-Cadence Detection** | Detects Monthly / Quarterly / Annual / Irregular recurring commitments using inter-transaction interval analysis |
| **Outlier Filtering** | Isolates one-off and habitual non-recurring charges (e.g. `FITTRAIL` single store purchase) from recurring memberships |
| **Price-Change Alerts** | Flags unexpected price deviations above a configurable threshold (e.g. StreamBee Rs.199 to Rs.249) with exact % change and dates |
| **Trial-to-Paid Tracking** | Detects nominal authorization token charges (e.g. Rs.1 SafeVault trial) followed by recurring subscriptions |
| **Cancellation Guidance** | Payment-mechanism-specific cancellation steps for UPI AutoPay, Card E-Mandate, and Bank NACH/eNACH — citing actual Indian regulatory circulars |
| **Evaluation Benchmark** | `/api/evaluation` endpoint returns live precision / recall / F1 measured against `ground_truth_labels.csv` |
| **Single-Port Deployment** | FastAPI serves both the REST API **and** the built React SPA from **port 8000** — no separate web server needed |

---

## 3. Architecture Overview

```
+-------------------------------------------------------------+
|                       Browser / Client                      |
|         React 19 SPA (TypeScript + Vite + Recharts)         |
+---------------------------+---------------------------------+
                            |  HTTP  (port 8000)
+---------------------------v---------------------------------+
|              FastAPI Backend  (src/api.py)                  |
|                                                             |
|  /api/summary    /api/commitments    /api/alerts            |
|  /api/txns       /api/evaluation     /api/cancel.*          |
|                                                             |
|  Data Layer  (CSV files)                                    |
|  data/raw/synthetic_transactions.csv                        |
|  data/raw/ground_truth_labels.csv                           |
|  data/processed/recurring_candidates_v3.csv  <- v3 pref     |
|  data/processed/transaction_predictions.csv                 |
|                                                             |
|  Detector Pipeline  (src/)                                  |
|  detect_recurring_v3.py  -> produces candidates_v3.csv      |
|  evaluate_detector_v3.py -> produces evaluation metrics     |
|  cancellation_guide.py   -> generates cancellation steps    |
+-------------------------------------------------------------+
```

**Data flow summary:**

1. `detect_recurring_v3.py` reads `synthetic_transactions.csv` and writes `recurring_candidates_v3.csv` + `transaction_predictions.csv`
2. `evaluate_detector_v3.py` compares `transaction_predictions.csv` against `ground_truth_labels.csv` and prints benchmark metrics
3. `src/api.py` reads the CSV outputs at runtime and serves them as REST JSON responses
4. The React SPA fetches from `http://127.0.0.1:8000/api/*` and renders the dashboard

---

## 4. Repository Structure

```
Fintech-Recurring-Intelligence/
|
+-- src/                          # Python backend
|   +-- api.py                    # FastAPI server & all REST endpoints
|   +-- cancellation_guide.py     # Generates payment-specific cancel steps
|   +-- detect_recurring.py       # v1 baseline detector (reference only)
|   +-- detect_recurring_v3.py    # PRIMARY detector (use this)
|   +-- evaluate_detector_v3.py   # PRIMARY evaluator (use this)
|   +-- generate_dataset.py       # Synthetic data generator
|   +-- validate_dataset.py       # Dataset integrity checker
|   +-- inspect_errors.py         # Debug utility for prediction mismatches
|   +-- __init__.py
|
+-- frontend/                     # React SPA (TypeScript + Vite)
|   +-- src/
|   |   +-- App.tsx               # Single-page app (all pages & components)
|   |   +-- App.css               # Full design system (dark FinTech theme)
|   |   +-- index.css             # Global base reset (no Tailwind import)
|   |   +-- main.tsx              # React entry point
|   +-- dist/                     # Built production assets (served by FastAPI)
|   +-- package.json
|   +-- vite.config.ts
|
+-- data/
|   +-- raw/
|   |   +-- synthetic_transactions.csv   # 56 synthetic debit transactions
|   |   +-- ground_truth_labels.csv      # Ground truth: is_recurring per TX
|   +-- processed/
|       +-- recurring_candidates_v3.csv  # Detector output: recurring groups
|       +-- transaction_predictions.csv  # Detector output: per-TX prediction
|
+-- config/
|   +-- merchant_aliases.json     # Descriptor -> canonical merchant name map
|
+-- tests/
|   +-- test_api.py               # Pytest test suite for all API endpoints
|
+-- docs/
|   +-- team_task_tracker.md      # Team assignment tracker
|
+-- start_app.ps1                 # One-click PowerShell launcher
+-- README.md                     # This file
```

---

## 5. Module Reference (Backend)

### `src/detect_recurring_v3.py` — PRIMARY DETECTOR

The core detection engine. Reads raw transactions and produces two CSV outputs.

**What it does (step by step):**

1. **Descriptor normalization** — Applies `config/merchant_aliases.json` to normalize cryptic bank strings to canonical merchant names (e.g. `CLDNST*` variants become `CLOUDNEST`)
2. **Interval analysis** — Groups transactions by normalized descriptor and calculates median intervals between consecutive dates
3. **Cadence classification** — Monthly (25–35 days), Quarterly (80–100 days), Annual (340–390 days), or Irregular
4. **Outlier detection** — Removes transactions whose amount deviates significantly from the group's median
5. **Single-purchase rejection** — Groups with only one non-outlier transaction after filtering are rejected as non-recurring
6. **Confidence scoring** — Heuristic score (0–1) based on occurrence count, interval consistency, and amount stability
7. **Price-change detection** — Flags transactions where amount deviates from the median beyond the review threshold

**Outputs written to `data/processed/`:**

| File | Description |
|---|---|
| `recurring_candidates_v3.csv` | One row per recurring merchant group |
| `transaction_predictions.csv` | One row per transaction with `predicted_recurring`, `review_required`, `heuristic_confidence` |

**Key columns in `recurring_candidates_v3.csv`:**

| Column | Description |
|---|---|
| `candidate_id` | Unique group identifier |
| `display_name` | Resolved canonical merchant name |
| `cadence` | `monthly` / `quarterly` / `annual` / `irregular` |
| `typical_amount` | Median observed charge amount (INR) |
| `heuristic_confidence` | 0–1 confidence score |
| `occurrence_count` | Number of valid recurring transactions |
| `evidence` | Comma-separated transaction IDs in the group |
| `payment_method` | Most common payment method in the group |
| `last_seen_date` | Date of most recent occurrence |
| `estimated_next_date` | Projected next occurrence date |

---

### `src/api.py` — FASTAPI BACKEND

FastAPI server exposing REST endpoints and serving the built React SPA.

**Important:** The processed CSVs must exist before starting the API. The API reads files at request time — there is no database.

**Static file serving:** If `frontend/dist/` exists, it is mounted at `/` so the full SPA is served from the same port 8000 as the API.

**CORS:** Wildcard (`*`) for development. Restrict to your domain in production.

---

### `src/cancellation_guide.py`

Generates structured cancellation guidance based on the payment method detected for each commitment. Returns:

| Field | Description |
|---|---|
| `mechanism` | UPI AutoPay, Card E-Mandate, or Bank NACH |
| `regulatory_framework` | Applicable Indian regulatory circular |
| `summary` | Plain-language one-paragraph summary |
| `steps` | Ordered list of actionable cancellation steps |
| `important_notes` | Caveats (e.g. cancelling does not guarantee a refund) |

Referenced regulatory frameworks:
- **UPI AutoPay**: NPCI Circular OC No. 223
- **Card E-Mandate**: RBI Circular RBI/2024-25/64
- **NACH/eNACH**: NPCI NACH mandate management

---

### `src/evaluate_detector_v3.py` — PRIMARY EVALUATOR

Compares `transaction_predictions.csv` against `ground_truth_labels.csv`. Only evaluates **debit** transactions.

Metrics: Precision, Recall, F1-Score, Accuracy, TP, TN, FP, FN, and per-error breakdown.

Run this before every demo to confirm the detector is still performing correctly.

---

### `src/validate_dataset.py`

Checks integrity of `synthetic_transactions.csv`:
- Required column presence
- No duplicate transaction IDs
- Amount is numeric and positive
- Date is parseable
- Direction is `debit` or `credit`

Run if you modify or regenerate the dataset.

---

### `src/generate_dataset.py`

Generates a fresh `synthetic_transactions.csv` with configurable merchant scenarios (descriptor changes, trials, price hikes, annual renewals, one-off purchases).

**WARNING: Do not re-run during a demo.** The ground truth labels in `ground_truth_labels.csv` are hand-tuned to the current dataset version.

---

### `src/inspect_errors.py`

Debug utility that prints false positives and false negatives alongside their raw transaction records. Use after changing detector thresholds.

---

## 6. Frontend Reference

### Technology Stack

| Technology | Version | Role |
|---|---|---|
| React | 19.x | UI framework |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Build tool & dev server |
| Recharts | 3.x | Line chart for spend overview |
| Lucide React | 1.x | Icon library |
| Tailwind CSS | 4.x | Installed via `@tailwindcss/vite` — NOT used in app CSS (custom design system in App.css is used instead) |

### Pages

The SPA is a single `App.tsx` file. Page state is `useState('Overview')`. No routing library is needed.

| Page | What it shows |
|---|---|
| **Overview** | 4 metric cards, illustrative spend trend chart, review queue (top 5 alerts), detected patterns preview table |
| **Recurring Payments** | Full commitment table with search filter, confidence pills, cadence badges, clickable rows |
| **Transactions** | Full transaction ledger with payment method, direction, review flag, and amount |
| **Evaluation & Audit** | Live benchmark metrics from `/api/evaluation`, TP/TN/FP/FN breakdown, audit highlights |

### Detail Modal

Clicking any commitment row opens a modal with:
- Merchant name, typical amount, cadence, confidence score
- Detection evidence (supporting transaction IDs)
- Review flag with flagged transaction count
- Full cancellation guide (mechanism, regulatory ref, steps, important notes)

### Environment

`frontend/.env`:
```
VITE_API_URL=http://127.0.0.1:8000
```
Override for production deployment.

### Commands

```powershell
# Install dependencies
cd frontend && npm install

# Hot-reload dev server (port 5173)
npm run dev

# Production build -> frontend/dist/ (served by FastAPI)
npm run build
```

---

## 7. REST API Endpoints

Base URL: `http://127.0.0.1:8000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/summary` | Dashboard stats — total commitments, annual spend estimate, alert count |
| GET | `/api/transactions` | All transactions enriched with detector predictions |
| GET | `/api/commitments` | All detected recurring patterns with cancellation guidance |
| GET | `/api/alerts` | Price-change and review alerts |
| GET | `/api/evaluation` | Live benchmark metrics against ground truth |
| GET | `/docs` | FastAPI Swagger UI — interactive API explorer |
| GET | `/redoc` | ReDoc API documentation |
| GET | `/` | Serves the React SPA from `frontend/dist/` |

### `/api/summary` response

```json
{
  "total_transactions": 56,
  "total_commitments": 12,
  "estimated_annual_cost": 42180.0,
  "review_required_count": 4,
  "review_required_transaction_count": 6,
  "alert_count": 4
}
```

### `/api/commitments` response (abbreviated)

```json
{
  "commitments": [
    {
      "commitment_id": "c_abc123",
      "display_name": "CloudNest",
      "cadence": "monthly",
      "typical_amount": 299.0,
      "heuristic_confidence": 0.92,
      "occurrence_count": 6,
      "review_required": false,
      "evidence": ["TXN-00001", "TXN-00004"],
      "payment_method": "UPI AutoPay",
      "cancellation_guidance": {
        "mechanism": "UPI AutoPay",
        "regulatory_framework": "NPCI Circular OC No. 223",
        "summary": "...",
        "steps": ["Open your UPI app (PhonePe/GPay/Paytm)", "..."],
        "important_notes": ["..."]
      }
    }
  ]
}
```

### `/api/evaluation` response

```json
{
  "precision": 1.0,
  "recall": 1.0,
  "f1_score": 1.0,
  "accuracy": 1.0,
  "true_positives": 45,
  "true_negatives": 11,
  "false_positives": 0,
  "false_negatives": 0,
  "evaluated_transactions": 56
}
```

---

## 8. Data Schemas

### `data/raw/synthetic_transactions.csv`

| Column | Type | Description |
|---|---|---|
| `transaction_id` | string | Unique ID e.g. `TXN-00001` |
| `date` | YYYY-MM-DD | Transaction date |
| `description` | string | Raw bank descriptor (may be cryptic) |
| `amount` | float | Amount in INR |
| `direction` | string | `debit` or `credit` |
| `payment_method` | string | `UPI AutoPay`, `Card E-Mandate`, `NACH`, etc. |
| `reference_id` | string | Optional bank reference number |

### `data/raw/ground_truth_labels.csv`

| Column | Type | Description |
|---|---|---|
| `transaction_id` | string | Matches `synthetic_transactions.csv` |
| `is_recurring` | True/False | Hand-labelled ground truth |

### `data/processed/recurring_candidates_v3.csv`

| Column | Type | Description |
|---|---|---|
| `candidate_id` | string | Unique group ID |
| `display_name` | string | Resolved canonical merchant name |
| `cadence` | string | `monthly` / `quarterly` / `annual` / `irregular` |
| `typical_amount` | float | Median charge amount |
| `heuristic_confidence` | float | 0–1 score |
| `occurrence_count` | int | Number of recurring transactions |
| `evidence` | string | Comma-separated transaction IDs |
| `payment_method` | string | Most common payment method |
| `last_seen_date` | date | Most recent occurrence |
| `estimated_next_date` | date | Projected next occurrence |

### `config/merchant_aliases.json`

Maps descriptor variants to a canonical merchant name:

```json
{
  "CLDNST": "CloudNest",
  "CLOUDNEST": "CloudNest",
  "STRMBEE": "StreamBee",
  "SFVLT": "SafeVault"
}
```

**To add a new merchant:** Add an entry for each bank descriptor variant. The detector uses case-insensitive prefix matching.

---

## 9. Configuration

### Backend path constants (src/api.py)

```
TRANSACTIONS_FILE  = data/raw/synthetic_transactions.csv
LABELS_FILE        = data/raw/ground_truth_labels.csv
CANDIDATES_V3_FILE = data/processed/recurring_candidates_v3.csv  (preferred)
CANDIDATES_V2_FILE = data/processed/recurring_candidates.csv      (fallback)
PREDICTIONS_FILE   = data/processed/transaction_predictions.csv
FRONTEND_DIST      = frontend/dist
```

The API automatically falls back to v2 candidates if v3 is absent.

### Frontend (frontend/.env)

```
VITE_API_URL=http://127.0.0.1:8000
```

Change to your deployed backend URL for remote hosting.

---

## 10. Quick Start — One Command

```powershell
.\start_app.ps1
```

This script:
1. Activates the `.venv` Python virtual environment
2. Runs `detect_recurring_v3.py` to regenerate detector output
3. Runs `evaluate_detector_v3.py` to verify benchmark metrics
4. Starts the FastAPI server on port 8000

- **Dashboard:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

---

## 11. Manual Setup & Running

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- PowerShell (Windows)

### Step 1 — Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn
```

If a `requirements.txt` exists: `pip install -r requirements.txt`

### Step 2 — Run the detector (required before API start)

```powershell
python src/detect_recurring_v3.py
```

Writes output to `data/processed/`.

### Step 3 — Verify benchmark

```powershell
python src/evaluate_detector_v3.py
```

Expected: Precision 100%, Recall 100%, F1 1.000.

### Step 4 — Build the frontend (optional — dist is pre-committed)

```powershell
cd frontend
npm install
npm run build
cd ..
```

### Step 5 — Start the API server

```powershell
python -m uvicorn src.api:app --host 127.0.0.1 --port 8000 --reload
```

| URL | Content |
|---|---|
| http://localhost:8000 | React SPA dashboard |
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8000/api/summary | JSON API response |

### Step 6 — Frontend dev server (optional, hot-reload)

```powershell
cd frontend && npm run dev
```

Runs on http://localhost:5173.

---

## 12. Running Tests

```powershell
python -m pytest tests -v
```

Tests in `tests/test_api.py` cover:
- All endpoint status codes (200)
- Required response keys present
- Metric values in valid ranges (0–1)
- Transaction and commitment count assertions

Ensure `.venv` is activated and run from the project root.

---

## 13. Evaluation Methodology & Results

### How evaluation works

`evaluate_detector_v3.py` performs **transaction-level binary classification**:

1. Loads `transaction_predictions.csv` — detector output
2. Loads `ground_truth_labels.csv` — hand-labelled ground truth
3. Joins on `transaction_id`
4. Evaluates **debit transactions only** (credits excluded)
5. Compares `predicted_recurring` vs `is_recurring`
6. Computes Precision / Recall / F1 / Accuracy

### Results

| Metric | Score | Notes |
|---|---|---|
| Precision | **100.0%** | Zero false alarms |
| Recall | **100.0%** | All 45 recurring transactions found |
| F1-Score | **1.000** | Perfect harmonic mean |
| Accuracy | **100.0%** | 56/56 debit transactions correct |
| True Positives | 45 | Monthly, quarterly, annual, irregular |
| True Negatives | 11 | Single purchases, refunds, habitual non-recurring |
| False Positives | 0 | — |
| False Negatives | 0 | — |

### Challenging scenarios correctly handled

| Scenario | Example | Result |
|---|---|---|
| Descriptor change | `CLDNST DIGITAL` to `CLOUDNEST RENEWAL` | Grouped as same merchant |
| Separate price tiers | CloudNest Basic vs Pro | Treated as separate groups |
| Single purchase | FITTRAIL gym visit (one-off) | Correctly rejected |
| Trial-to-paid | Rs.1 SafeVault auth to Rs.149/month | Rs.1 excluded; recurring detected |
| Price increase | StreamBee Rs.199 to Rs.249 | Recurring + price alert raised |
| Irregular cadence | Quarterly with varying intervals | Classified as irregular, still flagged |

---

## 14. Design Decisions & Principles

**1. Synthetic data only**
All data is programmatically generated. No real financial data is used. Safe to demo, share, and open-source.

**2. Heuristic detector, not ML**
The detector is entirely rule-based — every prediction traces to a specific rule, no training data needed, and evaluation is deterministic.

**3. Evidence-backed outputs**
Every commitment includes the transaction IDs used as evidence, shown in the detail modal. Avoids black-box feel.

**4. Distinguish observations from inferences**
- Observed fact: "We saw 6 transactions from this merchant at ~30-day intervals"
- Statistical inference: "This is consistent with a monthly recurring charge"
- Never stated: "You have an active subscription" or "Your mandate is live"

**5. Regulatory specificity**
Cancellation guidance cites actual Indian frameworks (NPCI Circular OC No. 223, RBI Circular RBI/2024-25/64) — real utility beyond detection.

**6. Single-port deployment**
FastAPI mounts the React dist at `/` — one `uvicorn` process serves everything. No nginx needed.

---

## 15. Known Limitations

| Limitation | Notes |
|---|---|
| CSV-based data store | Replace with SQLite or Postgres for production |
| Detector re-run required after data changes | `start_app.ps1` handles this automatically |
| Spend trend chart is illustrative | Derived from current estimate, not historical monthly data |
| No authentication or multi-user support | Single-user demo prototype |
| Large frontend bundle (600KB) | Expected: Recharts is large. Use dynamic imports in production |
| Tailwind installed but not imported in app CSS | `App.css` is the custom design system. `index.css` does NOT import Tailwind to avoid CSS reset conflicts |

---

## 16. Team Task Reference

See [docs/team_task_tracker.md](docs/team_task_tracker.md) for current task assignments.

### Module ownership

| Module | File to edit | Notes |
|---|---|---|
| Detection logic | `src/detect_recurring_v3.py` | Interval thresholds, confidence formula, outlier rules |
| API endpoints | `src/api.py` | Add endpoints or modify response shapes |
| Cancellation guidance | `src/cancellation_guide.py` | Add/update steps per payment method |
| Merchant aliases | `config/merchant_aliases.json` | Add new descriptor variants |
| Frontend UI | `frontend/src/App.tsx` | All pages and components |
| Frontend styles | `frontend/src/App.css` | Dark FinTech design system |
| Tests | `tests/test_api.py` | Add endpoint assertions here |
| Dataset | `src/generate_dataset.py` | Re-generate data (update ground truth labels too) |

### To add a new merchant to the demo

1. Add transactions to `data/raw/synthetic_transactions.csv`
2. Add ground truth labels to `data/raw/ground_truth_labels.csv`
3. Add descriptor aliases to `config/merchant_aliases.json`
4. Run `python src/detect_recurring_v3.py`
5. Verify with `python src/evaluate_detector_v3.py`

---

*FinSight · Built for recurring payment transparency · hackFront India 2026*
*All transaction data is synthetic. Not financial advice.*
