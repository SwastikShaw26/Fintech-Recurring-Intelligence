
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "raw"

transactions_file = DATA_DIR / "synthetic_transactions.csv"
labels_file = DATA_DIR / "ground_truth_labels.csv"

required_transaction_columns = {
    "transaction_id", "date", "description", "amount",
    "direction", "payment_method", "reference_id", "scenario_id"
}

required_label_columns = {
    "transaction_id", "merchant_id", "commitment_id",
    "is_recurring", "cadence", "scenario_type",
    "expected_price_change", "expected_resumption", "payment_route"
}

with transactions_file.open(newline="", encoding="utf-8") as f:
    transactions_reader = csv.DictReader(f)
    transaction_columns = set(transactions_reader.fieldnames or [])
    transactions = list(transactions_reader)

with labels_file.open(newline="", encoding="utf-8") as f:
    labels_reader = csv.DictReader(f)
    label_columns = set(labels_reader.fieldnames or [])
    labels = list(labels_reader)

errors = []

if not required_transaction_columns.issubset(transaction_columns):
    errors.append(f"Missing transaction columns: {required_transaction_columns - transaction_columns}")

if not required_label_columns.issubset(label_columns):
    errors.append(f"Missing label columns: {required_label_columns - label_columns}")

transaction_ids = [row["transaction_id"] for row in transactions]
label_ids = [row["transaction_id"] for row in labels]

if len(transaction_ids) != len(set(transaction_ids)):
    errors.append("Duplicate transaction IDs found in transactions.")

if len(label_ids) != len(set(label_ids)):
    errors.append("Duplicate transaction IDs found in labels.")

if set(transaction_ids) != set(label_ids):
    errors.append("Transaction IDs do not match between transactions and labels.")

for row in transactions:
    try:
        float(row["amount"])
    except (ValueError, TypeError):
        errors.append(f"Invalid amount for transaction {row.get('transaction_id')}")

    if row["direction"] not in {"debit", "credit"}:
        errors.append(f"Invalid direction for transaction {row.get('transaction_id')}")

    try:
        from datetime import date
        date.fromisoformat(row["date"])
    except ValueError:
        errors.append(f"Invalid date for transaction {row.get('transaction_id')}")

for row in labels:
    if row["is_recurring"] not in {"true", "false"}:
        errors.append(f"Invalid is_recurring label for {row['transaction_id']}")

if errors:
    print(f"VALIDATION FAILED: {len(errors)} issue(s)")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("VALIDATION PASSED")
print(f"Transactions: {len(transactions)}")
print(f"Labels: {len(labels)}")
print(f"Unique transaction IDs: {len(set(transaction_ids))}")
print(f"Recurring transactions: {sum(r['is_recurring'] == 'true' for r in labels)}")
print(f"Non-recurring transactions: {sum(r['is_recurring'] == 'false' for r in labels)}")
print(f"Scenario types: {len(set(r['scenario_type'] for r in labels))}")
