"""Bounded CSV parsing for a private, single-request statement analysis."""

import csv
import re
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import StringIO

MAX_REQUEST_BYTES = 2_500_000
MAX_ROWS = 10_000
MAX_COLUMNS = 64
MAX_OVERLAP_REVIEW_ROWS = 100
NORMALIZED_MAPPING = {"date": 0, "description": 1, "amount": 2, "direction": 3, "payment_method": 4}

DATE_FORMATS = {"iso": "%Y-%m-%d", "dmy": "%d/%m/%Y", "mdy": "%m/%d/%Y"}
MONEY = re.compile(r"[+-]?(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?:\.\d{1,2})?")
REFUND_MARKER = re.compile(r"^(?:REFUND|REVERSAL)\b[\s:–-]*|[\s:–-]*\b(?:REFUND|REVERSAL)$")


def parse_statement(text):
    if not isinstance(text, str) or "\x00" in text:
        raise ValueError("Choose a UTF-8 CSV statement.")
    try:
        reader = csv.reader(StringIO(text.removeprefix("\ufeff"), newline=""), strict=True)
        columns = [label.strip() for label in next(reader, [])]
        if not 1 <= len(columns) <= MAX_COLUMNS or any(not label or len(label) > 150 for label in columns):
            raise ValueError("The first CSV row must contain column names.")
        rows = []
        for row in reader:
            if not any(value.strip() for value in row):
                continue
            if len(row) != len(columns):
                raise ValueError(f"CSV row ending on line {reader.line_num} has a different number of fields.")
            if len(rows) >= MAX_ROWS:
                raise ValueError(f"Use a statement with at most {MAX_ROWS:,} transactions.")
            rows.append((reader.line_num, row))
    except csv.Error:
        raise ValueError("The statement contains invalid CSV quoting or an oversized field.") from None
    if not rows:
        raise ValueError("The statement has no transactions.")
    return columns, rows


def map_statement(columns, rows, mapping, currency="INR"):
    if not isinstance(mapping, dict):
        raise ValueError("Map the statement fields before analyzing.")
    split = mapping.get("debit_amount") is not None or mapping.get("credit_amount") is not None
    required = ("date", "description", "debit_amount", "credit_amount") if split else ("date", "description", "amount")
    fields = {key: mapping.get(key) for key in (*required, "direction", "payment_method")}
    if split and (mapping.get("amount") is not None or fields["direction"] is not None):
        raise ValueError("Use either separate debit and credit columns or one amount column.")
    indices = [index for index in fields.values() if index is not None]
    if (
        any(fields[key] is None for key in required)
        or any(type(index) is not int or not 0 <= index < len(columns) for index in indices)
        or len(indices) != len(set(indices))
    ):
        raise ValueError("Choose a different CSV column for each mapped field.")
    date_format = mapping.get("date_format", "iso")
    amount_sign = mapping.get("amount_sign", "negative_debit")
    if not isinstance(date_format, str) or date_format not in DATE_FORMATS or amount_sign not in ("negative_debit", "positive_debit"):
        raise ValueError("Choose a supported date format and amount convention.")

    transactions = []
    for line, row in rows:
        def value(field):
            index = fields[field]
            return row[index].strip() if index is not None else ""

        try:
            raw_date = value("date")
            observed = datetime.strptime(raw_date, DATE_FORMATS[date_format]).date()
            if observed > date.today():
                raise ValueError()
        except ValueError:
            raise ValueError(f"Line {line}: enter a valid date in the selected format.") from None

        description = value("description")
        payment_method = value("payment_method")
        if not 1 <= len(description) <= 250 or len(payment_method) > 60:
            raise ValueError(f"Line {line}: description or payment method is missing or too long.")
        def parse_amount(field, allow_blank=False):
            raw = value(field)
            if currency == "INR":
                raw = raw.removeprefix("₹").strip()
            if allow_blank and not raw:
                return Decimal(0)
            if not MONEY.fullmatch(raw):
                raise ValueError()
            return Decimal(raw.replace(",", ""))

        try:
            if split:
                debit_amount = parse_amount("debit_amount", allow_blank=True)
                credit_amount = parse_amount("credit_amount", allow_blank=True)
                if min(debit_amount, credit_amount) < 0 or bool(debit_amount) == bool(credit_amount):
                    raise ValueError()
                debit = bool(debit_amount)
                amount = debit_amount or credit_amount
            else:
                amount = parse_amount("amount")
            if not 0 < abs(amount) <= 1_000_000_000:
                raise ValueError()
        except (InvalidOperation, ValueError):
            detail = "enter a positive amount in exactly one of debit or credit." if split else "enter a valid, nonzero amount."
            raise ValueError(f"Line {line}: {detail}") from None

        if not split and fields["direction"] is None:
            debit = (amount < 0) == (amount_sign == "negative_debit")
        elif not split:
            direction = value("direction").lower()
            if direction not in ("debit", "credit", "dr", "cr", "d", "c"):
                raise ValueError(f"Line {line}: the direction must identify a debit or credit.")
            debit = direction in ("debit", "dr", "d")
        transactions.append({
            "transaction_id": f"statement-{line}", "date": observed, "description": description,
            "amount": float(abs(amount)), "direction": "debit" if debit else "credit",
            "payment_method": payment_method,
        })
    return transactions


