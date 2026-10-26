
# FinSight — Product Data Contract

Version: 1.0
Status: Initial prototype

## 1. Purpose

Define the shared data structures used by the detection engine,
Python backend, React frontend, and automated tests.

All initial transaction data is synthetic.

## 2. Transaction

Each transaction represents one observed financial event.

| Field | Type | Meaning |
|---|---|---|
| transaction_id | string | Unique transaction identifier |
| date | date | Transaction date, YYYY-MM-DD |
| description | string | Original transaction descriptor |
| amount | number | Transaction amount |
| direction | string | debit or credit |
| payment_method | string | Observed payment method |
| reference_id | string or null | Transaction reference, not a mandate ID |

Rules:
- Preserve the original description.
- Do not treat refunds or credits as subscription payments.
- Never expose ground-truth labels to prediction logic.
- Transaction references must not be assumed to identify a commitment.

## 3. Merchant

A merchant represents a resolved business identity.

| Field | Type | Meaning |
|---|---|---|
| merchant_id | string | Internal merchant identifier |
| display_name | string | Human-readable merchant name |
| observed_descriptors | array of strings | Descriptors linked to the merchant |
| resolution_method | string | exact, alias_rule, or unresolved |
| resolution_confidence | number or null | Score, if supported by the resolver |

Rules:
- Preserve raw transaction descriptors for evidence.
- Do not merge separate payment commitments just because they share a merchant.
- Do not invent merchant identities when evidence is insufficient.

## 4. Recurring commitment

A commitment is a hypothesis that a group of transactions represents
one recurring payment obligation.

| Field | Type | Meaning |
|---|---|---|
| commitment_id | string | Internal identifier for the detected pattern |
| merchant_id | string or null | Resolved merchant, if known |
| cadence | string | monthly, quarterly, annual, irregular, unknown |
| status | string | candidate, needs_review, or supported_pattern |
| confidence_score | number or null | Heuristic score; not automatically a probability |
| transaction_ids | array of strings | Supporting transaction identifiers |
| first_observed_date | date | First supporting transaction |
| last_observed_date | date | Most recent supporting transaction |
| typical_amount | number or null | Median observed debit amount |
| currency | string | INR for the initial synthetic dataset |
| evidence | array of strings | Reasons supporting the inference |

Rules:
- A detected pattern is not proof of an active mandate.
- A merchant identity is not the same as a commitment identity.
- Multiple commitments may belong to one merchant.
- Confidence scores must be labelled accurately.

## 5. Spending estimates

Monthly and annual estimates are derived values, not observed facts.

- Monthly cadence: median amount multiplied by 12 for annual estimation.
- Quarterly cadence: median amount multiplied by 4.
- Annual cadence: median amount multiplied by 1.
- Irregular or unknown cadence: do not invent a standard annual estimate.
- Clearly disclose that estimates assume the observed cadence continues.

## 6. Alerts

An alert describes a pattern that deserves review.

| Field | Type | Meaning |
|---|---|---|
| alert_id | string | Unique alert identifier |
| commitment_id | string or null | Related commitment |
| alert_type | string | price_change, resumed_charge, trial_to_paid, or review |
| severity | string | informational, warning, or high |
| title | string | Short explanation |
| evidence | array of strings | Supporting transaction facts |
| recommended_action | string | Suggested next step |
| confirmed | boolean | Whether the claim has been independently verified |

Rules:
- An observed amount change is not automatically an unexplained price increase.
- A charge after a gap is not automatically proof that a cancelled subscription resumed.
- Never claim a payment was cancelled unless that action is independently verified.

## 7. API conventions

- JSON request and response bodies.
- Dates use YYYY-MM-DD.
- Amounts are numeric, with INR as the initial currency.
- Invalid input returns a clear error response.
- Prediction endpoints must not accept ground-truth labels as model inputs.

Initial planned endpoints:

- GET /api/health
- GET /api/summary
- GET /api/transactions
- GET /api/commitments
- GET /api/commitments/{commitment_id}
- GET /api/alerts

## 8. Evaluation and privacy

- Keep ground-truth labels separate from prediction inputs.
- Report precision, recall, F1, and false positives/negatives.
- Identify synthetic evaluation results as synthetic.
- Do not collect real banking credentials or claim live bank integration.
