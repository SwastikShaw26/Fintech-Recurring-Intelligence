"""Explainable signals for review of imported and synthetic debit evidence."""

from collections import defaultdict
from datetime import date
from statistics import median


def observed_date(row):
    try:
        return date.fromisoformat(row["date"])
    except (KeyError, TypeError, ValueError):
        return None


def review_signals(transactions, commitments, format_amount):
    results = []
    rows = {row["transaction_id"]: row for row in transactions if row["direction"] == "debit"}
    duplicates = defaultdict(list)

    def add(kind, title, related, evidence, action, commitment_id=None, change_ratio=None):
        ids = [row["transaction_id"] for row in related]
        results.append({
            "alert_id": f"{kind}_{commitment_id or ''}_{ids[-1]}",
            "alert_type": kind, "severity": "informational", "confirmed": False,
            "title": title, "transaction_ids": ids, "evidence": evidence,
            "recommended_action": action,
            **({"commitment_id": commitment_id} if commitment_id else {}),
            **({"change_ratio": change_ratio} if change_ratio is not None else {}),
        })

    for row in rows.values():
        if observed_date(row) is not None and row["description"].strip() and row["amount"] > 0:
            key = (row["date"], row["description"].strip().upper(), row["amount"], row["payment_method"].strip().upper())
            duplicates[key].append(row)
    for (day, _, amount, method), matching in duplicates.items():
        if len(matching) > 1:
            add("possible_duplicate", f"Possible duplicate debit: {matching[0]['description']}", matching, [
                f"{len(matching)} debits of {format_amount(amount)} on {day} share the same descriptor and payment method.",
                f"Payment method: {method or 'unavailable'}.",
            ], "Check the statement references or receipts. Separate legitimate purchases can look identical.")

    for commitment in commitments:
        cid = commitment["commitment_id"]
        name = commitment["display_name"]
        cadence = commitment["cadence"]
        history = [(observed_date(rows[tx_id]), rows[tx_id]) for tx_id in commitment["transaction_ids"] if tx_id in rows]
        history = sorted(((day, row) for day, row in history if day is not None), key=lambda item: item[0])
        period = {"monthly": 30, "quarterly": 91, "annual": 365}.get(cadence)
        if period and len(history) >= 3:
            for index in range(len(history) - 1, 1, -1):
                previous, before = history[index - 1]
                current, after = history[index]
                earlier, earlier_row = history[index - 2]
                gap = (current - previous).days
                prior_gap = (previous - earlier).days
                if gap >= period * 1.65 and 0.85 * period <= prior_gap <= 1.15 * period:
                    add("charge_after_gap", f"Charge after a gap: {name}", [earlier_row, before, after], [
                        f"{gap} days elapsed between debits on {previous} and {current}.",
                        f"The earlier observed gap was {prior_gap} days. The detected cadence is {cadence}.",
                    ], "Check whether the statement period is complete and review the provider's billing history.", cid)
                    break

        if not period or len(history) < 4:
            continue
        window = history[-4:]
        if len({day for day, _ in window}) != 4 or any(row.get("refund_status") == "matched_debit" for _, row in window):
            continue
        earlier_amounts = [row["amount"] for _, row in window[:2]]
        recent_amounts = [row["amount"] for _, row in window[2:]]
        earlier, recent = median(earlier_amounts), median(recent_amounts)
        if min(earlier, recent) <= 0:
            continue
        change = (recent - earlier) / earlier
        if max(earlier_amounts) - min(earlier_amounts) <= 0.05 * earlier and (
            max(recent_amounts) - min(recent_amounts) <= 0.05 * recent
        ) and abs(change) >= 0.15:
            add("sustained_amount_change", f"Recent amount changed: {name}", [row for _, row in window], [
                f"Two earlier debits centered on {format_amount(earlier)} and the two latest on {format_amount(recent)} ({change:+.1%}).",
                f"Observed from {window[0][0]} to {window[-1][0]}.",
            ], "Check invoices for plan changes, usage, fees, or adjustments.", cid, change_ratio=change)
    return results
