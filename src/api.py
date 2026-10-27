
import csv
import hashlib
from datetime import date
from pathlib import Path
from statistics import median
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.cancellation_guide import get_cancellation_guidance

ROOT = Path(__file__).resolve().parents[1]
TRANSACTIONS_FILE = ROOT / "data" / "raw" / "synthetic_transactions.csv"
LABELS_FILE = ROOT / "data" / "raw" / "ground_truth_labels.csv"

# Prefer v3 detector output; retain v2 as a fallback.
CANDIDATES_V3_FILE = ROOT / "data" / "processed" / "recurring_candidates_v3.csv"
CANDIDATES_V2_FILE = ROOT / "data" / "processed" / "recurring_candidates.csv"
PREDICTIONS_FILE = ROOT / "data" / "processed" / "transaction_predictions.csv"
FRONTEND_DIST = ROOT / "frontend" / "dist"

app = FastAPI(
    title="FinSight API",
    description="Recurring payment intelligence using synthetic transaction data.",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def read_csv(path: Path, required: bool = True) -> list[dict]:
    if not path.exists():
        if required:
            raise RuntimeError(f"Required data file is missing: {path.name}")
        return []

    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def pick(row: dict, *names: str, default=None):
    lookup = {str(key).strip().lower(): value for key, value in row.items()}
    for name in names:
        value = lookup.get(name.lower())
        if value is not None and str(value).strip() != "":
            return value
    return default


def normalized(value) -> str:
    return " ".join(str(value or "").upper().split())


def as_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None or str(value).strip() == "":
        return default
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def make_commitment_id(candidate_id: str, description: str, cadence: str) -> str:
    raw = f"{candidate_id}|{normalized(description)}|{cadence.lower()}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    return f"c_{digest}"


def candidates_file() -> Path:
    if CANDIDATES_V3_FILE.exists():
        return CANDIDATES_V3_FILE
    return CANDIDATES_V2_FILE


def load_predictions() -> dict:
    """Index v3 predictions by transaction ID."""
    result = {}
    for row in read_csv(PREDICTIONS_FILE, required=False):
        transaction_id = str(pick(row, "transaction_id", default="")).strip()
        if not transaction_id:
            continue

        deviation = as_float(
            pick(row, "amount_deviation_ratio", default=None)
        )

        result[transaction_id] = {
            "predicted_recurring": as_bool(
                pick(row, "predicted_recurring", default=False)
            ),
            "candidate_id": pick(row, "candidate_id", default=""),
            "detected_cadence": pick(
                row, "detected_cadence", default="unknown"
            ),
            "heuristic_confidence": as_float(
                pick(row, "heuristic_confidence", default=None)
            ),
            "amount_deviation_ratio": deviation,
            "review_required": as_bool(
                pick(row, "review_required", default=False)
            ),
            "detector_evidence": str(
                pick(row, "evidence", default="")
            ),
        }

    return result


def load_transactions() -> list[dict]:
    rows = read_csv(TRANSACTIONS_FILE)
    predictions = load_predictions()
    result = []

    for row in rows:
        amount = as_float(row.get("amount"))
        if amount is None:
            continue

        transaction_id = str(row.get("transaction_id", ""))
        prediction = predictions.get(transaction_id, {})

        deviation = prediction.get("amount_deviation_ratio")
        review_required = prediction.get("review_required", False)

        result.append({
            "transaction_id": transaction_id,
            "date": str(row.get("date", "")),
            "description": str(row.get("description", "")),
            "amount": amount,
            "direction": str(row.get("direction", "")).lower(),
            "payment_method": str(row.get("payment_method", "")),
            "reference_id": row.get("reference_id") or None,
            "predicted_recurring": prediction.get(
                "predicted_recurring", False
            ),
            "candidate_id": prediction.get("candidate_id"),
            "detected_cadence": prediction.get("detected_cadence"),
            "heuristic_confidence": prediction.get(
                "heuristic_confidence"
            ),
            "amount_deviation_ratio": deviation,
            "review_required": review_required,
            "review_reason": (
                f"Amount differs {deviation:.1%} from the group's median."
                if review_required and deviation is not None
                else (
                    "Detector flagged this transaction for review."
                    if review_required
                    else None
                )
            ),
            "detector_evidence": prediction.get("detector_evidence", ""),
        })

    return result


def load_commitments() -> list[dict]:
    transactions = load_transactions()
    candidate_rows = read_csv(candidates_file())

    candidate_tx_map = {}
    description_tx_map = {}
    for tx in transactions:
        if tx["direction"] != "debit":
            continue
        c_id = tx.get("candidate_id")
        if c_id:
            candidate_tx_map.setdefault(c_id, []).append(tx)
        key = normalized(tx["description"])
        description_tx_map.setdefault(key, []).append(tx)

    commitments = []
    seen = set()

    for row in candidate_rows:
        cand_id = str(pick(row, "candidate_id", default="")).strip()
        description = pick(
            row,
            "description",
            "normalized_description",
            "merchant",
            "display_merchant",
            "group_name",
        )
        cadence = str(
            pick(row, "cadence", "detected_cadence", default="unknown")
        ).lower()

        if not description:
            continue

        key = normalized(description)
        commitment_id = make_commitment_id(cand_id, description, cadence)

        if commitment_id in seen:
            continue
        seen.add(commitment_id)

        # Match transactions by candidate_id first; fallback to description
        matching = candidate_tx_map.get(cand_id)
        if not matching:
            matching = [
                tx for tx in description_tx_map.get(key, [])
                if tx["direction"] == "debit"
            ]

        matching.sort(key=lambda tx: tx["date"])

        amount_values = [abs(tx["amount"]) for tx in matching]
        dates = [tx["date"] for tx in matching if tx["date"]]

        count = as_int(
            pick(row, "transaction_count", "count", "num_transactions")
        )
        if count is None:
            count = len(matching)

        score = as_float(
            pick(
                row,
                "heuristic_confidence",
                "confidence_score",
                "confidence",
                "score",
            )
        )

        evidence_text = str(
            pick(
                row,
                "timing_evidence",
                "evidence",
                "explanation",
                default="",
            )
        )

        if "monthly" in cadence:
            annual_cost = median(amount_values) * 12 if amount_values else None
        elif "quarterly" in cadence:
            annual_cost = median(amount_values) * 4 if amount_values else None
        elif "annual" in cadence or "yearly" in cadence:
            annual_cost = median(amount_values) if amount_values else None
        else:
            annual_cost = None

        flagged_transactions = [
            tx for tx in matching if tx["review_required"]
        ]

        evidence = []
        if count:
            evidence.append(f"{count} transactions reported by the detector.")
        if dates:
            evidence.append(
                f"Observed history runs from {dates[0]} to {dates[-1]}."
            )
        if amount_values:
            evidence.append(
                f"Median observed debit amount: INR {median(amount_values):.2f}."
            )
        if evidence_text:
            evidence.append(evidence_text)
        if flagged_transactions:
            evidence.append(
                f"{len(flagged_transactions)} transaction(s) need amount review."
            )

        # Determine primary payment method for cancellation guidance
        methods = [tx["payment_method"] for tx in matching if tx["payment_method"]]
        primary_method = methods[0] if methods else "unknown"
        cancellation_info = get_cancellation_guidance(primary_method, str(description))

        commitments.append({
            "commitment_id": commitment_id,
            "candidate_id": cand_id,
            "merchant_id": None,
            "display_name": str(description),
            "observed_descriptors": sorted({
                tx["description"] for tx in matching
            }),
            "cadence": cadence,
            "status": "candidate",
            "confidence_score": score,
            "primary_payment_method": primary_method,
            "transaction_ids": [tx["transaction_id"] for tx in matching],
            "transaction_count": count,
            "first_observed_date": dates[0] if dates else None,
            "last_observed_date": dates[-1] if dates else None,
            "typical_amount": median(amount_values) if amount_values else None,
            "estimated_annual_cost": annual_cost,
            "currency": "INR",
            "review_required": bool(flagged_transactions),
            "review_transaction_count": len(flagged_transactions),
            "evidence": evidence,
            "cancellation_guidance": cancellation_info,
        })

    return commitments


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "FinSight API",
        "data_mode": "synthetic",
        "detector_version": (
            "v3" if CANDIDATES_V3_FILE.exists() else "v2-fallback"
        ),
    }


