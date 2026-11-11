# Security and Privacy Audit Report

**Agent**: Agent C — Security and Privacy Auditor  
**Skill**: `finsight-security-audit`  
**Date**: November 11, 2026  
**Status**: Non-Destructively Verified  

---

## 1. Executive Summary

This security and privacy evaluation examined the FinSight backend API, data ingress/egress points, network configuration, and third-party dependencies. While the application currently operates in an offline demonstration mode with synthetic financial records, multiple critical security and privacy architectural weaknesses exist that would pose severe risks if exposed to live user financial data or deployed to production.

---

## 2. Vulnerability Assessment & Evidence

### Vulnerability 1: Overly Permissive Wildcard CORS Configuration (CWE-942)
* **Severity**: **Medium** (CVSS 3.1: 6.5 / `AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N`)
* **Location**: `src/api.py`, Lines 33–39:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
* **Impact**:
  Allowing all origins (`"*"`) with `allow_credentials=True` allows arbitrary third-party websites visited by an authenticated user to perform cross-origin requests against FinSight endpoints, extracting private financial transactions, bank mandate histories, and subscription costs via the user's browser session.
* **Remediation**:
  Restrict allowed origins to trusted domains or host environment variables:
```python
import os
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
```

### Vulnerability 2: Missing Authentication and Authorization Controls (CWE-306)
* **Severity**: **High** (CVSS 3.1: 7.5 / `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
* **Location**: `src/api.py`, All Endpoints (`/api/transactions`, `/api/commitments`, `/api/summary`)
* **Impact**:
  Every endpoint is completely unauthenticated. In a shared or hosted environment, any unauthenticated network actor can query all financial transactions, recurring payment history, and cancellation guidance. There is no concept of multi-tenancy, user isolation, or Role-Based Access Control (RBAC).
* **Remediation**:
  Integrate an authentication layer (OAuth2 / JWT or session bearer tokens) binding all queries to a verified `user_id`.

### Vulnerability 3: Financial Privacy Leakage & PII Protection
* **Severity**: **Medium**
* **Location**: `src/api.py` and CSV data structures.
* **Impact**:
  Transaction reference IDs (`reference_id`), bank descriptors, and payment routes are exposed verbatim across API responses without masking or anonymization. While the present repository uses synthetic identifiers (`REF-00001`), production financial statements often embed account numbers, UPI VPAs, and payee phone numbers in descriptors (e.g., `UPI/4281901234/PAYEE@OKAXIS`).
* **Remediation**:
  Implement a PII-scrubbing sanitization filter before storing or exposing transaction descriptors, hashing bank reference numbers, and masking account/card suffixes.

### Vulnerability 4: Denial of Service Risk via Unbounded Memory Pagination (CWE-400)
* **Severity**: **Low to Medium**
* **Location**: `src/api.py`, Lines 386–415:
```python
@app.get("/api/transactions")
def transactions_endpoint(..., limit: int = Query(default=100, ge=1, le=1000), offset: int = Query(default=0, ge=0)):
    rows = load_transactions()
    ...
    return {"total": len(rows), "limit": limit, "offset": offset, "items": rows[offset:offset + limit]}
```
* **Impact**:
  Because pagination occurs in Python memory *after* reloading and sorting the entire dataset from disk, an attacker issuing repeated queries with varying filters will trigger repeated disk reads and garbage collection spikes, leading to thread pool exhaustion in Uvicorn.

---

## 3. Dependency & Supply Chain Security

* **Python Dependencies**:
  - `fastapi==0.162.0`, `uvicorn==0.54.0`, `pydantic==2.14.1`: Well-maintained, recent releases.
  - Absence of dangerous unsafe deserializers (`pickle`, `eval`, or unsanitized yaml loaders).
* **Node.js / npm Dependencies**:
  - React 19, Vite 8, Lucide-React, Recharts.
  - Zero critical CVE alerts reported during `npm run build` and `npm run lint`.

---

## 4. Security Verification Summary

| Check | Target | Status | Detail |
|---|---|---|---|
| **CORS Policy** | `src/api.py` | **FAIL** | Wildcard `*` origin enabled. |
| **Authentication** | Endpoints | **FAIL** | 0 endpoints enforce authentication. |
| **Input Validation** | API Parameters | **PASS** | Query parameters use regex patterns and length limits. |
| **SQL Injection** | Data Tier | **PASS** | No raw SQL utilized (flat CSV files). |
| **Path Traversal** | Static Files | **PASS** | Static assets served via FastAPI `StaticFiles` and fixed paths. |
| **PII Protection** | Transaction Descriptors | **WARN** | No sanitization of embedded bank identifiers. |

