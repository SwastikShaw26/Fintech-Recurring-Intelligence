import os
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Shared client fixture — disable Neo4j so the app starts immediately
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    os.environ.setdefault("NEO4J_URI", "")  # prevent Neo4j connection attempt
    from src.api import app
    return TestClient(app)


# ---------------------------------------------------------------------------
# Test 1 — Malformed CSV returns 400 not 500
# ---------------------------------------------------------------------------
def test_malformed_csv_returns_400(client):
    bad_csv = b"\xff\xfe this is not valid utf8 \x00\x01\x02"
    response = client.post(
        "/api/private-statement",
        files={"file": ("bad.csv", bad_csv, "text/csv")},
    )
    assert response.status_code == 400, (
        f"Expected 400 for malformed CSV, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 2 — Empty CSV returns 400 not 500
# ---------------------------------------------------------------------------
def test_empty_csv_returns_400(client):
    response = client.post(
        "/api/private-statement",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert response.status_code in (400, 422), (
        f"Expected 400/422 for empty CSV, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 3 — Missing analysis_id on evidence endpoint returns 400 not 500
# ---------------------------------------------------------------------------
def test_missing_analysis_id_evidence_returns_400(client):
    response = client.get("/api/graph/commitment/some-commitment/evidence")
    assert response.status_code == 400, (
        f"Expected 400 for missing analysis_id, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 4 — Missing analysis_id on classified endpoint returns 400 not 500
# ---------------------------------------------------------------------------
def test_missing_analysis_id_classified_returns_400(client):
    response = client.get("/api/graph/commitments/classified")
    assert response.status_code == 400, (
        f"Expected 400 for missing analysis_id, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 5 — Missing analysis_id on business summary returns 400 not 500
# ---------------------------------------------------------------------------
def test_missing_analysis_id_summary_returns_400(client):
    response = client.get("/api/summary/business")
    assert response.status_code == 400, (
        f"Expected 400 for missing analysis_id, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 6 — Invalid expense_category on classify returns 422 not 500
# ---------------------------------------------------------------------------
def test_invalid_expense_category_returns_422(client):
    response = client.post(
        "/api/graph/commitment/some-commitment/classify",
        params={"analysis_id": "test_analysis"},
        json={"expense_category": "INVALID_VALUE"},
    )
    assert response.status_code == 422, (
        f"Expected 422 for invalid expense_category, got {response.status_code}"
    )


# ---------------------------------------------------------------------------
# Test 7 — Neo4j credentials are not hardcoded in source
# ---------------------------------------------------------------------------
def test_neo4j_credentials_not_hardcoded():
    import ast
    import pathlib

    hardcoded_patterns = ["bolt://", "neo4j+s://", "neo4j://"]
    src_dir = pathlib.Path("src")

    for py_file in src_dir.glob("*.py"):
        source = py_file.read_text(encoding="utf-8")
        for pattern in hardcoded_patterns:
            # Allow only if the pattern appears inside an os.environ / getenv call
            # or is used as a comparison/replacement operand (not an actual URI value)
            if pattern in source:
                lines = [
                    line for line in source.splitlines()
                    if pattern in line
                    and "environ" not in line
                    and "getenv" not in line
                    and "dotenv" not in line
                    and ".env" not in line
                    and ".replace(" not in line
                    and ".startswith(" not in line
                ]
                assert not lines, (
                    f"Possible hardcoded Neo4j URI in {py_file}: {lines}"
                )