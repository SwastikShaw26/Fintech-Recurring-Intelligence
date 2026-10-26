
import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

TRANSACTIONS_FILE = RAW_DIR / "synthetic_transactions.csv"
LABELS_FILE = RAW_DIR / "ground_truth_labels.csv"
CANDIDATES_FILE = PROCESSED_DIR / "recurring_candidates.csv"
ERRORS_FILE = PROCESSED_DIR / "evaluation_errors.csv"


def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def normalise_description(value):
    return value.strip().upper()


transactions = read_csv(TRANSACTIONS_FILE)
labels = read_csv(LABELS_FILE)
candidates = read_csv(CANDIDATES_FILE)

# Predictions must come from the detector's output.
# Ground-truth labels are used only for evaluation.
debits = {
    row["transaction_id"]: row
    for row in transactions
    if row["direction"].strip().lower() == "debit"
}

labels_by_id = {
    row["transaction_id"].strip(): row
    for row in labels
}

# Candidate descriptions are the only prediction signal in v2.
predicted_descriptions = {
    normalise_description(row["description"])
    for row in candidates
}

# Evaluate each transaction against its own ground-truth label.
evaluation_rows = []

for transaction_id, transaction in debits.items():
    label = labels_by_id.get(transaction_id)

    if label is None:
        raise ValueError(f"Missing ground-truth label: {transaction_id}")

    actual = label["is_recurring"].strip().lower() == "true"
    predicted = (
        normalise_description(transaction["description"])
        in predicted_descriptions
    )

    evaluation_rows.append({
        "transaction_id": transaction_id,
        "description": transaction["description"],
        "scenario_type": label.get("scenario_type", ""),
        "actual_recurring": actual,
        "predicted_recurring": predicted,
        "result": (
            "TP" if actual and predicted else
            "FP" if not actual and predicted else
            "FN" if actual and not predicted else
            "TN"
        ),
    })


tp = sum(row["result"] == "TP" for row in evaluation_rows)
fp = sum(row["result"] == "FP" for row in evaluation_rows)
fn = sum(row["result"] == "FN" for row in evaluation_rows)
tn = sum(row["result"] == "TN" for row in evaluation_rows)

total = len(evaluation_rows)
precision = tp / (tp + fp) if tp + fp else 0.0
recall = tp / (tp + fn) if tp + fn else 0.0
f1 = (
    2 * precision * recall / (precision + recall)
    if precision + recall else 0.0
)
accuracy = (tp + tn) / total if total else 0.0

# Save row-level errors so we can inspect precisely which
# transactions were missed or incorrectly flagged.
with ERRORS_FILE.open("w", newline="", encoding="utf-8") as f:
    fields = [
        "transaction_id", "description", "scenario_type",
        "actual_recurring", "predicted_recurring", "result"
    ]
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(
        row for row in evaluation_rows
        if row["result"] in ("FP", "FN")
    )

print("BASELINE V2 EVALUATION")
print(f"Debit transactions evaluated: {total}")
print(f"True positives:  {tp}")
print(f"False positives: {fp}")
print(f"False negatives: {fn}")
print(f"True negatives:  {tn}")
print(f"Precision: {precision:.3f}")
print(f"Recall:    {recall:.3f}")
print(f"F1-score:  {f1:.3f}")
print(f"Accuracy:  {accuracy:.3f}")

print("\nERRORS BY SCENARIO")
scenario_counts = defaultdict(lambda: {"FP": 0, "FN": 0})

for row in evaluation_rows:
    if row["result"] in ("FP", "FN"):
        scenario_counts[row["scenario_type"]][row["result"]] += 1

for scenario, counts in sorted(scenario_counts.items()):
    print(
        f"- {scenario}: "
        f"{counts['FP']} false positives, "
        f"{counts['FN']} false negatives"
    )

print(f"\nDetailed errors saved to: {ERRORS_FILE}")
print("\nLIMITATIONS:")
print("- Small synthetic dataset; not a held-out test set.")
print("- Predictions are description-level, not commitment-level.")
print("- One-off transactions can inherit a recurring description's prediction.")
print("- Descriptor changes can split one commitment into separate groups.")
