# Evaluation Plan

## Evaluation goals

Measure whether the system identifies real synthetic recurring commitments
while avoiding false positives from ordinary repeated spending.

## Core metrics

Precision = TP / (TP + FP)
Recall = TP / (TP + FN)
F1 = 2 * Precision * Recall / (Precision + Recall)

TP: correctly detected labelled recurring commitments.
FP: detected candidates that are not recurring commitments.
FN: labelled recurring commitments missed by the system.

Define the evaluation unit explicitly: commitment-level detection should be
the primary metric, with transaction-level analysis reported separately
where useful.

## Required slices

- All recurring commitments
- Annual renewals
- Irregular recurrence
- Variable amounts
- Trial-to-paid
- Resumed charges
- Merchant alias changes
- Price-change alerts
- One-off and habitual-spending negatives

## Baselines

1. Naive periodicity baseline
2. Transparent rule-based detector
3. Improved detector using additional temporal and amount features

Only add a machine-learning model if it can be compared fairly against the
same held-out test set and its additional complexity is justified.

## Reporting

Record dataset version, random seed, configuration, confusion matrix,
precision, recall, F1, and scenario-level errors for each run.

Do not present results from synthetic data as real-world performance.
Do not tune on the held-out test set.
