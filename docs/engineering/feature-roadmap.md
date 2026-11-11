# FinSight: Evidence-Backed Feature & Improvement Roadmap

**Document**: `docs/engineering/feature-roadmap.md`  
**Author**: Lead Engineering Orchestrator  
**Audit Inputs**: `docs/engineering/project-understanding.md`, `docs/engineering/audit-findings.md`  
**Methodology**: Grounded technical research, competitor benchmark analysis (Rocket Money, Paylert, Copilot), regulatory framework verification (NPCI UPI AutoPay OC No. 223, RBI/2024-25/64), and empirical audit evidence.

---

## 1. Executive Summary & Research Context

Following the comprehensive audit in `audit-findings.md`, FinSight stands at an inflection point. The project possesses a well-structured domain vision and an elegant editorial ledger UI, but its core detection intelligence is artificially constrained by:
1. **Circularity & Overfitting**: A 100% benchmark achieved on 56 transactions without an adversarial or held-out test split.
2. **Brittle Heuristics**: Rigid calendar windows (28–31 days) and strict exact-match descriptor normalization that fail under standard Indian banking variances (weekend settlement delays, month-end drift, UPI handle alterations).
3. **Architectural Bottlenecks**: Synchronous per-request CSV file parsing and unhardened wildcard CORS middleware.

This roadmap prioritizes **foundational algorithmic credibility and robustness first**, followed by essential user capabilities (CSV ingestion, statement parsing, actionable mandate tracking), before advancing to advanced analytics.

---

## 2. Comparative Evaluation Matrix & Scoring Methodology

### Scoring Model
Each candidate is scored across five objective criteria on a scale of 1 to 5:
- **User Value (UV, weight 25%)**: Practical impact on uncovering hidden commitments and saving money.
- **Foundational Correctness (FC, weight 30%)**: Remediation of core defects, data leakage, and algorithmic fragility discovered in the audit.
- **Technical Feasibility (TF, weight 15%)**: Compatibility with current FastAPI/React architecture without adding unmanageable complexity.
- **Engineering Portfolio Rigor (PR, weight 15%)**: Demonstration of elite engineering, property-based testing, and mathematical rigor.
- **Risk & Maintenance Overhead (RM, weight 15% - inverse)**: Ease of maintenance and low operational risk.

$$\text{Score} = (0.25 \times \text{UV}) + (0.30 \times \text{FC}) + (0.15 \times \text{TF}) + (0.15 \times \text{PR}) + (0.15 \times \text{RM})$$

---

## 3. Ranked Recommendations (P0 to P3)

### Priority P0: Critical Foundational Fixes (Pre-requisites for any new features)

