
import asyncio
import csv
import hashlib
import json
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date
from io import StringIO
from pathlib import Path
from statistics import median
from typing import Optional
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Path as FastApiPath, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from src.cancellation_guide import get_cancellation_guidance
from src.detect_recurring_v3 import detect, load_aliases
from src.local_statement_store import (
    DEFAULT_ACCOUNT, SavedStatementConflict, account_label, delete_statement, list_accounts, load_statement,
    load_statements, save_statement,
)
from src.merchant_review import merchant_suggestions, validate_dismissals
from src.transaction_review import review_signals
from src.private_statement import (
    MAX_REQUEST_BYTES, NORMALIZED_MAPPING, apply_statement_overlap, map_statement,
    parse_statement, plan_statement_overlap, reconcile_refunds,
)

ROOT = Path(__file__).resolve().parents[1]
TRANSACTIONS_FILE = ROOT / "data" / "raw" / "synthetic_transactions.csv"
LABELS_FILE = ROOT / "data" / "raw" / "ground_truth_labels.csv"

# Prefer v3 detector output; retain v2 as a fallback.
PROCESSED_DIR = Path(os.getenv("FINSIGHT_PROCESSED_DIR", str(ROOT / "data" / "processed")))
CANDIDATES_V3_FILE = PROCESSED_DIR / "recurring_candidates_v3.csv"
CANDIDATES_V2_FILE = PROCESSED_DIR / "recurring_candidates.csv"
PREDICTIONS_FILE = PROCESSED_DIR / "transaction_predictions.csv"
FRONTEND_DIST = Path(os.getenv("FINSIGHT_FRONTEND_DIST", str(ROOT / "frontend" / "dist")))
HOSTED_BODY_TIMEOUT_SECONDS = 15


@asynccontextmanager
async def lifespan(application):
    if os.getenv("FINSIGHT_DEPLOYMENT_MODE") != "hosted":
        yield
        return
    from src.hosted_api import load_hosted_runtime, run_retention

    runtime = await run_in_threadpool(load_hosted_runtime)
    application.state.hosted = runtime
    stop_retention = asyncio.Event()
    retention_task = asyncio.create_task(run_retention(runtime.store, stop_retention))
    try:
        yield
    finally:
        del application.state.hosted
        stop_retention.set()
        try:
            await retention_task
        finally:
            await run_in_threadpool(runtime.store.engine.dispose)


app = FastAPI(
    title="FinSight API",
    description="Recurring payment intelligence using synthetic transaction data.",
    version="1.2.0",
    lifespan=lifespan,
)

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
env_origins = os.getenv("CORS_ALLOWED_ORIGINS")
ALLOWED_ORIGINS = (
    [orig.strip() for orig in env_origins.split(",") if orig.strip()]
    if env_origins
    else DEFAULT_ALLOWED_ORIGINS
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)


@app.middleware("http")
async def security_and_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path

    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Vite's production asset names include a content hash, so they are safe to
    # cache for a year. HTML stays revalidatable so a deploy picks up new hashes.
    if path == "/api" or path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith("/assets/") and response.status_code < 400:
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache"

    return response


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
    return enrich_transactions(read_csv(TRANSACTIONS_FILE), load_predictions())


def enrich_transactions(rows, predictions) -> list[dict]:
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
            "detector_evidence": prediction.get("detector_evidence", prediction.get("evidence", "")),
        })

    return result


def load_commitments() -> list[dict]:
    return build_commitments(load_transactions(), read_csv(candidates_file()))


def amount_label(amount, currency):
    return f"{amount:.2f} statement units" if currency == "unspecified" else f"{currency} {amount:.2f}"


def build_commitments(transactions, candidate_rows, currency="INR") -> list[dict]:

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
        commitment_id = row.get("commitment_id") or make_commitment_id(cand_id, description, cadence)

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
                f"Median observed debit amount: {amount_label(median(amount_values), currency)}."
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
            "billing_anchor_day": as_int(row.get("billing_anchor_day")),
            "billing_anchor_date": row.get("billing_anchor_date") or None,
            "amount_pattern": row.get("amount_pattern") or None,
            "typical_amount": median(amount_values) if amount_values else None,
            "estimated_annual_cost": annual_cost,
            "currency": currency,
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
    return build_summary(transactions, load_commitments())


