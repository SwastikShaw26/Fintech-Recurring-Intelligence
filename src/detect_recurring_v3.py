
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
CONFIG_DIR = ROOT / "config"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

INPUT_FILE = RAW_DIR / "synthetic_transactions.csv"
CANDIDATES_FILE = PROCESSED_DIR / "recurring_candidates_v3.csv"
PREDICTIONS_FILE = PROCESSED_DIR / "transaction_predictions.csv"
ALIASES_FILE = CONFIG_DIR / "merchant_aliases.json"

CADENCES = {
    "monthly": (28, 31),
    "quarterly": (85, 95),
    "annual": (350, 380),
}

# Amount differences above this threshold trigger a review flag.
AMOUNT_OUTLIER_THRESHOLD = 0.10


def load_aliases() -> dict:
    if ALIASES_FILE.exists():
        try:
            with ALIASES_FILE.open("r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("aliases", {})
        except Exception:
            pass
    return {}


def read_transactions():
    with INPUT_FILE.open(newline="", encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))

    for row in rows:
        row["date"] = date.fromisoformat(row["date"])
        row["amount"] = float(row["amount"])

    # The detector only processes debit transactions.
    return [
        row for row in rows
        if row["direction"].strip().lower() == "debit"
    ]


def classify_intervals(intervals):
    if not intervals:
        return None

    typical_interval = median(intervals)

    for cadence, (low, high) in CADENCES.items():
        if low <= typical_interval <= high:
            return cadence

    return None


def split_streams(rows: list[dict]) -> list[list[dict]]:
    """
    Separate independent price tiers under the same merchant (e.g. 599 vs 899 quarterly)
    while preserving trial-to-paid sequences (e.g. 1 INR trial + 499 monthly)
    and price changes (199 -> 249).
    """
    if len(rows) <= 3:
        return [rows]

    amounts = [r["amount"] for r in rows]
    distinct_amounts = sorted(list(set(amounts)))

    # A nominal charge (<= 10 INR) is a trial verification charge preceding subscriptions.
    if distinct_amounts[0] <= 10.0:
        return [rows]

    # If there are two widely separated amount tiers (>30% difference) that each have
    # multiple observations, they represent separate subscriptions under the same merchant.
    if len(distinct_amounts) == 2 and distinct_amounts[1] / distinct_amounts[0] > 1.3:
        c1 = [r for r in rows if abs(r["amount"] - distinct_amounts[0]) < 10]
        c2 = [r for r in rows if abs(r["amount"] - distinct_amounts[1]) < 10]
        if len(c1) >= 3 or len(c2) >= 3:
            return [c for c in [c1, c2] if c]

    return [rows]