def plan_statement_overlap(existing, incoming):
    """Review exact occurrence matches and changed same-day entries before combining."""
    def signature(row):
        return tuple(row[field] for field in ("date", "description", "amount", "direction", "payment_method"))

    def nearby_key(row):
        descriptor = " ".join(row["description"].casefold().split())
        return row["date"], descriptor, row["direction"]

    def evidence(row):
        return {field: row.get(field) for field in ("transaction_id", "date", "description", "amount", "direction", "payment_method")}

    original_counts = Counter(map(signature, existing))
    remaining = original_counts.copy()
    by_descriptor = {}
    for row in existing:
        by_descriptor.setdefault(nearby_key(row), row)
    added = []
    skipped = 0
    ambiguous_count = 0
    conflicts = []
    for row in incoming:
        key = signature(row)
        if remaining[key]:
            remaining[key] -= 1
            skipped += 1
            continue
        added.append(row)
        earlier = by_descriptor.get(nearby_key(row))
        if earlier is not None and not original_counts[key]:
            ambiguous_count += 1
            if len(conflicts) < MAX_OVERLAP_REVIEW_ROWS:
                conflicts.append({**evidence(row), "existing": evidence(earlier)})
    return added, {
        "exact_matches": skipped,
        "new_rows": len(added) - ambiguous_count,
        "ambiguous_count": ambiguous_count,
        "conflicts": conflicts,
    }


def merge_statement_rows(existing, incoming, excluded=()):
    """Combine same-account exports after the user confirms complete daily coverage."""
    added, review = plan_statement_overlap(existing, incoming)
    return apply_statement_overlap(existing, added, review, excluded)


def apply_statement_overlap(existing, added, review, excluded):
    reviewed_ids = {row["transaction_id"] for row in review["conflicts"]}
    if (not isinstance(excluded, (list, tuple)) or len(excluded) > MAX_OVERLAP_REVIEW_ROWS
            or any(not isinstance(item, str) or item not in reviewed_ids for item in excluded)
            or len(set(excluded)) != len(excluded)):
        raise ValueError("Exclude only reviewed overlap rows.")
    excluded_ids = set(excluded)
    merged = [*existing, *(row for row in added if row.get("transaction_id") not in excluded_ids)]
    if len(merged) > MAX_ROWS:
        raise ValueError(f"Keep at most {MAX_ROWS:,} transactions in one statement workspace.")
    return ([{**row, "transaction_id": f"statement-{index}"} for index, row in enumerate(merged, 2)],
            review["exact_matches"])


def reconcile_refunds(rows, aliases):
    """Suggest one-to-one full refunds from explicitly labeled credits."""
    def signature(row, descriptor):
        merchant = aliases.get(descriptor, descriptor)
        return merchant, row["amount"], row["payment_method"].strip().upper()

    debits = defaultdict(list)
    for row in rows:
        if row["direction"] == "debit":
            key = signature(row, row["description"].strip().upper())
            debits[key].append((row["date"], row["transaction_id"]))
    for entries in debits.values():
        entries.sort()

    possible = {}
    claims = defaultdict(lambda: ([], []))
    result = {}
    for row in rows:
        if row["direction"] != "credit":
            continue
        merchant, marker_count = REFUND_MARKER.subn("", row["description"].strip().upper())
        if not marker_count:
            continue
        credit_id = row["transaction_id"]
        result[credit_id] = {"refund_status": "review"}
        if not merchant:
            continue
        key = signature(row, merchant.strip())
        entries = debits.get(key, [])
        lower = max(date.min.toordinal(), row["date"].toordinal() - 30)
        start = bisect_left(entries, date.fromordinal(lower), key=lambda entry: entry[0])
        end = bisect_right(entries, row["date"], key=lambda entry: entry[0])
        if start < end:
            starts, ends = claims[key]
            starts.append(start)
            ends.append(end)
            if end - start == 1:
                possible[credit_id] = key, start, entries[start][1]

    for starts, ends in claims.values():
        starts.sort()
        ends.sort()
    for credit_id, (key, index, debit_id) in possible.items():
        starts, ends = claims[key]
        if bisect_right(starts, index) - bisect_right(ends, index) == 1:
            result[credit_id] = {"refund_status": "matched_credit", "refund_transaction_id": debit_id}
            result[debit_id] = {"refund_status": "matched_debit", "refund_transaction_id": credit_id}
    return result