@app.get("/api/ready")
def readiness(request: Request):
    assets = (TRANSACTIONS_FILE, CANDIDATES_V3_FILE, PREDICTIONS_FILE, FRONTEND_DIST / "index.html")
    if not all(path.is_file() for path in assets):
        raise HTTPException(status_code=503, detail="FinSight demo assets are unavailable.")
    if os.getenv("FINSIGHT_DEPLOYMENT_MODE") == "hosted":
        runtime = getattr(request.app.state, "hosted", None)
        if runtime is None or not runtime.database_ready():
            raise HTTPException(status_code=503, detail="Hosted storage is unavailable.")
    return {"status": "ready"}


def build_summary(transactions, commitments, mode="synthetic", currency="INR"):
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
        "currency": currency,
        "data_mode": mode,
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
def commitment_detail(
    commitment_id: str = FastApiPath(..., min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
):
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
def cancellation_guide_endpoint(
    payment_method: str = FastApiPath(..., min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_\-\s%]+$"),
    merchant: Optional[str] = Query(default=None, max_length=100)
):
    """Return regulatory-backed cancellation guide for specific payment method."""
    return get_cancellation_guidance(payment_method, merchant or "Merchant")


@app.get("/api/alerts")
def alerts_endpoint():
    return build_alerts(load_transactions(), load_commitments())


def build_alerts(transactions, commitments, currency="INR"):
    """
    Conservative review suggestions based on observed transaction evidence.
    They do not prove a subscription is active or cancelled.
    """
    alerts = review_signals(transactions, commitments, lambda amount: amount_label(amount, currency))

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
                f"Observed transaction amount: {amount_label(abs(tx['amount']), currency)}.",
                f"Transaction date: {tx['date']}.",
            ],
            "recommended_action": (
                "Compare this transaction with the surrounding history "
                "and verify the charge with the provider if needed."
            ),
            "confirmed": False,
        })

    for item in commitments:
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


def analyze_statement(payload):
    if not isinstance(payload, dict):
        raise ValueError("Choose a UTF-8 CSV statement.")
    columns, rows = parse_statement(payload.get("csv"))
    if "mapping" not in payload:
        return {
            "columns": columns, "row_count": len(rows),
            "sample": [[value[:160] for value in row] for _, row in rows[:5]],
        }
    currency = payload.get("currency", "INR")
    if currency not in ("INR", "GBP", "USD", "EUR", "unspecified"):
        raise ValueError("Choose a supported statement currency or leave it unspecified.")
    raw = map_statement(columns, rows, payload["mapping"], currency)
    duplicate_rows = 0
    excluded_rows = 0
    if "overlap_csv" in payload:
        if payload.get("overlap_confirmed") is not True:
            raise ValueError("Confirm both exports cover complete days from the same account.")
        prior_columns, prior_rows = parse_statement(payload["overlap_csv"])
        existing = map_statement(prior_columns, prior_rows, NORMALIZED_MAPPING, currency)
        additions, review = plan_statement_overlap(existing, raw)
        if payload.get("overlap_preview") is True:
            return {"overlap_review": review}
        excluded = payload.get("overlap_excluded", [])
        raw, duplicate_rows = apply_statement_overlap(existing, additions, review, excluded)
        excluded_rows = len(excluded)
    alias_pairs = payload.get("aliases", [])
    if not isinstance(alias_pairs, list) or len(alias_pairs) > 100:
        raise ValueError("Use at most 100 merchant links.")
    descriptors = {tx["description"].upper(): tx["description"] for tx in raw if tx["direction"] == "debit"}
    aliases = {}
    for pair in alias_pairs:
        if not isinstance(pair, list) or len(pair) != 2 or not all(isinstance(item, str) for item in pair):
            raise ValueError("Each merchant link must identify two statement descriptors.")
        source, target = (item.strip().upper() for item in pair)
        if source == target or source in aliases or source not in descriptors or target not in descriptors:
            raise ValueError("Link two distinct debit descriptors from the current statement.")
        aliases[source] = target
    if aliases.keys() & set(aliases.values()):
        raise ValueError("Link each variant directly to the descriptor you want to keep.")
    dismissals = validate_dismissals(payload.get("merchant_dismissals", []), descriptors)
    try:
        analysis_id = str(UUID(payload["analysis_id"])) if "analysis_id" in payload else str(uuid4())
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Invalid statement session identifier.") from None
    candidates, predictions = detect(
        [tx for tx in raw if tx["direction"] == "debit"], aliases, namespace=f"private-{analysis_id}", currency=currency
    )
    for candidate in candidates:
        target = aliases.get(candidate["description"].upper())
        if target:
            candidate["description"] = descriptors[target]
    transactions = enrich_transactions(raw, predictions)
    refunds = reconcile_refunds(raw, aliases)
    for transaction in transactions:
        transaction.update(refunds.get(transaction["transaction_id"], {}))
    commitments = build_commitments(transactions, candidates, currency)
    return {
        "transactions": transactions,
        "commitments": commitments,
        "summary": build_summary(transactions, commitments, "private", currency),
        "alerts": build_alerts(transactions, commitments, currency)["items"],
        "analysis_id": analysis_id,
        "merchant_links": alias_pairs,
        "merchant_dismissals": dismissals,
        "merchant_suggestions": merchant_suggestions(descriptors, aliases, dismissals, load_aliases()),
        "duplicate_rows": duplicate_rows,
        "overlap_excluded_rows": excluded_rows,
    }


