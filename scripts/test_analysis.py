#!/usr/bin/env python3
"""Send synthetic_transactions.csv to the FinSight backend and print the analysis result.

Usage:
    python scripts/test_analysis.py                         # hits Render
    python scripts/test_analysis.py http://localhost:8000    # hits local server
"""

import json
import sys
import urllib.request
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "synthetic_transactions.csv"

# The CSV columns are:
# 0: transaction_id, 1: date, 2: description, 3: amount, 4: direction, 5: payment_method, 6: reference_id, 7: scenario_id
MAPPING = {
    "date": 1,
    "description": 2,
    "amount": 3,
    "direction": 4,
    "payment_method": 5,
}


def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else "https://fintech-recurring-intelligence.onrender.com"
    api_url = base_url.rstrip("/") + "/api/private-statement"

    csv_text = CSV_PATH.read_text(encoding="utf-8")
    print(f"Read {len(csv_text):,} bytes from {CSV_PATH.name}")
    print(f"Target: {api_url}")

    payload = json.dumps({
        "csv": csv_text,
        "mapping": MAPPING,
        "currency": "INR",
    }).encode("utf-8")

    req = urllib.request.Request(
        api_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            print(f"\n--- Analysis Result ---")
            print(f"analysis_id:  {body.get('analysis_id')}")
            print(f"commitments:  {len(body.get('commitments', []))}")
            print(f"transactions: {len(body.get('transactions', []))}")
            print(f"alerts:       {len(body.get('alerts', []))}")
            if body.get("summary"):
                print(f"\nsummary:")
                for k, v in body["summary"].items():
                    print(f"  {k}: {v}")
            # Print first commitment for verification
            comms = body.get("commitments", [])
            if comms:
                print(f"\nFirst commitment:")
                c = comms[0]
                print(f"  id:       {c.get('commitment_id')}")
                print(f"  name:     {c.get('display_name')}")
                print(f"  cadence:  {c.get('cadence')}")
                print(f"  status:   {c.get('status')}")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        print(f"\nHTTP {exc.code} {exc.reason}", file=sys.stderr)
        print(error_body, file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"\nError: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
