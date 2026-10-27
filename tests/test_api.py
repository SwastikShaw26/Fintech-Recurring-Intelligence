
from fastapi.testclient import TestClient

from src.api import app

client = TestClient(app)


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
