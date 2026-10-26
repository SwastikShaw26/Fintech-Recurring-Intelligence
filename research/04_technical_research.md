# Technical Research: Recurring-Payment Detection

Research date: 2026-10-27

## 1. Research question

How can transaction history identify likely recurring commitments while
avoiding false positives from habitual spending, repeated one-off purchases,
and unrelated payments to the same merchant?

## 2. Relevant published research

Society for Causal Inference, 2026 abstract:
Identifying Recurring Payments in Financial Transaction Data
https://sci-info.org/abstract-search/?abst_id=20585

The abstract reports:
- A time-gap variance baseline achieved 94.14% recall and 28.39% precision
  on the authors' dataset.
- The authors engineered temporal and transactional features.
- They evaluated models including XGBoost and multilayer perceptrons.
- They report improved balance when synthetic examples of irregular
  habitual behaviour were combined with other training data.

Important limitation:
These figures belong to that study's dataset and methodology. They are not
our results, and should not be presented as an expected guarantee.

## 3. Baseline approach

For each candidate merchant or transaction group:
1. Sort eligible debit transactions by date.
2. Calculate consecutive time gaps.
3. Estimate likely cadence and amount variability.
4. Evaluate the number of observations and duration of history.
5. Compare the observed pattern with alternative explanations.
6. Produce a candidate score and an explanation.
7. Evaluate the decision against held-out ground-truth labels.

The baseline must include negative examples. Repeated coffee purchases,
shopping, and unrelated payments are important false-positive cases.

## 4. Candidate features

Temporal:
- Number of transactions
- Median inter-transaction gap
- Gap variability
- Agreement with monthly, quarterly or annual windows
- Missing expected periods
- Length of observed history

Amount:
- Median and spread of amounts
- Relative change from earlier charges
- Stability after a possible change

Merchant:
- Exact alias match
- Token or fuzzy similarity
- Conflicting alias mappings
- Known merchant category, if curated

Context:
- Payment method, when known
- Refund or reversal indicators
- Number of distinct transaction groups sharing a descriptor
- Evidence of a long gap and subsequent resumption

Do not use ground-truth labels or scenario names as input features.

## 5. Advanced methods to compare

A. Rule-based scoring:
Transparent, fast, easy to explain, and useful as a baseline.

B. Statistical temporal scoring:
Use robust gap statistics and cadence windows to handle date variation.

C. Supervised machine learning:
Consider logistic regression or gradient-boosted trees only after the
dataset and baseline are stable. Compare against the same held-out test set.

D. Graph-based merchant resolution:
Consider Neo4j only if a graph of descriptors, merchants, payment routes,
and commitments provides measurable value over a dictionary and simpler
matching methods.

## 6. Avoiding leakage

- Split by scenario or commitment, not random individual transactions only.
- Keep near-duplicate patterns out of both development and test splits.
- Do not tune thresholds on the held-out test set.
- Keep ground-truth labels separate from model input.
- Report the dataset generator and random seed.

## 7. Evaluation

Primary:
- Commitment-level precision, recall and F1.

Required slices:
- Annual renewals
- Irregular recurrence
- Variable amounts
- Trial-to-paid patterns
- Resumed charges
- Merchant alias changes
- Price changes
- Non-recurring lookalikes

Merchant resolution:
- Accuracy against labelled descriptors
- Accuracy by exact, fuzzy, ambiguous and unknown match categories

Additional:
- False-positive examples
- False-negative examples
- Confidence calibration, if confidence is interpreted probabilistically
- Runtime and reproducibility

## 8. Price-change logic

Compare charges only within a candidate commitment after checking that
they plausibly belong to the same merchant/service and billing pattern.

A higher amount is an observed change, not proof of a silent price rise.
Tax, usage, plan changes and partial periods may explain differences.
Use language such as "possible price increase" until independently verified.

## 9. Annual cost

Where the observed cadence and amount are stable, estimate annualised spend
using the inferred cadence and representative amount. For variable or
irregular charges, provide a range or historical total and disclose the
assumptions rather than presenting false precision.

## 10. Current decision

Implement a transparent baseline first. Add complexity only when the
held-out evaluation shows a real improvement.
