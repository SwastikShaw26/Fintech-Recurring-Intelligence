# FinSight: Independent Feature Roadmap Review & Synthesis

**Document**: `docs/engineering/roadmap-review.md`  
**Review Panel Methodology**: Multi-perspective specialist evaluation using `panel-review` principles.  
**Auditor Panel Composition**:
1. **Senior Software Architect** (Subagent `642aa3cb-996c-448d-8db8-6dbcd9fa39e3`)
2. **Product Strategy Reviewer** (Subagent `0ff770ae-4466-4d2a-968d-865956395048`)
3. **Principal Quality & Security Reviewer** (Subagent `e4151ed3-2821-4b89-9b9e-a44ecdc16d96`)

---

## 1. Executive Summary & Review Objectives

The proposed roadmap ([`docs/engineering/feature-roadmap.md`](file:///d:/Projects/Fintech-Recurring-Intelligence/docs/engineering/feature-roadmap.md)) correctly targeted major pain points discovered in the audit ([`docs/engineering/audit-findings.md`](file:///d:/Projects/Fintech-Recurring-Intelligence/docs/engineering/audit-findings.md)). However, the specialist panel uncovered critical structural flaws in the proposal:

1. **Inverted Sequencing**: The roadmap proposed refactoring core heuristics (**P0.1**, **P0.2**) *before* establishing an independent evaluation benchmark (**P1.4**). Changing heuristics without an external test oracle would perpetuate the circular "100% precision/recall" fallacy.
2. **Premature Optimization (SQLite Caching)**: The proposed in-memory SQLite layer (**P1.5**) introduces unnecessary schema and SQL overhead for small datasets (<5,000 transactions) when a clean in-memory Python cache loaded via FastAPI lifespan accomplishes $<1\text{ms}$ query speed with zero complexity.
3. **Fuzzy Normalization Collision Hazard**: Unconstrained Levenshtein/token fuzzy matching (**P0.2**) creates catastrophic cross-merchant collisions on real banking strings.
4. **Statement Upload Security Gaps**: User statement CSV ingestion (**P1.6**) is high-value but critically premature until security sanitization (CSV injection, file size limits, PII masking) and core detector reliability are established.

---

## 2. Individual Reviewer Findings

### 2.1 Senior Software Architect
- **Cadence Engine (P0.1)**: **KEEP**. Day-of-month clustering ($\pm 3$ days) and calendar awareness are technically feasible within standard Python `datetime.date` without introducing heavy time-series dependencies.
- **Merchant Normalization (P0.2)**: **MODIFY**. Unconstrained pairwise fuzzy matching ($O(N^2)$) risks merging distinct merchants. Must be replaced with a deterministic 2-stage canonicalizer: token noise stripper regex + canonical prefix trie.
- **SQLite Caching (P1.5)**: **REJECT / POSTPONE**. SQLite is unjustified overhead for <5,000 transactions. An in-memory Python dictionary cache loaded during FastAPI startup (`@app.lifespan`) solves the per-request disk I/O problem cleanly.
- **Statement CSV Upload (P1.6)**: **POSTPONE**. Handling multi-bank formats before the core engine is robust exposes brittle failure modes to the end-user.
- **Dependency Cleanup (P1.7)**: **KEEP**. Immediate quick win: removing unused `recharts` and `tailwindcss` from `frontend/package.json` eliminates ~600KB of dead bundle weight.

### 2.2 Product Strategy Reviewer
- **Alignment with T4.1 Mission**: FinSight's core purpose is uncovering hidden, shifting recurring debits.
- **Ecosystem Realities**: Indian bank statements routinely exhibit settlement drift (Friday debit clearing Monday) and noisy prefixes (`UPI/`, `POS/`, `AUTOPAY/`). P0.1 and P0.2 are direct, acute user necessities.
- **User CSV Ingestion (P1.6)**: Stressed as the single most important user-facing capability, but acknowledged that building ingestion on an inaccurate detector is self-defeating.
- **Rejection of Engineering Distractions**: Strongly agreed that SQLite caching (**P1.5**) and advanced graph/LLM integrations (**P3**) are low-value distractions for an early-stage prototype.

### 2.3 Quality and Security Reviewer
- **Circular Benchmark Trap**: In `evaluate_detector_v3.py`, 100% accuracy is achieved because the heuristics grade their own synthetic homework. **The holdout benchmark (P1.4) MUST be promoted to Phase 0 / Step 1** as the objective validation gate before altering any heuristics.
- **CORS Misconfiguration (P0.3)**: `allow_origins=["*"]` + `allow_credentials=True` violates security best practices and must be restricted to explicit localhost origins immediately.
- **CSV Injection & PII Hazards (P1.6)**: Exposing a public CSV upload without formula sanitization (`=CMD|...`), file size caps, or PII masking creates severe injection and compliance vulnerabilities.

---

## 3. Disagreements Between Reviewers & Resolutions

| Topic / Issue | Architect Perspective | Product Perspective | Security/QA Perspective | Resolution & Consensus |
|---|---|---|---|---|
| **P1.5: In-Memory SQLite Caching** | Reject as premature optimization; replace with in-memory Python dict cache. | Reject; adds zero user value and diverts time from statement ingestion. | Kept to prevent file lock contention during batch runs. | **Resolved: REJECT SQLite; ADOPT Python in-memory state cache.** Caching CSVs into module/app memory during FastAPI lifespan eliminates disk I/O and race conditions without adding SQL/ORM overhead. |
| **P1.6: User CSV Statement Ingestion** | Postpone to Stage 2 after core engine stabilizes. | Top priority product capability; platform is a mock without it. | Postpone until file upload security, CSV injection defenses, and rate limiting exist. | **Resolved: POSTPONE to Phase 3 (Gated).** Stabilize the core cadence engine and build test harness first; implement secure CSV upload with strict sanitization once the engine proves accurate. |
| **P1.4: Adversarial Benchmark Sequencing** | Sequence before heuristic changes (Step 1). | Modify to focus on held-out data; drop heavy property fuzzers. | Must be Step 1 / Non-negotiable Gate; include invariant assertions. | **Resolved: PROMOTE P1.4 to Step 1.** Create the decoupled adversarial dataset and baseline test harness *first* so changes to P0.1 and P0.2 can be measured scientifically. |
| **P0.2: Fuzzy Normalization Algorithm** | Restrict to noise token stripping + prefix matching. Avoid Levenshtein. | Require token normalization so UPI handles match canonical merchants. | Warned of false positive collisions (e.g. `SWIGGY` vs `SWIGGY INSTAMART`). | **Resolved: Deterministic 2-stage canonicalizer.** Strip standard banking noise regex (`UPI/`, `NEFT-`, `POS`, trailing digits) + exact prefix/trie matching against curated aliases with collision prevention. |

---

## 4. Item-by-Item Review Verdicts (P0 & P1)

| Recommendation | Original Priority | Panel Verdict | Key Modification / Reason |
|---|---|---|---|
| **P0.1: Temporal Cadence & Settlement-Drift Engine** | P0 | **KEEP** | Anchor intervals to calendar-day-of-month ($\pm 3$ days) and holiday-push heuristics rather than rigid integer day counts. |
| **P0.2: Fuzzy Merchant Normalization** | P0 | **MODIFY** | Replace broad fuzzy matching with a deterministic 2-stage canonicalizer (noise stripping + prefix matching) to prevent false positive merchant collisions. |
| **P0.3: API Security Hardening & Origin Isolation** | P0 | **KEEP** | Restrict CORS to explicit development origins (`http://localhost:5173`, `http://127.0.0.1:8000`) and cap query parameters. |
| **P1.4: Adversarial Holdout Benchmark & Property Tests** | P1 | **PROMOTE TO STEP 1** | Decouple synthetic generation into a training set and an independent held-out evaluation set *before* touching cadence algorithms. |
| **P1.5: In-Memory SQLite Caching Layer** | P1 | **REJECT / REPLACE** | Replace SQLite with a lightweight in-memory Python dictionary cache in FastAPI lifespan. |
| **P1.6: User CSV Statement Upload Pipeline** | P1 | **POSTPONE TO PHASE 3** | Gated until core detection achieves $\ge 90\%$ F1 on holdout data and upload sanitization (CSV injection protection, 5MB cap) is designed. |
| **P1.7: Dependency & Bundle Cleanup** | P1 | **PROMOTE TO IMMEDIATE** | Quick 15-minute cleanup: remove unused `recharts` and `tailwindcss` from `frontend/package.json`. |

---

## 5. Corrected Implementation Order & Phased Execution Plan

The panel unanimously recommends restructuring the immediate execution roadmap into four sequential phases:

```
+-----------------------------------------------------------------------------------+
|               Phase 0: Baseline Security & Evaluation Infrastructure              |
|  1. P0.3: Restrict CORS origins & enforce query bounds (src/api.py)               |
|  2. P1.7: Remove dead dependencies (recharts, tailwind) from frontend             |
|  3. P1.4: Generate decoupled adversarial holdout dataset & establish baseline     |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|               Phase 1: Algorithmic Remediation (Validated against Phase 0)         |
|  4. P0.1: Robust calendar-day-of-month cadence engine (detect_recurring_v3.py)   |
|  5. P0.2: Deterministic token noise stripper & canonical prefix normalizer        |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|               Phase 2: Performance & Architecture Stabilization                   |
|  6. P1.5 (Modified): FastAPI Lifespan in-memory state cache (replaces SQLite)     |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|               Phase 3: User Data Ingestion (Gated on Phase 1 & 2)                 |
|  7. P1.6: Secure User CSV Statement Upload & Parser (with injection defenses)     |
+-----------------------------------------------------------------------------------+
```

---

## 6. Top Three Features Recommended for Immediate Implementation

### 1. Adversarial Holdout Evaluation Benchmark (Promoted P1.4 · Effort: 1.5 days)
- **Why First**: The current 100% precision/recall metric is an unproven artifact of training data circularity. Establishing a decoupled 150+ row adversarial holdout dataset (with weekend settlement delays, GST adjustments, noise debits, and irregular UPI strings) creates an objective baseline to measure all subsequent algorithmic improvements.

### 2. Robust Calendar-Day-of-Month Cadence Engine (P0.1 · Effort: 1.5 days)
- **Why Second**: Directly resolves the primary algorithmic failure mode identified in the audit. Replaces brittle integer bounds `(28, 31)` with calendar day-of-month proximity ($\pm 3$ days) and weekend settlement holiday drift, measured directly against the new holdout benchmark.

### 3. Deterministic 2-Stage Merchant Normalizer (Modified P0.2 · Effort: 1.5 days)
- **Why Third**: Strips common Indian banking noise prefixes (`UPI/`, `POS`, `NEFT-`, trailing reference numbers) and matches against canonical merchant prefixes, feeding clean merchant clusters into the cadence engine without risk of false fuzzy collisions.

---

## 7. Remaining Uncertainties & Open Questions

1. **Bank Statement Variance**: Real Indian bank statement CSV exports (e.g. HDFC vs ICICI vs SBI) have differing column names, split debit/credit conventions, and embedded metadata headers. A single standard CSV format must be defined before implementing Phase 3.
2. **Aggregator Transparency Limitations**: When a transaction descriptor is simply `RAZORPAY*PAYMENT` or `BILLDESK*MANDATE` without an underlying merchant name, pure algorithmic normalization cannot determine the merchant without external bank mandate metadata or user clarification.

