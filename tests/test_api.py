
from fastapi.testclient import TestClient

from src.api import app

client = TestClient(app)


def test_demo_deployment_disables_local_import_and_checks_readiness(monkeypatch, tmp_path):
    from src import api

    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "demo")
    local = TestClient(api.app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 45678))
    headers = {"Origin": "http://127.0.0.1:8000"}
    for endpoint in ("/api/private-statement", "/api/local-statement"):
        assert local.post(endpoint, headers=headers, json={"action": "list"}).status_code == 404

    for name in ("TRANSACTIONS_FILE", "CANDIDATES_V3_FILE", "PREDICTIONS_FILE"):
        path = tmp_path / name
        path.touch()
        monkeypatch.setattr(api, name, path)
    monkeypatch.setattr(api, "FRONTEND_DIST", tmp_path)
    assert local.get("/api/ready").status_code == 503
    (tmp_path / "index.html").touch()
    ready = local.get("/api/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ready"}
    assert ready.headers["cache-control"] == "no-store"


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_summary():
    response = client.get("/api/summary")
    assert response.status_code == 200

    body = response.json()
    assert body["data_mode"] == "synthetic"
    assert body["transaction_count"] > 0
    assert body["debit_transaction_count"] > 0
    assert body["detected_pattern_count"] >= 0


def test_transactions():
    response = client.get("/api/transactions?limit=5")
    assert response.status_code == 200

    body = response.json()
    assert len(body["items"]) <= 5
    assert body["total"] >= len(body["items"])


def test_transaction_search():
    response = client.get("/api/transactions?search=STREAMBEE")
    assert response.status_code == 200

    for item in response.json()["items"]:
        assert "STREAMBEE" in item["description"].upper()


def test_commitments():
    response = client.get("/api/commitments")
    assert response.status_code == 200

    body = response.json()
    assert "items" in body
    assert "total" in body

    for item in body["items"]:
        assert "commitment_id" in item
        assert "cadence" in item
        assert "evidence" in item
        assert "cancellation_guidance" in item


