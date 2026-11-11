# Technical Research Report: Recurring Payment Intelligence & Regulatory Standards

**Agent**: Agent A — Technical Researcher  
**Skill**: `finsight-research`  
**Date**: November 11, 2026  
**Status**: Completed & Verified  

---

## 1. Executive Summary

This research report investigates algorithmic alternatives for recurring payment detection, entity resolution strategies for raw transaction descriptors, financial forecasting methods, and the Indian regulatory framework governing automated debits. 

Our investigation confirms that while FinSight's current rule-based heuristic provides an interpretable starting point for synthetic benchmarks, it suffers from severe generalization limitations that prevent reliable real-world deployment. Modern fintech systems employ hybrid time-series signal processing (FFT / Autocorrelation) coupled with density-based clustering (DBSCAN / HDBSCAN) and probabilistic entity resolution.

---

## 2. Research Dimensions & Detailed Findings

### Dimension 1: Recurring Payment Detection Algorithms
* **State of the Art in Fintech**:
  Production-grade personal financial management (PFM) platforms (such as Plaid, MX, and Yodlee) address recurring detection as a multi-stage time-series clustering problem rather than a hardcoded interval lookup.
  1. *Frequency Domain Analysis (FFT / Autocorrelation)*: Converts transaction histories into discrete time signals. Discrete Fourier Transforms isolate periodic frequencies (weekly $\approx 7\text{d}$, bi-weekly $\approx 14\text{d}$, monthly $\approx 30.4\text{d}$, quarterly $\approx 91.25\text{d}$, annual $\approx 365\text{d}$), accommodating calendar irregularities (e.g., February 28 days vs August 31 days).
  2. *Density-Based Clustering (DBSCAN / HDBSCAN)*: Maps transactions to a 2D feature space $(\Delta \text{Days}, \Delta \text{Amount})$. Unlike K-Means, DBSCAN does not assume the number of clusters a priori and natively isolates sporadic, one-off purchases as noise (label `-1`).
* **Comparison with FinSight v3**:
  FinSight v3 relies on static cadence buckets:
  - Monthly: 28–31 days
  - Quarterly: 85–95 days
  - Annual: 350–380 days
  *Limitation*: FinSight completely fails on weekly transactions (e.g., newspapers, milk, micro-subscriptions), bi-weekly subscriptions, or recurring payments that skip an irregular interval (e.g., bi-monthly utility bills).

### Dimension 2: Merchant Descriptor Normalization & Entity Resolution
* **Industry Approaches**:
  Bank statement descriptors are notoriously obfuscated (e.g., `POS 491024 *AMZN RET* MUMBAI IN`, `AMAZON PAY INDIA`, `AMZN MKTP US*1920`).
  1. *Tokenization & Regex Cleaning*: Stripping gateway noise, transaction IDs, location tokens, and POS terminals.
  2. *Probabilistic String Matching & Embeddings*: Utilizing Jaro-Winkler distance, TF-IDF n-gram cosine similarity, or transformer embeddings (e.g., FastText/MiniLM) mapped to a canonical merchant knowledge graph.
* **Comparison with FinSight v3**:
  FinSight relies on an exact-match dictionary lookup in `config/merchant_aliases.json` (currently containing exactly two entries for CloudNest: `"CLDNST DIGITAL": "CLOUDNEST"` and `"CLOUDNEST RENEWAL": "CLOUDNEST"`). Any unmapped descriptor variation (e.g., `NETFLIX.COM` vs `NETFLIX MUMBAI`) fails to cluster, generating false negatives.

### Dimension 3: Indian Regulatory Compliance (RBI & NPCI Standards)
* **Authoritative Directives**:
  1. *RBI Master Directions on Recurring E-Mandates (RBI/2020-21/74 and consolidated framework RBI/2024-25/64)*:
     - **Pre-Debit Notification**: Mandates that issuers send an SMS/email pre-debit alert to the subscriber at least **24 hours prior** to the actual debit. The notification must include an actionable link enabling the user to opt-out or cancel that specific cycle.
     - **AFA Threshold**: Mandates Additional Factor of Authentication (AFA/OTP) for mandate registration. Subsequent recurring transactions do not require AFA up to **₹15,000 per transaction** (relaxed to ₹1,00,000 for mutual fund SIPs, insurance, and credit card dues via RBI circular RBI/2023-24/90).
     - **Right to Revoke**: Banks and payment aggregators must provide a centralized online portal or mechanism allowing consumers to pause or withdraw recurring standing instructions at any time.
  2. *NPCI UPI AutoPay Guidelines (Operating Circular No. 223 / 2020)*:
     - Allows instant mandate execution up to ₹15,000 without entering a UPI PIN during scheduled cycles.
     - Mandates real-time revocation in any certified UPI third-party app (BHIM, Google Pay, PhonePe, Paytm).
* **FinSight Compliance Review**:
  FinSight correctly incorporates these circulars in its static reference database (`src/cancellation_guide.py`), accurately distinguishing UPI AutoPay, Card E-Mandates, and NACH procedures. However, FinSight provides guidance only; it has no direct integration with NPCI mandate hubs or bank APIs.

---

## 3. Algorithmic Trade-off Analysis

| Architecture | Computational Overhead | Generalization Capability | Noise Resistance | Cold-Start Requirement |
|---|---|---|---|---|
| **FinSight Heuristic v3 (Current)** | Ultra-low ($O(N)$ string lookup + sort) | Extremely Brittle (Fixed intervals, 0 weekly support) | Low (Easily fooled by regular one-off purchases) | Minimum 3 transactions |
| **FFT + DBSCAN Clustering (Recommended)** | Low to Moderate ($O(N \log N)$ FFT + DBSCAN) | High (Discovers arbitrary cadences, tolerant of jitter) | High (Native noise classification) | Minimum 4–5 transactions |
| **Hybrid LLM / Semantic Embedding Pipeline** | High (Inference latency & cost) | Very High (Handles extreme descriptor permutations) | High (Context-aware entity extraction) | Effective even on 1–2 transactions |

---

## 4. Recommendations & Unresolved Questions

1. **Adopt Time-Series Autocorrelation / DBSCAN**: Migrate the core recurrence detector from hardcoded calendar intervals to density clustering on normalized $(\Delta \text{Days}, \Delta \text{Amount})$ feature vectors.
2. **Implement Fuzzy Merchant Resolution**: Introduce RapidFuzz/Jaro-Winkler token matching prior to grouping to prevent descriptor fragment fragmentation.
3. **Unresolved Question**: How should the system handle variable-consumption recurring payments (e.g., AWS cloud bills or electric utility payments) where cadence is strictly monthly but amount varies by over 300%? (Currently classified as non-recurring by FinSight).

