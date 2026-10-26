
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"


def load(path):
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


transactions = load(RAW / "synthetic_transactions.csv")
labels = load(RAW / "ground_truth_labels.csv")
candidates = load(PROCESSED / "recurring_candidates.csv")

truth = {
    r["transaction_id"]: r
    for r in labels
}

predicted_descriptions = {
    r["description"].strip().upper()
    for r in candidates
}

print("FALSE POSITIVES — predicted recurring, actually non-recurring")
for tx in transactions:
    label = truth[tx["transaction_id"]]
    predicted = (
        tx["direction"] == "debit"
        and tx["description"].strip().upper() in predicted_descriptions
    )
    actual = label["is_recurring"].lower() == "true"

    if predicted and not actual:
        print(
            f"{tx['date']} | {tx['description']} | "
            f"amount={tx['amount']} | scenario={label['scenario_type']}"
        )

print("\nFALSE NEGATIVES — recurring, but not detected")
for tx in transactions:
    label = truth[tx["transaction_id"]]
    predicted = (
        tx["direction"] == "debit"
        and tx["description"].strip().upper() in predicted_descriptions
    )
    actual = label["is_recurring"].lower() == "true"

    if actual and not predicted:
        print(
            f"{tx['date']} | {tx['description']} | "
            f"amount={tx['amount']} | scenario={label['scenario_type']}"
        )