def test_commitment_detail():
    list_res = client.get("/api/commitments?limit=1")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) > 0

    cid = items[0]["commitment_id"]
    detail_res = client.get(f"/api/commitments/{cid}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["commitment_id"] == cid
    assert "cancellation_guidance" in detail
    assert "transactions" in detail


def test_unknown_commitment_returns_404():
    response = client.get("/api/commitments/not-a-real-commitment")
    assert response.status_code == 404


def test_alerts():
    response = client.get("/api/alerts")
    assert response.status_code == 200
    assert "items" in response.json()


def test_cancellation_guide():
    response = client.get("/api/cancellation-guide/upi%20autopay?merchant=StreamBee")
    assert response.status_code == 200
    data = response.json()
    assert data["mechanism"] == "UPI AutoPay"
    assert "NPCI" in data["regulatory_framework"]
    assert len(data["steps"]) > 0


def test_evaluation_endpoint():
    response = client.get("/api/evaluation")
    assert response.status_code == 200
    data = response.json()
    assert data["precision"] == 1.0
    assert data["recall"] == 1.0
    assert data["f1_score"] == 1.0
    assert data["accuracy"] == 1.0
    assert len(data["errors"]) == 0


def test_spa_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "html" in response.headers.get("content-type", "")


def test_security_headers():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_cors_origin_restriction():
    # Allowed origin gets CORS header
    res_allowed = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert res_allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    # Disallowed origin does NOT get access-control-allow-origin
    res_blocked = client.get("/api/health", headers={"Origin": "http://malicious-site.com"})
    assert res_blocked.headers.get("access-control-allow-origin") is None


def test_input_validation_rejection():
    # Invalid direction
    res_dir = client.get("/api/transactions?direction=invalid_direction")
    assert res_dir.status_code == 422

    # Malformed commitment ID pattern
    res_cid = client.get("/api/commitments/c_test<script>")
    assert res_cid.status_code == 422


def test_transaction_responses_are_not_cached():
    response = client.get("/api/transactions")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"


def test_unknown_public_file_returns_not_found():
    response = client.get("/missing-demo-file.svg")
    assert response.status_code == 404

def test_spa_root_references_a_served_javascript_bundle():
    import re

    response = client.get("/")
    match = re.search(r'<script[^>]+src="(/assets/[^"]+\.js)"', response.text)
    assert match
    asset = client.get(match[1])
    assert asset.status_code == 200
    assert "javascript" in asset.headers["content-type"]

def test_commitment_ids_survive_group_reordering_and_separate_price_tiers(tmp_path, monkeypatch):
    from src import detect_recurring_v3 as detector
    from src.benchmark_holdout import read_csv

    input_file = tmp_path / "transactions.csv"
    output = tmp_path / "candidates.csv"
    monkeypatch.setattr(detector, "INPUT_FILE", input_file)
    monkeypatch.setattr(detector, "CANDIDATES_FILE", output)
    monkeypatch.setattr(detector, "PREDICTIONS_FILE", tmp_path / "predictions.csv")
    header = "transaction_id,date,description,amount,payment_method,direction\n"
    rows = [
        f"{merchant}-{amount}-{month},2025-{month:02}-05,{merchant},{amount},card,debit\n"
        for merchant, amount in [("QUILL", 100), ("QUILL", 200), ("MOSS", 75)]
        for month in range(1, 5)
    ]

    def run(records):
        input_file.write_text(header + "".join(records), encoding="utf-8")
        detector.main()
        return {(row["description"], row["median_amount"]): row["commitment_id"] for row in read_csv(output)}

    first = run(rows)
    assert len(first) == len(set(first.values())) == 3
    assert first == run(reversed(rows))

def test_private_statement_preview_analysis_and_isolation():
    endpoint = "http://localhost/api/private-statement"
    origin = {"Origin": "http://localhost"}
    statement = "Day,Payee,Value\n2025-01-05,Private Example,-42\n2025-02-05,Private Example,-42\n2025-03-05,Private Example,-42\n"
    preview = client.post(endpoint, headers=origin, json={"csv": statement})
    assert preview.status_code == 200
    assert preview.json()["columns"] == ["Day", "Payee", "Value"]
    assert preview.headers["cache-control"] == "no-store"
    response = client.post(endpoint, headers=origin, json={
        "csv": statement, "mapping": {"date": 0, "description": 1, "amount": 2},
    })
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["data_mode"] == "private"
    assert len(data["transactions"]) == 3
    assert len(data["commitments"]) == 1
    assert data["commitments"][0]["display_name"] == "Private Example"
    assert "Private Example" not in client.get("/api/transactions").text


def test_private_statement_rejects_cross_origin_and_invalid_records():
    endpoint = "http://localhost/api/private-statement"
    body = {"csv": "Day,Payee,Value\n2025-02-31,Private Example,-42\n",
            "mapping": {"date": 0, "description": 1, "amount": 2}}
    response = client.post(endpoint, headers={"Origin": "https://other.invalid"}, json=body)
    assert response.status_code == 403
    response = client.post(endpoint, headers={"Origin": "http://localhost"}, json=body)
    assert response.status_code == 422
    assert "Private Example" not in response.text

def test_private_merchant_review_links_and_unlinks_descriptors():
    endpoint = "http://localhost/api/private-statement"
    origin = {"Origin": "http://localhost"}
    statement = (
        "Date,Description,Amount\n"
        "2025-01-05,Paper Desk,-42\n2025-02-05,Paper Desk,-42\n"
        "2025-03-05,Paper Desk Online,-42\n2025-04-05,Paper Desk Online,-42\n"
    )
    body = {"csv": statement, "mapping": {"date": 0, "description": 1, "amount": 2}}
    initial = client.post(endpoint, headers=origin, json=body).json()
    assert initial["commitments"] == []
    body["analysis_id"] = initial["analysis_id"]
    body["aliases"] = [["Paper Desk Online", "Paper Desk"]]
    linked = client.post(endpoint, headers=origin, json=body).json()
    assert linked["analysis_id"] == initial["analysis_id"]
    assert linked["commitments"][0]["display_name"] == "Paper Desk"
    assert linked["commitments"][0]["transaction_count"] == 4
    assert {row["description"] for row in linked["transactions"]} == {"Paper Desk", "Paper Desk Online"}
    body["aliases"] = []
    assert client.post(endpoint, headers=origin, json=body).json()["commitments"] == []
    body["aliases"] = [["Unknown merchant", "Paper Desk"]]
    assert client.post(endpoint, headers=origin, json=body).status_code == 422

def test_private_split_amounts_keep_source_units():
    endpoint = "http://localhost/api/private-statement"
    headers = {"Origin": "http://localhost"}
    body = {
        "csv": "Date,Merchant,Debit,Credit\n2025-01-05,Example,25.50,\n2025-02-05,Example,25.50,0\n2025-03-05,Example,25.50,\n2025-03-06,Refund,,25.50\n",
        "mapping": {"date": 0, "description": 1, "debit_amount": 2, "credit_amount": 3},
        "currency": "unspecified",
    }
    response = client.post(endpoint, headers=headers, json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["summary"]["currency"] == "unspecified"
    assert result["summary"]["debit_transaction_count"] == 3
    assert result["transactions"][-1]["direction"] == "credit"
    assert result["commitments"][0]["currency"] == "unspecified"
    assert "INR" not in response.text
    body["csv"] = "Date,Merchant,Debit,Credit\n2025-01-05,Example,10,20\n"
    assert client.post(endpoint, headers=headers, json=body).status_code == 422

def test_overlap_preserves_multiplicity_and_refund_credits():
    from src.private_statement import merge_statement_rows

    debit = {"date": "2026-01-01", "description": "Example", "amount": 50, "direction": "debit", "payment_method": ""}
    credit = {**debit, "direction": "credit"}
    merged, duplicates = merge_statement_rows([debit, debit], [debit, debit, debit, credit])
    assert duplicates == 2
    assert [row["direction"] for row in merged] == ["debit", "debit", "debit", "credit"]
    assert len({row["transaction_id"] for row in merged}) == 4

def test_private_statement_overlap_requires_confirmation_and_reanalyzes():
    endpoint = "http://localhost/api/private-statement"
    headers = {"Origin": "http://localhost"}
    body = {
        "csv": "Date,Merchant,Amount\n2025-02-05,Example,-42\n2025-03-05,Example,-42\n",
        "mapping": {"date": 0, "description": 1, "amount": 2},
        "overlap_csv": "date,description,amount,direction,payment_method\n2025-01-05,Example,42,debit,\n2025-02-05,Example,42,debit,\n",
    }
    assert client.post(endpoint, headers=headers, json=body).status_code == 422
    body["overlap_confirmed"] = True
    response = client.post(endpoint, headers=headers, json=body)
    assert response.status_code == 200
    data = response.json()
    assert data["duplicate_rows"] == 1
    assert data["summary"]["transaction_count"] == 3
    assert data["commitments"][0]["transaction_count"] == 3


def test_card_guidance_references_current_rbi_framework():
    guide = client.get("/api/cancellation-guide/card").json()
    assert "RBI/DPSS/2026-27/396" in guide["regulatory_framework"]
    assert "2024-25/64" not in str(guide)

def test_private_refund_reconciles_unique_credit_and_keeps_ambiguous_credit():
    from src.api import analyze_statement

    result = analyze_statement({
        "csv": (
            "Date,Description,Amount\n2025-01-02,Paper Desk,-50\n"
            "2025-01-03,Paper Desk Refund,50\n2025-02-02,Paper Desk,-50\n"
            "2025-02-02,Paper Desk,-50\n2025-02-03,Refund Paper Desk,50\n"
            "2025-02-04,Paper Desk,50\n"
        ),
        "mapping": {"date": 0, "description": 1, "amount": 2},
    })
    rows = result["transactions"]
    assert len(rows) == 6
    assert rows[0]["refund_status"] == "matched_debit"
    assert rows[1]["refund_status"] == "matched_credit"
    assert rows[1]["refund_transaction_id"] == rows[0]["transaction_id"]
    assert rows[4]["refund_status"] == "review"
    assert "refund_status" not in rows[5]

def test_opt_in_local_store_roundtrip_and_delete(tmp_path, monkeypatch):
    local = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000))
    endpoint = "/api/local-statement"
    headers = {"Origin": "http://localhost"}
    monkeypatch.delenv("FINSIGHT_LOCAL_DB", raising=False)
    assert local.post(endpoint, headers=headers, json={"action": "load"}).status_code == 503
    database = tmp_path / "local.sqlite3"
    monkeypatch.setenv("FINSIGHT_LOCAL_DB", str(database))
    assert local.post(endpoint, headers=headers, json={"action": "load"}).status_code == 404
    assert not database.exists()
    payload = {
        "csv": "date,description,amount,direction,payment_method\n2025-01-05,Test row,42,debit,card\n",
        "mapping": {"date": 0, "description": 1, "amount": 2, "direction": 3, "payment_method": 4},
    }
    assert local.post(endpoint, headers={"Origin": "http://127.0.0.1:5173"},
                      json={"action": "save", "statement": payload}).status_code == 403
    saved = local.post(endpoint, headers=headers, json={"action": "save", "statement": payload})
    assert saved.status_code == 200
    assert database.exists()
    loaded = local.post(endpoint, headers=headers, json={"action": "load"})
    assert loaded.json()["analysis_id"] == saved.json()["analysis_id"]
    assert loaded.json()["transactions"][0]["description"] == "Test row"
    assert local.post(endpoint, headers=headers, json={"action": "save", "statement": payload}).status_code == 409
    assert local.post(endpoint, headers=headers, json={"action": "delete"}).status_code == 200
    assert local.post(endpoint, headers=headers, json={"action": "load"}).status_code == 404

