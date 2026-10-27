
import csv
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

INPUT_FILE = RAW_DIR / "synthetic_transactions.csv"
CANDIDATES_FILE = PROCESSED_DIR / "recurring_candidates_v3.csv"
PREDICTIONS_FILE = PROCESSED_DIR / "transaction_predictions.csv"

CADENCES = {
    "monthly": (28, 31),
    "quarterly": (85, 95),
    "annual": (350, 380),
}


def read_transactions():
    with INPUT_FILE.open(newline="", encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))

    for row in rows:
        row["date"] = date.fromisoformat(row["date"])
        row["amount"] = float(row["amount"])

    return [row for row in rows if row["direction"] == "debit"]


def classify_intervals(intervals):
    if not intervals:
        return None

    typical_interval = median(intervals)

    for cadence, (low, high) in CADENCES.items():
        if low <= typical_interval <= high:
            return cadence

    return None


def main():
    transactions = read_transactions()
    groups = defaultdict(list)

    # Use transaction-visible descriptions only.
    # Never use scenario_id or ground-truth labels here.
    for row in transactions:
        key = row["description"].strip().upper()
        groups[key].append(row)

    candidates = []
    predictions = {}

    for description, rows in groups.items():
        rows.sort(key=lambda row: row["date"])
        intervals = [
            (rows[i]["date"] - rows[i - 1]["date"]).days
            for i in range(1, len(rows))
        ]

        cadence = None
        interval_consistency = 0.0
        confidence = 0.0
        evidence = "Insufficient repeated timing evidence"
        amount_pattern = "unknown"
        typical_amount = median([row["amount"] for row in rows])

        if len(rows) >= 3:
            cadence = classify_intervals(intervals)

            if cadence is not None:
                low, high = CADENCES[cadence]
                matching_indices = [
                    i for i, gap in enumerate(intervals)
                    if low <= gap <= high
                ]
                interval_consistency = len(matching_indices) / len(intervals)

                if len(matching_indices) < 2 or interval_consistency < 0.5:
                    cadence = None

            amounts = [row["amount"] for row in rows]
            amount_spread = (
                (max(amounts) - min(amounts)) / typical_amount
                if typical_amount else 0.0
            )
            amount_pattern = (
                "variable" if amount_spread > 0.05 else "mostly_stable"
            )

            if cadence is None:
                span_days = (rows[-1]["date"] - rows[0]["date"]).days

                if span_days >= 60 and amount_spread <= 0.10:
                    cadence = "irregular"
                    confidence = (
                        0.5 * min(len(rows) / 5, 1.0)
                        + 0.5 * max(0.0, 1.0 - amount_spread / 0.10)
                    )
                    evidence = (
                        f"{len(rows)} transactions over {span_days} days; "
                        f"amount spread {amount_spread:.1%}; "
                        "irregular timing"
                    )

            if cadence in CADENCES:
                confidence = (
                    0.7 * interval_consistency
                    + 0.3 * min(len(rows) / 5, 1.0)
                )
                evidence = (
                    f"{len(rows)} transactions; "
                    f"median gap {median(intervals):.1f} days; "
                    f"{interval_consistency:.0%} intervals fit {cadence}; "
                    f"amount spread {amount_spread:.1%}"
                )

        candidate_id = f"CAND-{len(candidates) + 1:03d}" if cadence else ""

        # Initially classify all members of a detected description group
        # as candidates. The transaction-level evidence makes this limitation
        # visible; later evaluation will examine outlier transactions.
        for row in rows:
            predictions[row["transaction_id"]] = {
                "transaction_id": row["transaction_id"],
                "date": row["date"].isoformat(),
                "description": row["description"],
                "amount": row["amount"],
                "payment_method": row["payment_method"],
                "predicted_recurring": bool(cadence),
                "candidate_id": candidate_id,
                "detected_cadence": cadence or "none",
                "heuristic_confidence": round(confidence, 3),
                "evidence": evidence,
            }

        if cadence:
            candidates.append({
                "candidate_id": candidate_id,
                "description": description,
                "transaction_count": len(rows),
                "first_seen": rows[0]["date"].isoformat(),
                "last_seen": rows[-1]["date"].isoformat(),
                "detected_cadence": cadence,
                "median_amount": round(typical_amount, 2),
                "amount_pattern": amount_pattern,
                "interval_consistency": round(interval_consistency, 3),
                "heuristic_confidence": round(confidence, 3),
                "evidence": evidence,
            })

    candidate_fields = [
        "candidate_id", "description", "transaction_count",
        "first_seen", "last_seen", "detected_cadence", "median_amount",
        "amount_pattern", "interval_consistency", "heuristic_confidence",
        "evidence",
    ]
    with CANDIDATES_FILE.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=candidate_fields)
        writer.writeheader()
        writer.writerows(candidates)

    prediction_fields = [
        "transaction_id", "date", "description", "amount",
        "payment_method", "predicted_recurring", "candidate_id",
        "detected_cadence", "heuristic_confidence", "evidence",
    ]
    with PREDICTIONS_FILE.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=prediction_fields)
        writer.writeheader()
        writer.writerows(predictions[row["transaction_id"]] for row in transactions)

    print(f"Debit transactions: {len(transactions)}")
    print(f"Recurring candidate groups: {len(candidates)}")
    print(f"Transaction predictions: {len(predictions)}")
    print(f"Saved candidates: {CANDIDATES_FILE}")
    print(f"Saved predictions: {PREDICTIONS_FILE}")


if __name__ == "__main__":
    main()
