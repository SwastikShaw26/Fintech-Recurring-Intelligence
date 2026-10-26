
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
OUTPUT_FILE = PROCESSED_DIR / "recurring_candidates.csv"

# Supported standard payment intervals, in days.
CADENCES = {
    "monthly": (28, 31),
    "quarterly": (85, 95),
    "annual": (350, 380),
}


def read_transactions():
    with INPUT_FILE.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for row in rows:
        row["date"] = date.fromisoformat(row["date"])
        row["amount"] = float(row["amount"])

    # Refunds and other incoming credits are not recurring charges.
    return [row for row in rows if row["direction"] == "debit"]


def classify_intervals(intervals):
    """Return a standard cadence only when timing evidence supports it."""
    if not intervals:
        return None

    typical_interval = median(intervals)

    for cadence, (low, high) in CADENCES.items():
        if low <= typical_interval <= high:
            return cadence

    return None


def main():
    transactions = read_transactions()

    # Only transaction-visible fields are used for prediction.
    # Never use scenario_id or ground-truth labels here.
    groups = defaultdict(list)

    for row in transactions:
        key = row["description"].strip().upper()
        groups[key].append(row)

    results = []

    for description, rows in groups.items():
        rows.sort(key=lambda row: row["date"])

        # Require at least 3 transactions before considering a pattern.
        # Two transactions alone provide weak evidence of recurrence.
        if len(rows) < 3:
            continue

        intervals = [
            (rows[i]["date"] - rows[i - 1]["date"]).days
            for i in range(1, len(rows))
        ]

        cadence = classify_intervals(intervals)

        if cadence is not None:
            low, high = CADENCES[cadence]
            matching_gaps = [
                gap for gap in intervals if low <= gap <= high
            ]
            interval_consistency = len(matching_gaps) / len(intervals)

            # Require at least 2 intervals and a majority of intervals
            # to support the proposed standard cadence.
            if len(matching_gaps) < 2 or interval_consistency < 0.5:
                cadence = None

        if cadence is None:
            # Irregular recurrence candidate:
            # repeated charges with a consistent amount and evidence
            # of activity across a meaningful time span.
            span_days = (rows[-1]["date"] - rows[0]["date"]).days
            amounts = [row["amount"] for row in rows]
            typical_amount = median(amounts)

            amount_spread = (
                (max(amounts) - min(amounts)) / typical_amount
                if typical_amount else 0.0
            )

            # Require at least 3 charges spanning 60 days.
            # Consistent amounts support the candidate, but do not
            # establish that it is an actual subscription.
            if span_days < 60 or amount_spread > 0.10:
                continue

            detected_cadence = "irregular"
            interval_consistency = 0.0
            timing_evidence = (
                f"irregular gaps; observed span {span_days} days"
            )

            # Lower confidence because timing is not periodic.
            repetition_score = min(len(rows) / 5, 1.0)
            amount_score = max(0.0, 1.0 - amount_spread / 0.10)
            confidence_score = (
                0.5 * repetition_score + 0.5 * amount_score
            )

        else:
            amounts = [row["amount"] for row in rows]
            typical_amount = median(amounts)

            amount_spread = (
                (max(amounts) - min(amounts)) / typical_amount
                if typical_amount else 0.0
            )

            repetition_score = min(len(rows) / 5, 1.0)
            confidence_score = (
                0.7 * interval_consistency
                + 0.3 * repetition_score
            )

            timing_evidence = (
                f"median gap {median(intervals):.1f} days; "
                f"{interval_consistency:.0%} intervals match "
                f"{detected_cadence if 'detected_cadence' in locals() else cadence}"
                f" timing"
            )
            detected_cadence = cadence

        if amount_spread > 0.05:
            amount_pattern = "variable"
        else:
            amount_pattern = "mostly_stable"

        results.append({
            "description": description,
            "transaction_count": len(rows),
            "first_seen": rows[0]["date"].isoformat(),
            "last_seen": rows[-1]["date"].isoformat(),
            "detected_cadence": detected_cadence,
            "median_amount": round(typical_amount, 2),
            "amount_pattern": amount_pattern,
            "amount_spread_ratio": round(amount_spread, 3),
            "interval_consistency": round(interval_consistency, 3),
            "heuristic_confidence": round(confidence_score, 3),
            "evidence": (
                f"{len(rows)} debit transactions; {timing_evidence}; "
                f"amount spread {amount_spread:.1%}"
            ),
        })

    results.sort(
        key=lambda row: row["heuristic_confidence"],
        reverse=True
    )

    fieldnames = [
        "description", "transaction_count", "first_seen", "last_seen",
        "detected_cadence", "median_amount", "amount_pattern",
        "amount_spread_ratio", "interval_consistency",
        "heuristic_confidence", "evidence"
    ]

    with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    print(f"Processed debit transactions: {len(transactions)}")
    print(f"Candidate recurring patterns: {len(results)}")
    print(f"Saved results to: {OUTPUT_FILE}")

    for row in results:
        print(
            f"- {row['description']}: {row['detected_cadence']}, "
            f"{row['transaction_count']} transactions, "
            f"confidence score {row['heuristic_confidence']}"
        )


if __name__ == "__main__":
    main()