def test_private_merchant_suggestions_require_confirmation_and_support_dismissal():
    from src.api import analyze_statement

    payload = {
        "csv": (
            "Date,Description,Amount\n2025-01-05,Paper Desk,-42\n"
            "2025-02-05,Paper Desk,-42\n2025-03-05,Paper-Desk,-42\n"
            "2025-04-05,Paper-Desk,-42\n2025-04-06,Paper Desk 2,-42\n"
        ),
        "mapping": {"date": 0, "description": 1, "amount": 2},
    }
    initial = analyze_statement(payload)
    assert initial["commitments"] == []
    suggestion, = initial["merchant_suggestions"]
    pair = [suggestion["source"], suggestion["target"]]
    assert set(pair) == {"Paper Desk", "Paper-Desk"}
    assert suggestion["reason"] == "Same letters and digits after ignoring punctuation and spacing"
    dismissed = analyze_statement({**payload, "merchant_dismissals": [pair]})
    assert dismissed["merchant_suggestions"] == []
    assert dismissed["merchant_dismissals"] == [pair]
    approved = analyze_statement({**payload, "aliases": [pair]})
    assert approved["commitments"][0]["transaction_count"] == 4
    assert approved["merchant_suggestions"] == []

def test_merchant_suggestion_evidence_for_known_alias_and_close_spelling():
    from src.merchant_review import merchant_suggestions

    keys = ["FOREST LETTERS", "WOODLAND POST", "NORTHSTAR MEDIA", "NORTHSTAR MEDA", "NORTHSTAR MEDIA 2"]
    aliases = {"FOREST LETTERS": "POST GROUP", "WOODLAND POST": "POST GROUP"}
    suggestions = merchant_suggestions(dict(zip(keys, keys)), {}, [], aliases)
    assert len(suggestions) == 2
    assert suggestions[0]["reason"].startswith("Both descriptions")
    assert suggestions[1]["reason"].startswith("Similar spelling")
    assert 0.9 <= suggestions[1]["similarity"] < 1


