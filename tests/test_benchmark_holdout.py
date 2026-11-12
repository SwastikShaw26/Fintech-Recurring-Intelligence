import json
import unittest

from src.benchmark_holdout import OUTPUT, evaluate, metrics


class BenchmarkTest(unittest.TestCase):
    def test_metrics_from_confusion_counts(self):
        self.assertEqual(metrics({"tp": 6, "fp": 2, "tn": 5, "fn": 3}), {
            "sample_count": 16, "precision": 0.75, "recall": 6 / 9, "f1": 12 / 17,
        })

    def test_reproducible_results_and_complete_case_evidence(self):
        first = evaluate()
        self.assertEqual(first, evaluate())
        self.assertEqual(first, json.loads(OUTPUT.read_text(encoding="utf-8")))
        rows = [row for case in first["cases"] for row in case["transactions"]]
        self.assertEqual(len(rows), first["metrics"]["sample_count"])
        self.assertEqual(len(rows), len({row["id"] for row in rows}))
        self.assertEqual(len(rows), sum(first["counts"].values()))
        self.assertTrue(all(row["rationale"] for row in rows))
        self.assertEqual(sum(first["counts"].values()), sum(
            sum(case["counts"].values()) for case in first["cases"]
        ))

def test_calendar_cadence_with_drift_and_missing_month():
    from datetime import date
    from src.detect_recurring_v3 import detect

    rows = [
        {"transaction_id": str(index), "date": date.fromisoformat(day), "description": "Calendar fixture",
         "amount": 100, "payment_method": "card", "direction": "debit"}
        for index, day in enumerate(("2025-01-31", "2025-02-27", "2025-04-30", "2025-06-02"))
    ]
    baseline, _ = detect(rows, {}, calendar=False)
    improved, _ = detect(rows, {}, calendar=True)
    assert baseline[0]["detected_cadence"] == "irregular"
    assert improved[0]["detected_cadence"] == "monthly"
    assert "calendar" in improved[0]["evidence"]
    assert improved[0]["billing_anchor_day"] == 31
    assert improved[0]["billing_anchor_date"] == "2025-05-31"
