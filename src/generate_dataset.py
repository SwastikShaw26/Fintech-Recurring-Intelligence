
"""Generate reproducible, fully synthetic recurring-payment data."""

from __future__ import annotations

import argparse
import csv
import random
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"

MERCHANTS = {
    "M001": ("StreamBee", "STREAMBEE*SUBSCRIPTION"),
    "M002": ("CloudNest", "CLDNST DIGITAL"),
    "M003": ("FitTrail", "FITTRAIL MEMBERSHIP"),
    "M004": ("LearnLoop", "LRNLOOP ONLINE"),
    "M005": ("NewsSpring", "NEWS-SPRING RENEW"),
    "M006": ("TuneHarbor", "TUNEHARBOR MEDIA"),
    "M007": ("SafeVault", "SV SAFEVAULT PLAN"),
    "M008": ("PixelForge", "PIXELFORGE PRO"),
}

FIELDS = [
    "transaction_id", "date", "description", "amount",
    "direction", "payment_method", "reference_id", "scenario_id",
]

LABEL_FIELDS = [
    "transaction_id", "merchant_id", "commitment_id", "is_recurring",
    "cadence", "scenario_type", "expected_price_change",
    "expected_resumption", "payment_route",
]


def add_months(start: date, months: int) -> date:
    """Advance by calendar months, clamping the day to month-end."""
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1

    import calendar

    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def generate(seed: int = 42) -> tuple[list[dict], list[dict]]:
    rng = random.Random(seed)
    transactions: list[dict] = []
    labels: list[dict] = []
    counter = 1

    def add_scenario(
        scenario_id: str,
        merchant_id: str,
        scenario_type: str,
        cadence: str,
        recurring: bool,
        payment_method: str,
        start: date,
        gaps: list[int],
        amounts: list[float],
        price_change: bool = False,
        resumed: bool = False,
        descriptor_change: bool = False,
        descriptor_override: str | None = None,
    ) -> None:
        nonlocal counter

        merchant_name, default_descriptor = MERCHANTS[merchant_id]
        descriptor = descriptor_override or default_descriptor
        commitment_id = f"C-{scenario_id}" if recurring else ""

        for index, (gap, amount) in enumerate(zip(gaps, amounts)):
            txn_date = start + timedelta(days=gap)
            transaction_id = f"TXN-{counter:05d}"
            counter += 1

            raw_description = descriptor
            if descriptor_change and index >= len(gaps) // 2:
                raw_description = merchant_name.upper() + " RENEWAL"

            transactions.append({
                "transaction_id": transaction_id,
                "date": txn_date.isoformat(),
                "description": raw_description,
                "amount": f"{amount:.2f}",
                "direction": "debit",
                "payment_method": payment_method,
                "reference_id": f"REF-{counter:05d}",
                "scenario_id": scenario_id,
            })

            labels.append({
                "transaction_id": transaction_id,
                "merchant_id": merchant_id,
                "commitment_id": commitment_id,
                "is_recurring": str(recurring).lower(),
                "cadence": cadence,
                "scenario_type": scenario_type,
                "expected_price_change": str(price_change).lower(),
                "expected_resumption": str(resumed).lower(),
                "payment_route": payment_method,
            })

    # S001: Monthly fixed subscription.
    add_scenario(
        "S001", "M001", "monthly_fixed", "monthly", True, "UPI AutoPay",
        date(2026, 1, 5), [0, 31, 59, 90, 120, 151],
        [199, 199, 199, 199, 199, 199],
    )

    # S002: Quarterly subscription.
    add_scenario(
        "S002", "M002", "quarterly_fixed", "quarterly", True, "card",
        date(2025, 7, 10), [0, 92, 184, 276, 368],
        [899, 899, 899, 899, 899],
    )

    # S003: Annual renewal.
    add_scenario(
        "S003", "M003", "annual_renewal", "annual", True, "card",
        date(2024, 2, 15), [0, 366, 731],
        [1499, 1499, 1499],
    )

    # S004: Annual renewal with shifted dates.
    add_scenario(
        "S004", "M004", "annual_shifted", "annual", True, "bank mandate",
        date(2023, 11, 20), [0, 364, 733],
        [2499, 2499, 2499],
    )

    # S005: Variable recurring amounts.
    add_scenario(
        "S005", "M005", "variable_amount", "monthly", True, "card",
        date(2026, 2, 2), [0, 28, 59, 89, 120],
        [299, 319, 305, 329, 310],
    )

    # S006: Irregular recurring commitment.
    add_scenario(
        "S006", "M006", "irregular_recurring", "irregular", True, "unknown",
        date(2025, 6, 3), [0, 24, 91, 126, 209],
        [149, 149, 149, 149, 149],
    )

    # S007: Trial-to-paid subscription.
    add_scenario(
        "S007", "M007", "trial_to_paid", "monthly", True, "card",
        date(2026, 3, 1), [0, 7, 38, 68],
        [1, 499, 499, 499],
    )

    # S008: Charge resumes after a long gap.
    add_scenario(
        "S008", "M008", "resumed_after_gap", "monthly", True, "UPI AutoPay",
        date(2025, 8, 1), [0, 30, 60, 240, 270],
        [399, 399, 399, 399, 399],
        resumed=True,
    )

    # S009: Possible price increase; distinct synthetic descriptor.
    add_scenario(
        "S009", "M001", "price_increase", "monthly", True, "UPI AutoPay",
        date(2026, 1, 8), [0, 31, 59, 90, 120],
        [199, 199, 199, 249, 249],
        price_change=True,
        descriptor_override="STREAMBEE PRICE PLAN",
    )

    # S010: Descriptor changes during the same commitment.
    add_scenario(
        "S010", "M002", "descriptor_change", "quarterly", True, "card",
        date(2025, 1, 10), [0, 90, 181, 272],
        [599, 599, 599, 599],
        descriptor_change=True,
    )

    # S011: Repeated purchases without a commitment.
    add_scenario(
        "S011", "M005", "habitual_one_off_purchases", "none", False, "card",
        date(2026, 1, 4), [0, 6, 21, 49, 55],
        [129, 249, 129, 399, 129],
        descriptor_override="NEWS-SPRING SHOPPING",
    )

    # S012: Single purchase.
    add_scenario(
        "S012", "M003", "single_purchase", "none", False, "card",
        date(2026, 5, 12), [0], [799],
    )

    # S013: Irregular one-off purchases.
    add_scenario(
        "S013", "M001", "irregular_one_offs", "none", False, "UPI",
        date(2025, 12, 1), [0, 13, 79, 155, 162],
        [89, 449, 119, 699, 149],
        descriptor_override="STREAMBEE ONE-OFF",
    )

    # S014: Refund credit, not a recurring debit.
    txn_date = date(2026, 4, 8)
    transaction_id = f"TXN-{counter:05d}"
    counter += 1

    transactions.append({
        "transaction_id": transaction_id,
        "date": txn_date.isoformat(),
        "description": "STREAMBEE REFUND",
        "amount": "199.00",
        "direction": "credit",
        "payment_method": "UPI",
        "reference_id": f"REF-{counter:05d}",
        "scenario_id": "S014",
    })

    labels.append({
        "transaction_id": transaction_id,
        "merchant_id": "M001",
        "commitment_id": "",
        "is_recurring": "false",
        "cadence": "none",
        "scenario_type": "refund_credit",
        "expected_price_change": "false",
        "expected_resumption": "false",
        "payment_route": "UPI",
    })

    transactions.sort(key=lambda row: (row["date"], row["transaction_id"]))
    label_by_id = {row["transaction_id"]: row for row in labels}
    labels = [label_by_id[row["transaction_id"]] for row in transactions]

    # Reserved for future deterministic extensions.
    _ = rng, add_months

    return transactions, labels


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    transactions, labels = generate(seed=args.seed)

    write_csv(RAW_DIR / "synthetic_transactions.csv", transactions, FIELDS)
    write_csv(RAW_DIR / "ground_truth_labels.csv", labels, LABEL_FIELDS)

    print(f"Generated {len(transactions)} synthetic transactions.")
    print(f"Generated {len(labels)} ground-truth labels.")
    print(f"Output directory: {RAW_DIR}")
    print("No real personal or financial data was used.")


if __name__ == "__main__":
    main()