def test_frozen_merchant_holdout_reports_all_debits():
    from src.evaluate_merchant_holdout import evaluate_holdout

    result = evaluate_holdout()
    assert result["fixture_sha256"] == "449236253d40e2ce464155f8be5e394dc1287d213452ebbb9c84c410eb6180a4"
    assert sum(result["counts"].values()) == result["debit_metrics"]["sample_count"] == 51
    assert result["cadence"]["expected"] == result["counts"]["tp"] + result["counts"]["fn"]

def test_statement_review_links_duplicate_shift_and_gap_to_evidence():
    from src.api import analyze_statement

    data = analyze_statement({
        "csv": (
            "Date,Description,Amount\n2025-01-05,Paper Desk,-100\n"
            "2025-02-05,Paper Desk,-100\n2025-04-05,Paper Desk,-120\n"
            "2025-05-05,Paper Desk,-120\n2025-03-01,Shop,-40\n"
            "2025-03-01,Shop,-40\n2025-03-01,Shop,40\n"
        ),
        "mapping": {"date": 0, "description": 1, "amount": 2},
    })
    alerts = {item["alert_type"]: item for item in data["alerts"]}
    assert len(alerts["possible_duplicate"]["transaction_ids"]) == 2
    assert len(alerts["sustained_amount_change"]["transaction_ids"]) == 4
    assert len(alerts["charge_after_gap"]["transaction_ids"]) == 3
    assert all(alert["confirmed"] is False for alert in alerts.values())
    assert len(data["transactions"]) == 7