#### 1. Robust Temporal Cadence Engine & Settlement-Drift Tolerances
- **Problem**: Current monthly window strictly requires 28–31 day intervals. Debits delayed by bank holidays, month-end clustering (Jan 31 to Feb 28), or leap years fail the interval consistency check and get misclassified.
- **Evidence**: `audit-findings.md` §2.1; `detect_recurring_v3.py:20-24`.
- **Expected Behavior**: Algorithm evaluates calendar-day-of-month alignment (e.g. charge occurring within $\pm 3$ days of previous month's day) rather than raw integer day counts alone. Monthly window expanded to 26–35 days with holiday adjustment heuristics.
- **Existing Components**: `src/detect_recurring_v3.py` (`classify_intervals`, `CADENCES`).
- **Complexity**: Medium | **Prerequisites**: None | **Score**: **4.85**
- **Acceptance Criteria**: Detection engine correctly identifies monthly recurrences across Jan 31 $\to$ Feb 28 $\to$ Mar 31 and Friday debit $\to$ Monday settlement (33 days) with 0 false negatives.

#### 2. Fuzzy Merchant Normalization & Token-Based Entity Resolution
- **Problem**: Descriptors are normalized using static exact dictionary keys (`aliases.get(desc, desc)`). Real-world statements contain varying transaction IDs, terminal numbers, and UPI prefixes (e.g., `UPI/CLDNST/928374/RENEW` vs `CLDNST DIGITAL`).
- **Evidence**: `detect_recurring_v3.py:101-105`; `config/merchant_aliases.json`.
- **Expected Behavior**: Multi-stage normalizer: (1) Strips common banking noise tokens (`UPI/`, `NEFT-`, `POS`, `AUTOPAY`, trailing digits/dates); (2) Performs substring prefix matching and token-set fuzzy matching against canonical merchants; (3) Returns a resolution confidence score.
- **Existing Components**: `config/merchant_aliases.json`, `src/detect_recurring_v3.py`.
- **Complexity**: Medium | **Prerequisites**: None | **Score**: **4.70**
- **Acceptance Criteria**: Identifies `CLDNST*DIGITAL 01` and `UPI-CLOUDNEST-SUB` as `CloudNest` with resolution confidence $\ge 0.90$.

#### 3. API Security Hardening & Origin Isolation
- **Problem**: Wildcard CORS `allow_origins=["*"]` configured alongside `allow_credentials=True` allows cross-origin requests from any untrusted browser tab. Lack of query limits allows unindexed DoS scans.
- **Evidence**: `audit-findings.md` §4.1; `src/api.py:32-38`.
- **Expected Behavior**: CORS restricted to verified localhost origins (`http://localhost:5173`, `http://127.0.0.1:8000`). Safe query parameter bounds and HTTP headers enforced.
- **Existing Components**: `src/api.py`.
- **Complexity**: Low | **Prerequisites**: None | **Score**: **4.65**
- **Acceptance Criteria**: Pre-flight OPTIONS from unauthorized origins (e.g., `attacker.com`) returns 403 Forbidden; authorized frontend origins return 200 OK.

---

### Priority P1: Essential Product Features

#### 4. Adversarial Holdout Benchmark & Property-Based Test Suite
- **Problem**: 100% precision/recall claims are circular because the detector was tuned directly against the 56 synthetic training transactions.
- **Evidence**: `audit-findings.md` §2.1; `research/04_technical_research.md` §6.
- **Expected Behavior**: Decouple synthetic generation into a training set and an independent adversarial held-out evaluation set (with noise, random one-offs, GST adjustments, and bank holidays). Implement property tests via `hypothesis` ensuring mathematical invariants hold.
- **Existing Components**: `src/generate_dataset.py`, `src/evaluate_detector_v3.py`, `tests/test_api.py`.
- **Complexity**: Medium | **Prerequisites**: P0.1, P0.2 | **Score**: **4.55**
- **Acceptance Criteria**: Evaluator runs on 150+ held-out transactions with independently documented Precision/Recall/F1; property test suite passes 100 iterations.

#### 5. In-Memory SQLite Caching Layer
- **Problem**: Repetitive synchronous CSV file parsing on every HTTP request creates latency and risks file corruption during batch runs.
- **Evidence**: `audit-findings.md` §3.1; `src/api.py:56-64`.
- **Expected Behavior**: `src/api.py` loads processed CSVs into an in-memory SQLite database on startup (or when files change), providing indexed queries for transactions, pagination, and commitments.
- **Existing Components**: `src/api.py`.
- **Complexity**: Medium | **Prerequisites**: P0.3 | **Score**: **4.30**
- **Acceptance Criteria**: Endpoints serve responses from in-memory SQLite in $<10\text{ms}$; file lock contention eliminated.

#### 6. User Transaction CSV Upload & Parsing Pipeline
- **Problem**: Application only analyzes pre-baked static synthetic data. Users cannot upload their own bank/UPI CSV statements to discover their subscriptions.
- **Evidence**: User Problem Context; `README.md` Limitations.
- **Expected Behavior**: Provide a multipart file upload endpoint (`POST /api/upload`) and frontend upload zone supporting standard Indian bank CSV formats (HDFC, ICICI, SBI) or a generic schema. Ingested transactions are analyzed on-the-fly and rendered in the dashboard.
- **Existing Components**: `src/api.py`, `frontend/src/App.tsx`.
- **Complexity**: High | **Prerequisites**: P0.1, P0.2, P1.5 | **Score**: **4.25**
- **Acceptance Criteria**: Uploading a 100-row standard CSV parses transactions, executes detection, and refreshes the dashboard view without server restart.

#### 7. Dependency & Bundle Cleanup (Dead Code Removal)
- **Problem**: `recharts` and `tailwindcss` are declared in `frontend/package.json` and bundled in dist, but `recharts` is unused in `App.tsx` and custom CSS is used instead of Tailwind.
- **Evidence**: `audit-findings.md` §3.2; `frontend/package.json`.
- **Expected Behavior**: Remove unused dependencies, clean up `dist/` build artifacts, and update `package.json`.
- **Existing Components**: `frontend/package.json`, `frontend/vite.config.ts`.
- **Complexity**: Low | **Prerequisites**: None | **Score**: **4.15**
- **Acceptance Criteria**: `npm run build` succeeds cleanly; JavaScript asset bundle size reduced by >200KB; zero regressions in UI rendering.

---

### Priority P2: Valuable Enhancements

#### 8. Interactive Mandate Cancellation Checklist & Status Tracker
- **Problem**: Cancellation guidance is currently static text in a modal. Users have no way to mark mandates as "Revocation Initiated", "Paused", or "Confirmed Revoked".
- **Evidence**: `research/02_india_payment_ecosystem.md`; `src/cancellation_guide.py`.
- **Expected Behavior**: Interactive step-by-step checklist inside the detail modal allowing users to track their cancellation progress with persistent local storage.
- **Existing Components**: `src/cancellation_guide.py`, `frontend/src/App.tsx`.
- **Complexity**: Medium | **Prerequisites**: None | **Score**: **3.85**
- **Acceptance Criteria**: Users can tick off cancellation steps; state persists across browser reloads.

#### 9. GST Surcharge & Dynamic Price Fluctuation Tolerances
- **Problem**: Subscriptions subject to variable usage, foreign exchange, or GST adjustments (e.g. 18% GST added intermittently) are currently treated as `irregular` or discarded.
- **Evidence**: `audit-findings.md` §2.1; Indian billing practices.
- **Expected Behavior**: Detect base fee invariant ($A_{\text{net}} \times 1.18 \approx A_{\text{gross}}$) and recognize recurring commitments even when taxes fluctuate.
- **Existing Components**: `src/detect_recurring_v3.py`.
- **Complexity**: Medium | **Prerequisites**: P0.1 | **Score**: **3.70**
- **Acceptance Criteria**: Variable amounts matching standard tax brackets (e.g. INR 499 $\to$ INR 588.82) preserve monthly cadence classification.

#### 10. Multi-Cadence Resumption & Trial-to-Paid Timeline Visualization
- **Problem**: The UI shows list views but lacks a visual chronological timeline illustrating the trial charge $\to$ active subscription $\to$ price hike transition.
- **Evidence**: `DESIGN.md`; `data/dataset_specification.md`.
- **Expected Behavior**: Lightweight SVG/HTML horizontal timeline rendered in the commitment detail dialog.
- **Existing Components**: `frontend/src/App.tsx`, `frontend/src/App.css`.
- **Complexity**: Medium | **Prerequisites**: None | **Score**: **3.60**
- **Acceptance Criteria**: Commitment modal renders a chronological milestone track for supporting transactions.

---

### Priority P3: Optional Future Capabilities

#### 11. Multilingual Indian Language Explanations (Sarvam AI / Indic LLM)
- **Problem**: Cancellation guidance and alerts are English-only, limiting accessibility for vernacular users across Indian states.
- **Evidence**: `docs/architecture.md` §Future Integrations.
- **Expected Behavior**: Translate cancellation instructions and alerts into Hindi, Tamil, Telugu, and Marathi.
- **Complexity**: High | **Prerequisites**: P1.6 | **Score**: **3.10**

#### 12. Neo4j Graph-Based Entity & Aggregator Linking
- **Problem**: Complex merchant aggregators (Razorpay, BillDesk, Cashfree) mask end-merchants under common gateway descriptors.
- **Evidence**: `docs/architecture.md` §Future Integrations.
- **Expected Behavior**: Build a graph database mapping UPI VPA handles $\leftrightarrow$ payment gateways $\leftrightarrow$ merchants.
- **Complexity**: High | **Prerequisites**: P1.6 | **Score**: **2.80**

---

## 4. Top Three Candidate Recommendations for Next Development Cycle

The three highest-leverage improvements selected for the immediate cycle are:

```
+-----------------------------------------------------------------------------------+
|               Candidate 1: Robust Temporal Cadence Engine (P0.1)                  |
|  Eliminates calendar-window brittleness, settlement drift, and false negatives    |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|               Candidate 2: Fuzzy Merchant Normalization Engine (P0.2)             |
|  Replaces brittle exact-matching with noise stripping and prefix/token matching    |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|               Candidate 3: Adversarial Holdout Benchmark & Test Suite (P1.4)      |
|  Establishes true empirical validity, holdout evaluation, and property tests     |
+-----------------------------------------------------------------------------------+
```

### Why These Three Were Selected & Implementation Sequence

1. **Candidate 1: Robust Temporal Cadence Engine & Settlement-Drift Tolerances (P0.1)**
   - *Why*: This directly fixes the fundamental classification flaw identified in the audit. Hardcoding 28–31 days breaks the moment a payment settles across a weekend (32–33 days) or in February. Without fixing this, all downstream detection is inherently brittle.
   - *Sequence*: Must be implemented first to establish valid temporal primitives.

2. **Candidate 2: Fuzzy Merchant Normalization & Token-Based Entity Resolution (P0.2)**
   - *Why*: The current system relies on exact string dictionary lookups. In reality, bank descriptors vary with reference codes and terminal tags. Expanding this ensures the detector groups real transactions accurately before temporal analysis occurs.
   - *Sequence*: Built immediately after temporal logic to ensure merchant groups fed into the cadence engine are clean and coherent.

3. **Candidate 3: Adversarial Holdout Benchmark & Property-Based Test Suite (P1.4)**
   - *Why*: The project currently reports a misleading "100% precision/recall" on 56 non-held-out training rows. Implementing an independent holdout generator and property-based test suite (`hypothesis`) establishes genuine scientific credibility and verifies that Candidates 1 & 2 actually generalize.
   - *Sequence*: Evaluates the combined efficacy of Candidates 1 & 2 against genuine adversarial challenges.

