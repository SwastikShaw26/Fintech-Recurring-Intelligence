# Dataset Specification

## Purpose

Create a reproducible synthetic transaction dataset that measures both
successful detections and false alarms.

## Proposed transaction fields

- transaction_id: unique synthetic identifier
- date: ISO date, YYYY-MM-DD
- description: raw synthetic transaction descriptor
- amount: positive numeric amount
- direction: debit or credit
- payment_method: UPI, card, bank mandate, wallet, or unknown
- reference_id: synthetic reference, where applicable
- scenario_id: synthetic scenario grouping for test construction

## Ground-truth labels

Keep labels in a separate evaluation file, not in model input:
- transaction_id
- merchant_id
- commitment_id
- is_recurring
- cadence
- scenario_type
- expected_price_change
- expected_resumption
- payment_route
- notes

## Required positive scenarios

1. Fixed monthly payment
2. Quarterly payment
3. Annual renewal
4. Annual renewal with a shifted date
5. Variable-amount recurring payment
6. Irregular recurring payment
7. Trial-to-paid sequence
8. Payment resuming after a gap
9. Merchant descriptor changing over time
10. Silent price increase

## Required negative and ambiguous scenarios

1. One-off purchase
2. Similar purchases made out of habit
3. Several unrelated purchases from the same merchant
4. Similar descriptor belonging to different merchants
5. Refund or reversal near a debit
6. Insufficient transaction history
7. Variable utility-like payment without a fixed amount
8. Missing or ambiguous payment method
9. A large gap that should not automatically imply cancellation
10. Price variation caused by usage or quantity rather than a subscription increase

## Dataset split

Generate train/development and held-out test scenarios with distinct
scenario identifiers. Avoid placing near-duplicate copies of the same
scenario in both splits.

## Data integrity

- Fix and document random seeds.
- Use fictional merchants and synthetic identifiers.
- Validate dates, amounts and label consistency.
- Document scenario counts and class balance.
- Preserve the original raw description.
- Never use ground-truth labels as detection features.

## Metrics

Report overall precision, recall and F1, plus separate results for annual,
irregular, resumed and price-change scenarios. Report merchant-resolution
accuracy and a confusion matrix.
