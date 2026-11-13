# 06. API and data reference

An API is a defined way to ask the server for data or ask it to perform an operation. A route combines an HTTP method and a path. For example, `GET /api/summary` retrieves a summary. `POST /api/private-statement` sends a statement request for analysis. The browser uses JSON for the request body and response. The underlying transaction file is CSV text.

This reference describes the FastAPI implementation in [src/api.py](../../src/api.py). The optional Node demo adapter is a separate contract. When running FastAPI, `/docs` provides an interactive route list. Some routes accept generic request bodies, so this handbook explains fields that the generated schema may omit.

## First API call

Start the app and leave its server terminal open. Run these commands from another PowerShell terminal. If you selected another port, change `8000` below.

~~~powershell
$base = 'http://127.0.0.1:8000'
Invoke-RestMethod "$base/api/health"
Invoke-RestMethod "$base/api/summary"
(Invoke-RestMethod "$base/api/transactions?direction=debit&limit=2").items |
    Format-Table transaction_id, date, description, amount
~~~

The first call answers whether the process responds. The second returns counts and estimate coverage. The third returns a short synthetic ledger page. `Format-Table` changes how the terminal displays the result. It does not modify the data.

To inspect the evidence behind a commitment, read its ID from the list:

~~~powershell
$commitments = Invoke-RestMethod "$base/api/commitments?limit=2"
$id = $commitments.items[0].commitment_id
$detail = Invoke-RestMethod "$base/api/commitments/$id"
$detail.evidence
$detail.transactions | Format-Table transaction_id, date, amount
~~~

## Synthetic reads

The public data reads below return bundled synthetic data even if the current tab has an imported statement open. Private analysis is delivered in the result of a separate action and held by the browser.

| Method and route | Inputs | Response and use |
| --- | --- | --- |
| `GET /api/health` | None | Process liveness and detector version hint. |
| `GET /api/ready` | None | Readiness status for the generated assets. Hosted mode also probes the database. |
| `GET /api/summary` | None | Counts, annualized total and estimate coverage. |
| `GET /api/transactions` | `search`, `direction`, `review_required`, `limit`, `offset` | `total`, `limit`, `offset` and `items`. Search matches description or ID. Direction is debit or credit. Limit defaults to 100 and permits 1–1,000. Offset is zero-based. |
| `GET /api/commitments` | `cadence`, `search`, `review_required`, `limit` | `total` and `items`. Search matches display name. Limit defaults to 100 and permits 1–500. |
| `GET /api/commitments/{commitment_id}` | An ID from the same server's commitment list. | A commitment with linked `transactions`. An unknown ID returns 404. |
| `GET /api/cancellation-guide/{payment_method}` | Payment-method text in the path and optional `merchant` query. | Mechanism-specific guidance. Encode spaces when constructing the path. |
| `GET /api/alerts` | None | `total` and `items` for the synthetic review feed. |
| `GET /api/evaluation` | None | Original synthetic regression evidence. The browser benchmark uses a separate artifact. |

## Transaction and commitment vocabulary

| Field | Read it as |
| --- | --- |
| `transaction_id` | The identifier of a row in the current analysis. Private statement IDs are assigned during normalization and overlap handling. |
| `date` | Observed date, serialized as `YYYY-MM-DD`. |
| `description` | The observed descriptor retained after field mapping and trimming. |
| `amount` and `direction` | The magnitude and separate direction. A normalized debit amount of 80 is an outflow of 80 source units. |
| `payment_method` | A recorded or inferred payment route. Check the provider when acting on guidance. |
| `commitment_id` | An identifier for an inferred payment stream. It is useful for linking views within an analysis. |
| `cadence` | An inferred interval category, such as monthly or quarterly. |
| `typical_amount` | Median of the supporting observed amounts. It can lag a sustained price step. |
| `estimated_annual_cost` | A heuristic annualized amount for a regular cadence. It can be unavailable. |
| `transaction_ids` | Supporting rows for this commitment. Use this field when scoping evidence. |
| `billing_anchor_day` and `billing_anchor_date` | The optional fitted billing day and recent fitted slot used for calendar-aware estimates. |
| `confidence_score` | Detector heuristic strength. It is not a calibrated probability. |
| `analysis_id` | UUID that scopes private reanalysis. It is neither a bearer credential nor a snapshot ID. |

