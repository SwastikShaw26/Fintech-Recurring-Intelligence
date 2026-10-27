
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"


def load(path):
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


transactions = load(RAW / "synthetic_transactions.csv")
labels = load(RAW / "ground_truth_labels.csv")
predictions_rows = load(PROCESSED / "transaction_predictions.csv")

truth = {
    r["transaction_id"]: r
    for r in labels
}

predictions = {
    r["transaction_id"]: r["predicted_recurring"].strip().lower() in {"true", "1", "yes"}
    for r in predictions_rows
}

fp_count = 0
fn_count = 0

print("FALSE POSITIVES — predicted recurring, actually non-recurring")
for tx in transactions:
    if tx["direction"].lower() != "debit":
        continue
    tid = tx["transaction_id"]
    label = truth.get(tid, {})
    predicted = predictions.get(tid, False)
    actual = label.get("is_recurring", "").lower() == "true"

    if predicted and not actual:
        fp_count += 1
        print(
            f"{tx['date']} | {tx['description']} | "
            f"amount={tx['amount']} | scenario={label.get('scenario_type')}"
        )

if fp_count == 0:
    print("None (0 false positives)")

print("\nFALSE NEGATIVES — recurring, but not detected")
for tx in transactions:
    if tx["direction"].lower() != "debit":
        continue
    tid = tx["transaction_id"]
    label = truth.get(tid, {})
    predicted = predictions.get(tid, False)
    actual = label.get("is_recurring", "").lower() == "true"

    if actual and not predicted:
        fn_count += 1
        print(
            f"{tx['date']} | {tx['description']} | "
            f"amount={tx['amount']} | scenario={label.get('scenario_type')}"
        )

if fn_count == 0:
    print("None (0 false negatives)")

print(f"\nSummary: {fp_count} false positives, {fn_count} false negatives.")
