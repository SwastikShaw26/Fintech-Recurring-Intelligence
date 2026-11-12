"""Score untouched merchant-group fixtures without applying review suggestions."""

import json
from collections import defaultdict
from datetime import date

from src.benchmark_holdout import FIXTURES as CHALLENGE_FIXTURES, ROOT, fingerprint, metrics, read_csv
from src.detect_recurring_v3 import INPUT_FILE, detect, load_aliases
from src.merchant_review import merchant_suggestions

FIXTURES = ROOT / "data/raw/merchant_holdout_v1.json"


def evaluate_holdout():
    fixture = json.loads(FIXTURES.read_text(encoding="utf-8-sig"))
    known = load_aliases()
    original = {row["description"].strip().upper() for row in read_csv(INPUT_FILE)}
    prior_challenge = json.loads(CHALLENGE_FIXTURES.read_text(encoding="utf-8-sig"))
    original.update(row[1].strip().upper() for case in prior_challenge for row in case["rows"])
    original_keys = {known.get(name, name) for name in original}
    seen_keys = set()
    counts = dict.fromkeys(("tp", "fp", "tn", "fn"), 0)
    cadence_matches = expected_recurring = exact_commitments = expected_commitments = 0
    predicted_commitments = false_merged_commitments = suggested_pairs = false_merge_suggestions = 0
    for case in fixture["cases"]:
        rows = case["rows"]
        descriptors = {
            row["description"].upper(): row["description"]
            for row in rows if row["direction"] == "debit"
        }
        keys = {known.get(key, key) for key in descriptors}
        if keys & (original_keys | seen_keys):
            raise ValueError(f"Descriptor overlap in holdout case {case['id']}")
        seen_keys.update(keys)
        debits = []
        ground_truth = {}
        expected = defaultdict(set)
        actual = defaultdict(set)
        merchants = defaultdict(set)
        for index, row in enumerate(rows):
            if row["direction"] != "debit":
                continue
            tx_id = str(index)
            debits.append({
                "transaction_id": tx_id, "date": date.fromisoformat(row["date"]),
                "description": row["description"], "amount": row["amount"], "payment_method": "",
                "direction": "debit",
            })
            ground_truth[tx_id] = row
            merchants[row["description"].upper()].add(row["merchant"])
            if row["commitment"] is not None:
                expected[row["commitment"]].add(tx_id)

        _, predictions = detect(debits, {})
        for row in debits:
            tx_id = row["transaction_id"]
            prediction = predictions[tx_id]
            label = ground_truth[tx_id]
            recurring = label["commitment"] is not None
            predicted = prediction["predicted_recurring"]
            counts[("t" if recurring == predicted else "f") + ("p" if predicted else "n")] += 1
            if recurring:
                expected_recurring += 1
                cadence_matches += predicted and label["cadence"] == prediction["detected_cadence"]
            if predicted:
                actual[prediction["candidate_id"]].add(tx_id)

        exact_commitments += len(set(map(frozenset, expected.values())) & set(map(frozenset, actual.values())))
        expected_commitments += len(expected)
        predicted_commitments += len(actual)
        false_merged_commitments += sum(
            len({ground_truth[tx_id]["merchant"] for tx_id in group}) > 1 for group in actual.values()
        )
        suggestions = merchant_suggestions(descriptors, {}, [], known)
        suggested_pairs += len(suggestions)
        false_merge_suggestions += sum(
            len(merchants[item["source"].upper()] | merchants[item["target"].upper()]) > 1
            for item in suggestions
        )

    return {
        "fixture_sha256": fingerprint(FIXTURES),
        "cases": len(fixture["cases"]),
        "counts": counts,
        "debit_metrics": metrics(counts),
        "cadence": {"correct": cadence_matches, "expected": expected_recurring},
        "commitments": {
            "exact_recoveries": exact_commitments, "expected": expected_commitments,
            "predicted": predicted_commitments, "mixed_merchant_predictions": false_merged_commitments,
        },
        "merchant_review": {"proposed_pairs": suggested_pairs, "cross_merchant_proposals": false_merge_suggestions},
    }


if __name__ == "__main__":
    print(json.dumps(evaluate_holdout(), indent=2))