Use the record's currency when formatting monetary amounts. Supported private currencies are INR, GBP, USD, EUR and `unspecified`. FinSight performs no currency conversion. Treat an unavailable amount differently from a measured zero. Dates on an inferred calendar are estimates. Observed billing changes and user reports do not establish issuer status.

## Local statement request tutorial

This example uses a toy CSV and the same origin as the app. The local route checks the origin, including when a command-line tool sends the request. Use the exact scheme, host and port from your running FastAPI instance.

~~~powershell
$base = 'http://127.0.0.1:8000'
$headers = @{ Origin = $base }
$csv = @'
date,description,amount
2025-01-05,Example Studio,-80
2025-02-05,Example Studio,-80
2025-03-05,Example Studio,-80
2025-04-05,Example Studio,-80
'@
$request = @{
    csv = $csv
    mapping = @{
        date = 0
        description = 1
        amount = 2
        date_format = 'iso'
        amount_sign = 'negative_debit'
    }
    currency = 'INR'
}
$analysis = Invoke-RestMethod "$base/api/private-statement" -Method Post -Headers $headers -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 6)
$analysis.summary
$analysis.commitments | Format-Table display_name, cadence, typical_amount
~~~

PowerShell's `@{ }` form builds a record. `ConvertTo-Json` turns it into the text sent across HTTP. The four rows are synthetic examples. Replace the date and amount mappings only after checking the header order.

### Input modes and bounds

- A direct API request with `csv` and no `mapping` returns `columns`, `row_count` and a five-row sample. The normal browser preview parses the file locally and does not need this API preview.
- Map `date` and `description`. Either map one `amount` with optional `direction`, or map both `debit_amount` and `credit_amount`. `payment_method` is optional.
- Column indices start at zero and must be distinct. Dates support `iso`, `dmy` and `mdy`. The amount sign convention supports `negative_debit` or `positive_debit`. An explicit valid direction takes precedence over sign interpretation.
- Each split amount row must have a positive value in exactly one side. Future dates, invalid amounts and malformed field counts are rejected.
- Server limits include 10,000 rows, 64 columns and a 2,500,000-byte JSON request. The file picker applies a separate 2 MB browser limit. A merged request includes both normalized exports and can reach the body limit even when each file is smaller.
- Successful analysis returns `summary`, `transactions`, `commitments`, `alerts`, `analysis_id`, merchant review fields, and overlap counts.

### Overlap and merchant review

Use overlap only for complete-day exports from the same account in the same units. `overlap_csv` contains the earlier normalized five fields in this order: date, description, amount, direction and payment method. Add `overlap_confirmed: true`. To review, send `overlap_preview: true` and read the `overlap_review` object. Exact repeats are counted by occurrence, so genuine duplicate-looking rows are preserved when they exceed the matched occurrences. The review also exposes a bounded list of possible same-day conflicts. Submit the selected conflict transaction IDs as `overlap_excluded` in the apply request and omit `overlap_preview`. The server recomputes the plan.

To rerun with a corrected merchant grouping, reuse the same `analysis_id` and send `aliases` as a list of two-item descriptor lists. The first item is the variant, the second is the canonical descriptor. Both must exist in the mapped debit data. The API also accepts `merchant_dismissals`. It returns `merchant_links`, `merchant_dismissals` and `merchant_suggestions`. The browser offers a simpler way to do this safely.

## Local saved copies

`POST /api/local-statement` requires the local FastAPI app's same-origin address and a valid `FINSIGHT_LOCAL_DB` path. It checks the connecting peer is loopback as well.

| `action` | Additional keys | Result |
| --- | --- | --- |
| `list` | None | Saved account nicknames. |
| `overview` | `accounts` | Separate account analyses and known-currency totals. The server supports one to eight selected accounts, and the browser comparison starts at two. |
| `save` | Optional `account`, required `statement` | Saves mapped data and merchant decisions, then returns analysis with `local_account`. |
| `load` | Optional `account` | Reanalyzes the saved copy. |
| `delete` | Optional `account` | Deletes the saved copy and returns the updated account list. |