@app.get("/api/summary")
def summary():
    transactions = load_transactions()
    commitments = load_commitments()

    debit_count = sum(tx["direction"] == "debit" for tx in transactions)
    known_estimates = [
        item["estimated_annual_cost"]
        for item in commitments
        if item["estimated_annual_cost"] is not None
    ]

    return {
        "transaction_count": len(transactions),
        "debit_transaction_count": debit_count,
        "detected_pattern_count": len(commitments),
        "estimated_annual_cost": round(sum(known_estimates), 2),
        "annual_estimate_count": len(known_estimates),
        "review_required_transaction_count": sum(
            tx["review_required"] for tx in transactions
        ),
        "review_required_commitment_count": sum(
            item["review_required"] for item in commitments
        ),
        "currency": "INR",
        "data_mode": "synthetic",
    }


@app.get("/api/transactions")
def transactions_endpoint(
    search: Optional[str] = Query(default=None, max_length=100),
    direction: Optional[str] = Query(
        default=None, pattern="^(debit|credit)$"
    ),
    review_required: Optional[bool] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    rows = load_transactions()

    if search:
        term = search.casefold()
        rows = [
            tx for tx in rows
            if term in tx["description"].casefold()
            or term in tx["transaction_id"].casefold()
        ]

    if direction:
        rows = [tx for tx in rows if tx["direction"] == direction]

    if review_required is not None:
        rows = [
            tx for tx in rows
            if tx["review_required"] == review_required
        ]

    rows.sort(
        key=lambda tx: (tx["date"], tx["transaction_id"]),
        reverse=True,
    )

    return {
        "total": len(rows),
        "limit": limit,
        "offset": offset,
        "items": rows[offset:offset + limit],
    }


@app.get("/api/commitments")
def commitments_endpoint(
    cadence: Optional[str] = Query(default=None, max_length=30),
    search: Optional[str] = Query(default=None, max_length=100),
    review_required: Optional[bool] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    rows = load_commitments()

    if cadence:
        rows = [
            item for item in rows
            if item["cadence"].lower() == cadence.lower()
        ]

    if search:
        term = search.casefold()
        rows = [
            item for item in rows
            if term in item["display_name"].casefold()
        ]

    if review_required is not None:
        rows = [
            item for item in rows
            if item["review_required"] == review_required
        ]

    rows.sort(
        key=lambda item: item["estimated_annual_cost"] or 0,
        reverse=True,
    )

    return {"total": len(rows), "items": rows[:limit]}


@app.get("/api/commitments/{commitment_id}")
def commitment_detail(commitment_id: str):
    matches = [
        item for item in load_commitments()
        if item["commitment_id"] == commitment_id
    ]

    if not matches:
        raise HTTPException(status_code=404, detail="Commitment not found")

    commitment = matches[0]
    wanted_ids = set(commitment["transaction_ids"])

    history = [
        tx for tx in load_transactions()
        if tx["transaction_id"] in wanted_ids
    ]
    history.sort(key=lambda tx: tx["date"])

    commitment["transactions"] = history
    return commitment


@app.get("/api/cancellation-guide/{payment_method}")
def cancellation_guide_endpoint(payment_method: str, merchant: Optional[str] = Query(default=None)):
    """Return regulatory-backed cancellation guide for specific payment method."""
    return get_cancellation_guidance(payment_method, merchant or "Merchant")


@app.get("/api/alerts")
def alerts_endpoint():
    """
    Conservative review suggestions based on observed transaction evidence.
    They do not prove a subscription is active or cancelled.
    """
    alerts = []
    transactions = load_transactions()

    for tx in transactions:
        if tx["direction"] != "debit" or not tx["review_required"]:
            continue

        alerts.append({
            "alert_id": f"amount_{tx['transaction_id']}",
            "transaction_id": tx["transaction_id"],
            "alert_type": "amount_deviation",
            "severity": "warning",
            "title": f"Review unusual amount: {tx['description']}",
            "evidence": [
                tx["review_reason"],
                f"Observed transaction amount: INR {abs(tx['amount']):.2f}.",
                f"Transaction date: {tx['date']}.",
            ],
            "recommended_action": (
                "Compare this transaction with the surrounding history "
                "and verify the charge with the provider if needed."
            ),
            "confirmed": False,
        })

    for item in load_commitments():
        if item["cadence"] == "irregular":
            alerts.append({
                "alert_id": f"review_{item['commitment_id']}",
                "commitment_id": item["commitment_id"],
                "alert_type": "irregular_pattern",
                "severity": "informational",
                "title": (
                    f"Review irregular payment pattern: "
                    f"{item['display_name']}"
                ),
                "evidence": item["evidence"],
                "recommended_action": (
                    "Review the transaction history to determine whether "
                    "these payments represent a recurring commitment."
                ),
                "confirmed": False,
            })

    return {"total": len(alerts), "items": alerts}


@app.get("/api/evaluation")
def evaluation_metrics():
    """Evaluate detector performance against synthetic ground truth labels."""
    if not LABELS_FILE.exists() or not PREDICTIONS_FILE.exists():
        raise HTTPException(status_code=404, detail="Labels or predictions file missing")

    transactions = read_csv(TRANSACTIONS_FILE)
    labels = {r["transaction_id"]: r for r in read_csv(LABELS_FILE)}
    predictions = {r["transaction_id"]: r for r in read_csv(PREDICTIONS_FILE)}

    y_true = []
    y_pred = []
    errors = []

    for tx in transactions:
        if tx["direction"].strip().lower() != "debit":
            continue
        tid = tx["transaction_id"]
        lbl = labels.get(tid)
        pred = predictions.get(tid)
        if not lbl or not pred:
            continue

        actual = as_bool(lbl.get("is_recurring"))
        predicted = as_bool(pred.get("predicted_recurring"))

        y_true.append(actual)
        y_pred.append(predicted)

        if actual != predicted:
            errors.append({
                "transaction_id": tid,
                "date": tx.get("date"),
                "description": tx.get("description"),
                "amount": tx.get("amount"),
                "actual": actual,
                "predicted": predicted,
                "scenario": lbl.get("scenario_type"),
            })

    tp = sum(a and p for a, p in zip(y_true, y_pred))
    fp = sum((not a) and p for a, p in zip(y_true, y_pred))
    fn = sum(a and (not p) for a, p in zip(y_true, y_pred))
    tn = sum((not a) and (not p) for a, p in zip(y_true, y_pred))

    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
    acc = (tp + tn) / len(y_true) if y_true else 0.0

    return {
        "evaluated_transactions": len(y_true),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "accuracy": round(acc, 4),
        "errors": errors,
        "data_mode": "synthetic",
    }


# Serve React SPA from frontend/dist if available
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Index file not found")