def test_local_accounts_scope_saved_statements_and_migrate_legacy(tmp_path):
    import json
    import sqlite3
    from contextlib import closing
    from src.api import local_statement_action

    path = tmp_path / "accounts.sqlite3"

    def statement(name):
        return {
            "csv": f"date,description,amount,direction,payment_method\n2025-01-05,{name},42,debit,card\n",
            "mapping": {"date": 0, "description": 1, "amount": 2, "direction": 3, "payment_method": 4},
        }

    legacy = {**statement("Legacy"), "analysis_id": "00000000-0000-0000-0000-000000000001"}
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute("CREATE TABLE workspace (id INTEGER PRIMARY KEY, analysis_id TEXT, payload TEXT)")
        connection.execute("INSERT INTO workspace VALUES (1, ?, ?)", (legacy["analysis_id"], json.dumps(legacy)))

    assert local_statement_action(path, {"action": "load"})["transactions"][0]["description"] == "Legacy"
    for name in ("Everyday", "Business"):
        local_statement_action(path, {"action": "save", "account": name, "statement": statement(name)})
    assert local_statement_action(path, {"action": "list"})["accounts"] == ["Business", "Default workspace", "Everyday"]
    assert local_statement_action(path, {"action": "load", "account": "everyday"})["transactions"][0]["description"] == "Everyday"
    assert local_statement_action(path, {"action": "load", "account": "Business"})["transactions"][0]["description"] == "Business"
    local_statement_action(path, {"action": "delete", "account": "Everyday"})
    assert local_statement_action(path, {"action": "list"})["accounts"] == ["Business", "Default workspace"]


def test_combined_local_overview_keeps_detection_and_currency_separate(tmp_path):
    import pytest
    from fastapi import HTTPException
    from src.api import local_statement_action

    path = tmp_path / "accounts.sqlite3"
    for name, currency, dates in (
        ("First", "USD", ["2025-01-05", "2025-02-05"]),
        ("Second", "USD", ["2025-03-05", "2025-04-05"]),
        ("Third", "GBP", ["2025-01-05", "2025-02-05", "2025-03-05", "2025-04-05"]),
        ("Unknown", "unspecified", ["2025-01-05", "2025-02-05"]),
    ):
        local_statement_action(path, {"action": "save", "account": name, "statement": {
            "csv": "date,description,amount\n" + "".join(f"{date},Paper Desk,-42\n" for date in dates),
            "mapping": {"date": 0, "description": 1, "amount": 2},
            "currency": currency,
        }})

    overview = local_statement_action(path, {
        "action": "overview", "accounts": ["first", "Second", "Ｆｉｒｓｔ", "Third", "Unknown"],
    })
    assert [item["account"] for item in overview["accounts"]] == ["First", "Second", "Third", "Unknown"]
    assert all(set(item) == {"account", "summary"} for item in overview["accounts"])
    totals = {item["currency"]: item for item in overview["totals"]}
    assert totals["USD"]["transaction_count"] == 4
    assert totals["USD"]["detected_pattern_count"] == 0
    assert totals["GBP"]["detected_pattern_count"] == 1
    assert totals["GBP"]["estimated_annual_cost"] == 504
    assert "unspecified" not in totals
    with pytest.raises(HTTPException) as missing:
        local_statement_action(path, {"action": "overview", "accounts": ["First", "Missing"]})
    assert missing.value.status_code == 404
