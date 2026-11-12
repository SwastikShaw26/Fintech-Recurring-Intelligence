from src.api import analyze_statement


def test_overlap_review_preserves_repeat_counts_and_requires_explicit_conflict_choice():
    previous = (
        "date,description,amount,direction,payment_method\n"
        "2025-01-05,Sample Gym,42,debit,card\n"
        "2025-01-05,Sample Gym,42,debit,card\n"
    )
    payload = {
        "csv": (
            "date,description,amount,direction,payment_method\n"
            "2025-01-05,Sample Gym,42,debit,card\n"
            "2025-01-05,Sample Gym,42,debit,card\n"
            "2025-01-05,Sample Gym,42,debit,card\n"
            "2025-01-05,Sample Gym,43,debit,card\n"
            "2025-01-06,Other,55,debit,card\n"
        ),
        "mapping": {"date": 0, "description": 1, "amount": 2, "direction": 3, "payment_method": 4},
        "overlap_csv": previous,
        "overlap_confirmed": True,
    }
    review = analyze_statement({**payload, "overlap_preview": True})
    assert review["overlap_review"]["exact_matches"] == 2
    assert review["overlap_review"]["new_rows"] == 2
    assert review["overlap_review"]["ambiguous_count"] == 1
    conflict, = review["overlap_review"]["conflicts"]
    assert conflict["description"] == "Sample Gym"
    assert conflict["amount"] == 43

    kept = analyze_statement({**payload, "overlap_excluded": []})
    assert len(kept["transactions"]) == 5
    skipped = analyze_statement({**payload, "overlap_excluded": [conflict["transaction_id"]]})
    assert len(skipped["transactions"]) == 4
    assert sum(row["amount"] == 42 for row in skipped["transactions"]) == 3
    assert skipped["duplicate_rows"] == 2
    assert skipped["overlap_excluded_rows"] == 1


def test_overlap_rejects_excluding_unambiguous_rows():
    import pytest

    payload = {
        "csv": "date,description,amount\n2025-01-05,Gym,-43\n",
        "mapping": {"date": 0, "description": 1, "amount": 2},
        "overlap_csv": "date,description,amount,direction,payment_method\n2025-01-06,Gym,42,debit,card\n",
        "overlap_confirmed": True,
        "overlap_excluded": ["statement-2"],
    }
    with pytest.raises(ValueError, match="only reviewed"):
        analyze_statement(payload)