def main():
    transactions = read_transactions()
    aliases = load_aliases()
    groups = defaultdict(list)

    # Group by resolved merchant or normalized description.
    for row in transactions:
        desc = row["description"].strip().upper()
        merchant_key = aliases.get(desc, desc)
        groups[merchant_key].append(row)

    candidates = []
    predictions = {}

    for merchant_key, m_rows in groups.items():
        # Separate parallel streams/price tiers if present.
        streams = split_streams(m_rows)

        for rows in streams:
            rows.sort(key=lambda row: row["date"])

            intervals = [
                (rows[i]["date"] - rows[i - 1]["date"]).days
                for i in range(1, len(rows))
            ]

            amounts = [row["amount"] for row in rows]
            typical_amount = median(amounts)

            cadence = None
            interval_consistency = 0.0
            confidence = 0.0
            evidence = "Insufficient repeated timing evidence"
            amount_pattern = "unknown"
            amount_spread = (
                (max(amounts) - min(amounts)) / typical_amount
                if typical_amount else 0.0
            )

            # Check if this group exhibits recurring cadence
            if len(rows) >= 3:
                cadence = classify_intervals(intervals)

                if cadence is not None:
                    low, high = CADENCES[cadence]
                    matching_gaps = [
                        gap for gap in intervals
                        if low <= gap <= high
                    ]
                    interval_consistency = (
                        len(matching_gaps) / len(intervals)
                    )

                    if (
                        len(matching_gaps) < 2
                        or interval_consistency < 0.5
                    ):
                        cadence = None

                amount_pattern = (
                    "variable" if amount_spread > 0.05
                    else "mostly_stable"
                )

                if cadence is None:
                    span_days = (
                        rows[-1]["date"] - rows[0]["date"]
                    ).days

                    if span_days >= 60 and amount_spread <= 0.10:
                        cadence = "irregular"
                        confidence = (
                            0.5 * min(len(rows) / 5, 1.0)
                            + 0.5 * max(
                                0.0, 1.0 - amount_spread / 0.10
                            )
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

            candidate_id = (
                f"CAND-{len(candidates) + 1:03d}"
                if cadence else ""
            )

            # Determine dominant descriptor for display
            descriptor_counts = defaultdict(int)
            for r in rows:
                descriptor_counts[r["description"]] += 1
            primary_description = max(descriptor_counts, key=descriptor_counts.get)

            # Predict and flag each transaction individually.
            for row in rows:
                amount_deviation = (
                    abs(row["amount"] - typical_amount) / typical_amount
                    if typical_amount else 0.0
                )

                amount_outlier = (
                    amount_deviation > AMOUNT_OUTLIER_THRESHOLD
                )

                # An individual transaction within an established group is non-recurring
                # if it has a severe amount deviation (>30%) and is NOT a nominal trial (<=10)
                # and doesn't fit the timing cadence.
                is_recurring_txn = bool(cadence)
                if cadence in CADENCES and len(rows) >= 4 and row["amount"] > 10.0:
                    if amount_deviation > 0.30:
                        is_recurring_txn = False

                review_required = bool(
                    (is_recurring_txn and amount_outlier)
                    or (not is_recurring_txn and cadence)
                )

                transaction_evidence = evidence
                if amount_outlier and is_recurring_txn:
                    transaction_evidence += (
                        f"; amount differs from group median by "
                        f"{amount_deviation:.1%}; review recommended"
                    )
                elif not is_recurring_txn and cadence:
                    transaction_evidence = (
                        f"Isolated transaction ({row['amount']:.2f}) differs "
                        f"significantly from {primary_description} cadence"
                    )

                predictions[row["transaction_id"]] = {
                    "transaction_id": row["transaction_id"],
                    "date": row["date"].isoformat(),
                    "description": row["description"],
                    "amount": row["amount"],
                    "payment_method": row["payment_method"],
                    "predicted_recurring": is_recurring_txn,
                    "candidate_id": candidate_id if is_recurring_txn else "",
                    "detected_cadence": cadence if is_recurring_txn else "none",
                    "heuristic_confidence": round(confidence, 3) if is_recurring_txn else 0.0,
                    "amount_deviation_ratio": round(amount_deviation, 3),
                    "review_required": review_required,
                    "evidence": transaction_evidence,
                }

            if cadence:
                recurring_rows = [r for r in rows if predictions[r["transaction_id"]]["predicted_recurring"]]
                if not recurring_rows:
                    continue

                candidates.append({
                    "candidate_id": candidate_id,
                    "description": primary_description,
                    "transaction_count": len(recurring_rows),
                    "first_seen": recurring_rows[0]["date"].isoformat(),
                    "last_seen": recurring_rows[-1]["date"].isoformat(),
                    "detected_cadence": cadence,
                    "median_amount": round(typical_amount, 2),
                    "amount_pattern": amount_pattern,
                    "interval_consistency": round(
                        interval_consistency, 3
                    ),
                    "heuristic_confidence": round(confidence, 3),
                    "evidence": evidence,
                })

    candidate_fields = [
        "candidate_id", "description", "transaction_count",
        "first_seen", "last_seen", "detected_cadence",
        "median_amount", "amount_pattern", "interval_consistency",
        "heuristic_confidence", "evidence",
    ]

    with CANDIDATES_FILE.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=candidate_fields)
        writer.writeheader()
        writer.writerows(candidates)

    prediction_fields = [
        "transaction_id", "date", "description", "amount",
        "payment_method", "predicted_recurring", "candidate_id",
        "detected_cadence", "heuristic_confidence",
        "amount_deviation_ratio", "review_required", "evidence",
    ]

    with PREDICTIONS_FILE.open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=prediction_fields)
        writer.writeheader()
        writer.writerows(
            predictions[row["transaction_id"]]
            for row in transactions
        )

    print(f"Debit transactions: {len(transactions)}")
    print(f"Recurring candidate groups: {len(candidates)}")
    print(f"Transaction predictions: {len(predictions)}")
    print(f"Saved candidates: {CANDIDATES_FILE}")
    print(f"Saved predictions: {PREDICTIONS_FILE}")


if __name__ == "__main__":
    main()