Omitting the account selects the default workspace. Saving an incompatible analysis under an occupied nickname returns 409. Export and clear are browser actions. Deleting a local saved copy leaves the original file and current tab under the user's control.

## Hosted request sequence

The hosted API requires the exact configured HTTPS origin. Use the existing hosted setup and test only with a synthetic operator credential in a disposable environment. Put a token in the Authorization header. Do not paste credentials into URLs, issue bodies, screenshots or persisted shell history.

1. `POST /api/hosted-session` with the operator credential as `Authorization: Bearer ...`. No JSON body is needed. Success returns `token` and `expires_at`.
2. Use the returned session token in the Authorization header on `POST /api/hosted-statement`. Each accepted call resolves the active token digest to an owner. Operator credentials are for exchange, and statement actions require an issued session.
3. `DELETE /api/hosted-session` with the session token returns 204 and revokes it. Previously admitted work may finish. The session expires after one hour even if the client reloads.

The table lists the hosted statement payloads. The browser normally sends these after user action.

| `action` | Additional keys | Result |
| --- | --- | --- |
| `analyze` | `statement` | Transient analysis using the mapped statement request. |
| `list` | Optional `cursor`, optional `include_history: true` | Active statement IDs, optional encrypted-history metadata after decryption, and optional `next_cursor`. |
| `save` | `statement`, `save_confirmed: true`, optional `retention_days`, `name`, `start_date`, `end_date` | New statement ID and expiry. Retention defaults to 30 days and accepts 1–90. A declared period must contain all observed transactions. |
| `save` as version | Save keys plus `predecessor_id` | New snapshot in the selected lineage. The selected predecessor must be the latest active version. |
| `save` as replacement | Version keys plus `replace: true` and `replace_confirmed: true` | Atomically inserts the new snapshot and deletes the predecessor. |
| `compare` | `statement_ids` | Two to four distinct active copies of the same owner. Returns intersection dates, coverage source indication, and per-copy observed debit, credit and net-outflow totals by currency. |
| `load` | `statement_id` | Owner-scoped analysis of an active saved copy. |
| `delete` | `statement_id` | Owner-scoped removal of the saved copy. |

The history listing is ordered by expiry then ID and returns up to 20 copies. Use `next_cursor` verbatim to advance. An active owner can keep up to 50 snapshots and ten sessions. A later version can reuse the version number of a deleted latest copy. Snapshot IDs remain distinct. Comparisons report amounts as decimal strings and do not pool same-currency versions into a single figure.

## Read an HTTP error

| Status | Meaning here | What to check |
| --- | --- | --- |
| 200 | Request succeeded. | Check the returned object shape before using it. |
| 204 | Successful action without a response body. | Do not try to parse JSON after session revocation. |
| 401 | Missing, invalid, expired or revoked hosted bearer. | Exchange the operator credential again when appropriate. |
| 403 | Request failed origin, HTTPS or local-boundary checks. | Confirm address, scheme, origin and run mode. |
| 404 | Resource is unavailable, missing or outside the active owner, or the route is disabled by mode. | Confirm the mode and use an ID from the current owner list. |
| 408 | Hosted body reception took too long. | Check network and payload size. |
| 409 | Save conflict or quota. | Check the latest version or free a snapshot slot. |
| 413 | Body exceeds the request limit. | Use a smaller mapped dataset or smaller overlapping ranges. |
| 415 | JSON body expected. | Set `Content-Type: application/json`. |
| 422 | Invalid mapping, input, cursor or action. | Read the response's `detail` and correct the request. |
| 429 | Admission limit reached. | Respect `Retry-After`. Limits apply per worker. |
| 503 | Dependency or readiness failure. | Check generated files or hosted database readiness. |

## Maintainer checklist for changing a data shape

1. Find all producers and consumers. Search in Python, TypeScript, the optional Node adapter and tests.
2. Describe which fields are required, nullable or derived.
3. Preserve existing stored snapshots and clarify whether old clients can read the change.
4. Add a focused synthetic test at the closest useful boundary.
5. If persistence changes, use a new Alembic revision and test upgrade on a disposable database.
6. Verify that private data still stays out of logs and public demo endpoints.
7. Refresh this chapter and the [data contract](../data_contract.md) alongside the implementation.

Return to the [code tour](05-architecture-and-code.md) to locate the relevant files.
