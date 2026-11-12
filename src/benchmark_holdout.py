"""Compare detector modes on the separate, authored synthetic challenge suite."""

import argparse
import csv
import hashlib
import json
from datetime import date
from pathlib import Path

from src import detect_recurring_v3 as detector

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "data/raw/adversarial_benchmark_v1.json"
OUTPUT = ROOT / "frontend/src/components/benchmark-results.json"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def fingerprint(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def metrics(counts):
    tp, fp, tn, fn = (counts[key] for key in ("tp", "fp", "tn", "fn"))
    return {
        "sample_count": tp + fp + tn + fn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None,
    }


def evaluate(*, calendar=False):
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8-sig"))
    aliases = detector.load_aliases()

    def merchant(description):
        normalized = description.strip().upper()
        return aliases.get(normalized, normalized)

    original = read_csv(detector.INPUT_FILE)
    development_keys = {merchant(row["description"]) for row in original}
    suite_keys = set()
    transactions = []
    for case in fixtures:
        keys = {merchant(row[1]) for row in case["rows"]}
        if keys & (development_keys | suite_keys):
            raise ValueError(f"Merchant key overlaps another group: {case['id']}")
        suite_keys.update(keys)
        for index, (day, descriptor, amount, method, _) in enumerate(case["rows"], start=1):
            transactions.append({
                "transaction_id": f"{case['id']}-{index}",
                "date": date.fromisoformat(day), "description": descriptor, "amount": amount,
                "payment_method": method, "direction": "debit",
            })

    _, predictions = detector.detect(transactions, aliases, calendar=calendar)
    if len(predictions) != len(transactions):
        raise ValueError("Expected exactly one prediction per transaction")

    counts = dict.fromkeys(("tp", "fp", "tn", "fn"), 0)
    cases = []
    for case in fixtures:
        case_counts = dict.fromkeys(counts, 0)
        evidence = []
        for index, (_, _, _, _, expected) in enumerate(case["rows"], start=1):
            row = predictions[f"{case['id']}-{index}"]
            predicted = row["predicted_recurring"]
            outcome = ("t" if expected == predicted else "f") + ("p" if predicted else "n")
            counts[outcome] += 1
            case_counts[outcome] += 1
            evidence.append({
                "id": row["transaction_id"], "date": row["date"], "descriptor": row["description"],
                "amount": float(row["amount"]), "method": row["payment_method"],
                "expected": expected, "predicted": predicted, "outcome": outcome,
                "cadence": row["detected_cadence"], "confidence": float(row["heuristic_confidence"]),
                "rationale": row["evidence"],
            })
        cases.append({key: case[key] for key in ("id", "name", "premise")} |
                     {"counts": case_counts, "transactions": evidence})

    return {
        "suite": "Synthetic challenge suite v1",
        "detector": "FinSight V3 with calendar fallback" if calendar else "FinSight V3",
        "detector_sha256": fingerprint(Path(detector.__file__)),
        "fixture_sha256": fingerprint(FIXTURES),
        "aliases_sha256": fingerprint(detector.ALIASES_FILE),
        "merchant_keys": len(suite_keys),
        "counts": counts, "metrics": metrics(counts), "cases": cases,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--compare-calendar", action="store_true")
    args = parser.parse_args()
    result = evaluate()
    if args.compare_calendar:
        calendar_result = evaluate(calendar=True)
        changes = [
            {"id": before["id"], "baseline": before["cadence"], "calendar": after["cadence"]}
            for old, new in zip(result["cases"], calendar_result["cases"])
            for before, after in zip(old["transactions"], new["transactions"])
            if before["cadence"] != after["cadence"]
        ]
        print(json.dumps({
            "baseline": result["metrics"], "calendar": calendar_result["metrics"],
            "baseline_counts": result["counts"], "calendar_counts": calendar_result["counts"],
            "cadence_changes": changes,
        }, indent=2))
    else:
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"counts": result["counts"], "metrics": result["metrics"]}, indent=2))
        print(f"Saved {OUTPUT.relative_to(ROOT)}")
