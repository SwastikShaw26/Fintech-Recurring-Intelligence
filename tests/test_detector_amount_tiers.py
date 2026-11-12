from collections import Counter
from datetime import date

from src.detect_recurring_v3 import detect


def monthly_debit(month, amount):
    return {
        "transaction_id": f"debit-{month}-{amount}",
        "date": date(2025, month, 5),
        "description": "Tier Test Merchant",
        "amount": amount,
        "payment_method": "card",
    }


def commitment_assignments(rows, **options):
    candidates, predictions = detect(rows, {}, **options)
    commitment_ids = {item["candidate_id"]: item["commitment_id"] for item in candidates}
    assert len(commitment_ids) == len(set(commitment_ids.values()))
    linked = Counter(item["candidate_id"] for item in predictions.values() if item["predicted_recurring"])
    assert dict(linked) == {item["candidate_id"]: item["transaction_count"] for item in candidates}
    assert set(predictions) == {row["transaction_id"] for row in rows}
    return candidates, {
        txn_id: commitment_ids[item["candidate_id"]]
        for txn_id, item in predictions.items() if item["predicted_recurring"]
    }


def test_alternating_nearby_amounts_share_one_monthly_commitment():
    rows = [monthly_debit(month, 12 if month % 2 else 18) for month in range(1, 7)]

    candidates, assignments = commitment_assignments(rows)

    candidate, = candidates
    assert candidate["detected_cadence"] == "monthly"
    assert candidate["transaction_count"] == len(rows)
    assert set(assignments.values()) == {candidate["commitment_id"]}
    assert assignments == commitment_assignments(list(reversed(rows)))[1]


def test_parallel_same_day_nearby_price_plans_have_distinct_commitments():
    rows = [monthly_debit(month, amount) for month in range(1, 7) for amount in (12, 18)]

    candidates, assignments = commitment_assignments(rows)

    tiers = {item["median_amount"]: item for item in candidates}
    assert set(tiers) == {12, 18}
    assert all(item["detected_cadence"] == "monthly" and item["transaction_count"] == 6 for item in candidates)
    assert assignments == {row["transaction_id"]: tiers[row["amount"]]["commitment_id"] for row in rows}
    assert assignments == commitment_assignments(list(reversed(rows)))[1]


def test_sustained_price_step_keeps_one_monthly_commitment():
    rows = [monthly_debit(month, 100 if month <= 3 else 200) for month in range(1, 7)]

    candidates, assignments = commitment_assignments(rows)

    candidate, = candidates
    assert candidate["detected_cadence"] == "monthly"
    assert candidate["transaction_count"] == len(rows)
    assert assignments == {row["transaction_id"]: candidate["commitment_id"] for row in rows}
    assert assignments == commitment_assignments(list(reversed(rows)))[1]


def test_inr_trial_exemption_does_not_apply_to_a_usd_outlier():
    rows = [monthly_debit(month, 1 if month == 1 else 40) for month in range(1, 6)]

    inr_candidates, inr_assignments = commitment_assignments(rows, currency="INR")
    usd_candidates, usd_assignments = commitment_assignments(rows, currency="USD")

    assert len(inr_candidates) == len(usd_candidates) == 1
    assert set(inr_assignments) == {row["transaction_id"] for row in rows}
    assert set(usd_assignments) == {row["transaction_id"] for row in rows[1:]}


def test_ordinary_low_usd_monthly_plan_is_still_recurring():
    rows = [monthly_debit(month, 5) for month in range(1, 5)]

    candidates, assignments = commitment_assignments(rows, currency="USD")

    candidate, = candidates
    assert candidate["detected_cadence"] == "monthly"
    assert set(assignments) == {row["transaction_id"] for row in rows}


def test_one_off_price_does_not_hide_parallel_plans():
    rows = [monthly_debit(month, amount) for month in range(1, 7) for amount in (12, 18)]
    one_off = monthly_debit(4, 77)
    candidates, assignments = commitment_assignments([*rows, one_off])
    assert len(candidates) == 2
    assert set(assignments) == {row["transaction_id"] for row in rows}


def test_rotating_prices_with_one_regular_billing_slot_stay_together():
    rows = [monthly_debit(month, (12, 15, 18)[(month - 1) % 3]) for month in range(1, 10)]
    candidates, assignments = commitment_assignments(rows)
    candidate, = candidates
    assert candidate["detected_cadence"] == "monthly"
    assert len(assignments) == 9
