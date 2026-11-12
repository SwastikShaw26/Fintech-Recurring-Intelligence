
import csv
import hashlib
import json
import os
from calendar import monthrange
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = Path(os.getenv("FINSIGHT_PROCESSED_DIR", str(ROOT / "data" / "processed")))
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


def calendar_cadence(dates, required_cadence=None):
    """Find repeated calendar slots within three days, allowing one missed slot per gap."""
    first = dates[0]
    start_month = first.year * 12 + first.month - 1
    best = None, 0.0, None, None
    best_error = float("inf")
    for cadence, period in (("monthly", 1), ("quarterly", 3), ("annual", 12)):
        if required_cadence and cadence != required_cadence:
            continue
        for anchor in range(max(1, first.day - 3), min(31, first.day + 3) + 1):
            previous = 0
            matched = 1
            consecutive = 0
            error = abs(first.day - min(anchor, monthrange(first.year, first.month)[1]))
            last_slot = None
            for observed in dates[1:]:
                for slot in (previous + 1, previous + 2):
                    year, month = divmod(start_month + slot * period, 12)
                    if year > 9999:
                        continue
                    month += 1
                    expected = date(year, month, min(anchor, monthrange(year, month)[1]))
                    if abs((observed - expected).days) <= 3:
                        error += abs((observed - expected).days)
                        consecutive += slot == previous + 1
                        previous = slot
                        matched += 1
                        last_slot = expected
                        break
            coverage = (matched - 1) / (len(dates) - 1)
            if matched >= 3 and consecutive and coverage >= 0.75 and (coverage, -error) > (best[1], -best_error):
                best = cadence, coverage, anchor, last_slot
                best_error = error
    return best


def regular_timing(dates, calendar):
    if len(dates) < 3:
        return None, 0.0, False
    intervals = [(current - previous).days for previous, current in zip(dates, dates[1:])]
    cadence = classify_intervals(intervals)
    if cadence is not None:
        low, high = CADENCES[cadence]
        matches = sum(low <= gap <= high for gap in intervals)
        if matches >= 2 and matches * 2 >= len(intervals):
            return cadence, matches / len(intervals), False
    if calendar:
        cadence, consistency, _, _ = calendar_cadence(dates)
        return cadence, consistency, cadence is not None
    return None, 0.0, False


def split_streams(rows: list[dict], calendar=True) -> list[list[dict]]:
    """Split exact price bands only when each has a regular schedule and their histories overlap."""
    by_amount = defaultdict(list)
    for row in rows:
        by_amount[row["amount"]].append(row)
    if len(by_amount) < 2:
        return [rows]
    dates = [row["date"] for row in rows]
    pooled_cadence, _, _ = regular_timing(dates, calendar)
    if pooled_cadence and all(
        (current - previous).days >= CADENCES[pooled_cadence][0] - 3
        for previous, current in zip(dates, dates[1:])
    ):
        return [rows]
    regular = {
        amount: tier for amount, tier in by_amount.items()
        if regular_timing([row["date"] for row in tier], calendar)[0]
    }
    overlapping = {
        amount for amount, tier in regular.items()
        if any(
            amount != other and tier[0]["date"] <= band[-1]["date"] and band[0]["date"] <= tier[-1]["date"]
            for other, band in regular.items()
        )
    }
    if not overlapping:
        return [rows]
    tiers = [regular[amount] for amount in sorted(overlapping)]
    remainder = [row for row in rows if row["amount"] not in overlapping]
    return [*tiers, remainder] if remainder else tiers


def sustained_price_step(amounts):
    """Recognize a single change between two stable prices with repeated evidence on both sides."""
    earlier, recent = amounts[0], amounts[-1]
    return (
        earlier != recent
        and amounts.count(earlier) >= 2
        and amounts.count(recent) >= 2
        and amounts == [earlier] * amounts.count(earlier) + [recent] * amounts.count(recent)
    )


def detect(transactions, aliases, namespace="demo-v1", *, calendar=True, currency="INR"):
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
        m_rows.sort(key=lambda row: (row["date"], row["transaction_id"]))
        streams = split_streams(m_rows, calendar)

        for rows in streams:
            tier = float(rows[0]["amount"]).hex() if len(streams) > 1 else None
            identity = json.dumps([namespace, merchant_key, tier], ensure_ascii=False)
            commitment_id = "c_" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
            intervals = [
                (rows[i]["date"] - rows[i - 1]["date"]).days
                for i in range(1, len(rows))
            ]

            amounts = [row["amount"] for row in rows]
            typical_amount = median(amounts)

            cadence = None
            calendar_fit = False
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
                cadence, interval_consistency, calendar_fit = regular_timing(
                    [row["date"] for row in rows], calendar
                )

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
                        f"{interval_consistency:.0%} {'calendar slots' if calendar_fit else 'intervals'} fit {cadence}; "
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

            price_step = cadence in CADENCES and all(intervals) and sustained_price_step(amounts)
            trial_id = None
            if (currency == "INR" and cadence in CADENCES and len(rows) >= 4
                    and 0 < amounts[0] <= 10 and 0 < intervals[0] <= 31
                    and len(set(amounts[1:])) == 1 and amounts[1] >= 5 * amounts[0]
                    and regular_timing([row["date"] for row in rows[1:]], calendar)[0] == cadence):
                trial_id = rows[0]["transaction_id"]

            # Predict and flag each transaction individually.
            for row in rows:
                amount_deviation = (
                    abs(row["amount"] - typical_amount) / typical_amount
                    if typical_amount else 0.0
                )

                amount_outlier = (
                    amount_deviation > AMOUNT_OUTLIER_THRESHOLD
                )

                is_recurring_txn = bool(cadence)
                if (cadence in CADENCES and len(rows) >= 4 and amount_deviation > 0.30
                        and not price_step and row["transaction_id"] != trial_id):
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

                anchor_day, anchor_date = None, None
                if calendar and cadence in CADENCES and len(recurring_rows) >= 3:
                    _, _, fitted_day, fitted_date = calendar_cadence([row["date"] for row in recurring_rows], cadence)
                    if fitted_date and abs((recurring_rows[-1]["date"] - fitted_date).days) <= 3:
                        anchor_day, anchor_date = fitted_day, fitted_date.isoformat()

                candidates.append({
                    "candidate_id": candidate_id,
                    "commitment_id": commitment_id,
                    "description": primary_description,
                    "transaction_count": len(recurring_rows),
                    "first_seen": recurring_rows[0]["date"].isoformat(),
                    "last_seen": recurring_rows[-1]["date"].isoformat(),
                    "detected_cadence": cadence,
                    "billing_anchor_day": anchor_day,
                    "billing_anchor_date": anchor_date,
                    "median_amount": round(typical_amount, 2),
                    "amount_pattern": amount_pattern,
                    "interval_consistency": round(
                        interval_consistency, 3
                    ),
                    "heuristic_confidence": round(confidence, 3),
                    "evidence": evidence,
                })

    return candidates, predictions


def main():
    transactions = read_transactions()
    candidates, predictions = detect(transactions, load_aliases())
    candidate_fields = [
        "candidate_id", "commitment_id", "description", "transaction_count",
        "first_seen", "last_seen", "detected_cadence",
        "billing_anchor_day", "billing_anchor_date",
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
