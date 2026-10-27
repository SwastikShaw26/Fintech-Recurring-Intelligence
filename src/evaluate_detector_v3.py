
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

TRANSACTIONS_FILE = RAW_DIR / "synthetic_transactions.csv"
LABELS_FILE = RAW_DIR / "ground_truth_labels.csv"
PREDICTIONS_FILE = PROCESSED_DIR / "transaction_predictions.csv"
ERRORS_FILE = PROCESSED_DIR / "evaluation_v3_errors.csv"


def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def to_bool(value):
    return str(value).strip().lower() in {"true", "1", "yes"}


def main():
    transactions = read_csv(TRANSACTIONS_FILE)
    labels = read_csv(LABELS_FILE)
    predictions = read_csv(PREDICTIONS_FILE)

    labels_by_id = {row["transaction_id"]: row for row in labels}
    predictions_by_id = {
        row["transaction_id"]: row for row in predictions
    }

    y_true = []
    y_pred = []
    errors = []

    for transaction in transactions:
        if transaction["direction"].strip().lower() != "debit":
            continue

        transaction_id = transaction["transaction_id"]
        label = labels_by_id.get(transaction_id)
        prediction = predictions_by_id.get(transaction_id)

        if label is None:
            raise ValueError(f"Missing label for {transaction_id}")
        if prediction is None:
            raise ValueError(f"Missing prediction for {transaction_id}")

        actual = to_bool(label["is_recurring"])
        predicted = to_bool(prediction["predicted_recurring"])

        y_true.append(actual)
        y_pred.append(predicted)

        if actual != predicted:
            errors.append({
                "transaction_id": transaction_id,
                "date": transaction["date"],
                "description": transaction["description"],
                "amount": transaction["amount"],
                "actual": actual,
                "predicted": predicted,
                "scenario_type": label["scenario_type"],
            })

    tp = sum(a and p for a, p in zip(y_true, y_pred))
    fp = sum((not a) and p for a, p in zip(y_true, y_pred))
    fn = sum(a and (not p) for a, p in zip(y_true, y_pred))
    tn = sum((not a) and (not p) for a, p in zip(y_true, y_pred))

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall else 0.0
    )
    accuracy = (tp + tn) / len(y_true) if y_true else 0.0

    print(f"Debit transactions evaluated: {len(y_true)}")
    print(f"TP={tp}  FP={fp}  FN={fn}  TN={tn}")
    print(f"Precision: {precision:.3f}")
    print(f"Recall:    {recall:.3f}")
    print(f"F1:        {f1:.3f}")
    print(f"Accuracy:  {accuracy:.3f}")

    print("\nErrors:")
    if errors:
        for error in errors:
            print(
                f"- {error['transaction_id']} | {error['date']} | "
                f"{error['description']} | amount={error['amount']} | "
                f"actual={error['actual']} | "
                f"predicted={error['predicted']} | "
                f"scenario={error['scenario_type']}"
            )
    else:
        print("No errors.")

    with ERRORS_FILE.open("w", newline="", encoding="utf-8") as file:
        fieldnames = [
            "transaction_id", "date", "description", "amount",
            "actual", "predicted", "scenario_type",
        ]
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(errors)

    print(f"\nSaved error report: {ERRORS_FILE}")


if __name__ == "__main__":
    main()