@app.post("/api/private-statement")
async def private_statement(request: Request):
    if os.getenv("FINSIGHT_DEPLOYMENT_MODE", "local") != "local":
        raise HTTPException(status_code=404, detail="Private import is available in local mode.")
    host = request.url.hostname
    origin = request.headers.get("origin")
    same_origin = f"{request.url.scheme}://{request.url.netloc}"
    if host not in {"localhost", "127.0.0.1", "::1"} or origin not in {same_origin, *DEFAULT_ALLOWED_ORIGINS}:
        raise HTTPException(status_code=403, detail="Private analysis is available from local FinSight only.")
    payload = await read_statement_request(request)
    try:
        return await run_in_threadpool(analyze_statement, payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


async def read_statement_request(request):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(status_code=415, detail="Expected a JSON statement request.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="The statement exceeds the import limit.")
        body.extend(chunk)
    try:
        return json.loads(body)
    except (ValueError, RecursionError):
        raise HTTPException(status_code=422, detail="Invalid statement request.") from None


def local_account_overview(path, accounts):
    if not isinstance(accounts, list) or not 1 <= len(accounts) <= 8:
        raise ValueError("Choose between 1 and 8 saved accounts.")
    keys = dict.fromkeys(account_label(label).casefold() for label in accounts)
    saved = load_statements(path, keys)
    if len(saved) != len(keys):
        raise HTTPException(status_code=404, detail="A selected account is no longer saved. Refresh the account list.")
    items = []
    totals = {}
    fields = ("transaction_count", "detected_pattern_count", "annual_estimate_count", "estimated_annual_cost")
    for key in keys:
        label, statement = saved[key]
        summary = analyze_statement(statement)["summary"]
        items.append({"account": label, "summary": summary})
        currency = summary["currency"]
        if currency == "unspecified":
            continue
        total = totals.setdefault(currency, {"currency": currency, **dict.fromkeys(fields, 0)})
        for field in fields:
            total[field] += summary[field]
    for total in totals.values():
        total["estimated_annual_cost"] = round(total["estimated_annual_cost"], 2)
    return {"accounts": items, "totals": list(totals.values())}


def local_statement_action(path, payload):
    if not isinstance(payload, dict):
        raise ValueError("Choose a saved statement action.")
    action = payload.get("action")
    if action == "list":
        return {"accounts": list_accounts(path)}
    if action == "overview":
        return local_account_overview(path, payload.get("accounts"))
    account = account_label(payload.get("account", DEFAULT_ACCOUNT))
    if action == "load":
        saved = load_statement(path, account)
        if saved is None:
            raise HTTPException(status_code=404, detail="No statement has been saved.")
        label, statement = saved
        return {**analyze_statement(statement), "local_account": label}
    if action == "delete":
        delete_statement(path, account)
        return {"deleted": True, "accounts": list_accounts(path)}
    if action != "save":
        raise ValueError("Choose a saved statement action.")
    statement = payload.get("statement")
    if not isinstance(statement, dict) or "mapping" not in statement:
        raise ValueError("Analyze a mapped statement before saving.")
    result = analyze_statement(statement)
    label = save_statement(path, account, statement_snapshot(result))
    return {**result, "local_account": label}


def statement_snapshot(result):
    output = StringIO(newline="")
    fields = list(NORMALIZED_MAPPING)
    writer = csv.writer(output)
    writer.writerow(fields)
    writer.writerows([row[field] for field in fields] for row in result["transactions"])
    return {
        "csv": output.getvalue(),
        "mapping": NORMALIZED_MAPPING,
        "currency": result["summary"]["currency"],
        "aliases": result["merchant_links"],
        "merchant_dismissals": result["merchant_dismissals"],
        "analysis_id": result["analysis_id"],
    }


@app.post("/api/local-statement")
async def local_statement(request: Request):
    if os.getenv("FINSIGHT_DEPLOYMENT_MODE", "local") != "local":
        raise HTTPException(status_code=404, detail="Saved statements are available in local mode.")
    loopback = {"localhost", "127.0.0.1", "::1"}
    same_origin = f"{request.url.scheme}://{request.url.netloc}"
    if (
        request.url.hostname not in loopback
        or not request.client or request.client.host not in loopback
        or request.headers.get("origin") != same_origin
    ):
        raise HTTPException(status_code=403, detail="Use the same-origin local FastAPI app for saved statements.")
    configured = os.getenv("FINSIGHT_LOCAL_DB")
    path = Path(configured).expanduser() if configured else None
    if not path or not path.is_absolute() or path.resolve().is_relative_to(ROOT):
        raise HTTPException(status_code=503, detail="Set FINSIGHT_LOCAL_DB to an absolute database path outside the project.")
    payload = await read_statement_request(request)
    try:
        return await run_in_threadpool(local_statement_action, path.resolve(), payload)
    except SavedStatementConflict:
        raise HTTPException(status_code=409, detail="This account has a different saved statement, or this analysis belongs to another account.") from None
    except (OSError, sqlite3.Error):
        raise HTTPException(status_code=503, detail="The local statement database is unavailable.") from None
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


def hosted_runtime(request):
    if os.getenv("FINSIGHT_DEPLOYMENT_MODE") != "hosted":
        raise HTTPException(status_code=404, detail="Hosted statements are available in hosted mode.")
    runtime = getattr(request.app.state, "hosted", None)
    if runtime is None:
        raise HTTPException(status_code=503, detail="Hosted storage is unavailable.")
    return runtime


@app.post("/api/hosted-session")
async def create_hosted_session(request: Request):
    return await hosted_runtime(request).exchange(request)


@app.delete("/api/hosted-session", status_code=204)
async def revoke_hosted_session(request: Request):
    runtime = hosted_runtime(request)
    await runtime.session_call(runtime.store.revoke_session, runtime.bearer_digest(request))
    return Response(status_code=204)


@app.post("/api/hosted-statement")
async def hosted_statement(request: Request):
    runtime = hosted_runtime(request)
    owner = await runtime.authenticate(request)
    with runtime.admit(owner):
        try:
            async with asyncio.timeout(HOSTED_BODY_TIMEOUT_SECONDS):
                payload = await read_statement_request(request)
        except TimeoutError:
            raise HTTPException(status_code=408, detail="Timed out receiving the hosted request.") from None
        return await run_in_threadpool(runtime.statement_action, owner, payload, analyze_statement, statement_snapshot)


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


# The app uses in-page navigation. StaticFiles serves the index at the root and
# constrains all other file lookups to this directory, including symlink targets.
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
