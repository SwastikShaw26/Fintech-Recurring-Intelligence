import asyncio
from unittest.mock import patch

import httpx
import pytest


def get_endpoint_response(app, path, params):
    async def request():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://testserver",
        ) as client:
            return await client.get(path, params=params)

    return asyncio.run(request())


def test_is_available_returns_bool():
    from src.neo4j_service import is_available

    result = is_available()
    assert isinstance(result, bool)


def test_ingest_and_query_endpoint_roundtrip():
    import src.neo4j_service as svc
    from src.api import app

    analysis_id = "test_endpoint_roundtrip_001"
    commitment_id = "test_endpoint_commitment_001"
    transactions = [
        {
            "transaction_id": "endpoint_txn_1",
            "date": "2024-01-15",
            "description": "Test Merchant charge",
            "amount": 9.99,
            "direction": "debit",
        },
        {
            "transaction_id": "endpoint_txn_2",
            "date": "2024-02-15",
            "description": "Test Merchant charge",
            "amount": 9.99,
            "direction": "debit",
        },
    ]
    result = {
        "transactions": transactions,
        "commitments": [
            {
                "commitment_id": commitment_id,
                "merchant_id": "merchant_001",
                "merchant_display_name": "Test Merchant",
                "transaction_ids": [item["transaction_id"] for item in transactions],
            }
        ],
    }

    evidence_data = {
        "commitment_id": commitment_id,
        "merchant": {
            "merchant_id": "merchant_001",
            "display_name": "Test Merchant",
            "resolution_method": "graph",
        },
        "supporting_transactions": transactions,
        "descriptors": ["Test Merchant charge"],
        "graph_available": True,
        "error": None,
    }

    with patch.object(svc, "is_available", return_value=True), \
         patch.object(svc, "_driver") as mock_driver, \
         patch("src.graph_routes.get_commitment_evidence", return_value=evidence_data) as mock_evidence:
        
        svc.ingest_analysis(analysis_id, result)
        assert mock_driver.session.called

        response = get_endpoint_response(
            app,
            f"/api/graph/commitment/{commitment_id}/evidence",
            {"analysis_id": analysis_id},
        )

        assert response.status_code == 200
        evidence = response.json()
        assert evidence["graph_available"] is True
        assert evidence["commitment_id"] == commitment_id
        assert isinstance(evidence["supporting_transactions"], list)
        assert len(evidence["supporting_transactions"]) == 2
        mock_evidence.assert_called_once_with(analysis_id, commitment_id)


def test_idempotent_ingest_endpoint_response():
    import src.neo4j_service as svc
    from src.api import app

    analysis_id = "test_endpoint_idempotent_002"
    commitment_id = "test_endpoint_commitment_002"
    transaction_id = "endpoint_txn_a"
    result = {
        "transactions": [
            {
                "transaction_id": transaction_id,
                "date": "2024-03-01",
                "description": "Idempotent Merchant charge",
                "amount": 14.99,
                "direction": "debit",
            }
        ],
        "commitments": [
            {
                "commitment_id": commitment_id,
                "merchant_id": "merchant_002",
                "merchant_display_name": "Idempotent Merchant",
                "transaction_ids": [transaction_id],
            }
        ],
    }

    evidence_data = {
        "commitment_id": commitment_id,
        "merchant": {
            "merchant_id": "merchant_002",
            "display_name": "Idempotent Merchant",
            "resolution_method": "graph",
        },
        "supporting_transactions": result["transactions"],
        "descriptors": ["Idempotent Merchant charge"],
        "graph_available": True,
        "error": None,
    }

    with patch.object(svc, "is_available", return_value=True), \
         patch.object(svc, "_driver") as mock_driver, \
         patch("src.graph_routes.get_commitment_evidence", return_value=evidence_data):
        
        # Ingest twice (idempotent)
        svc.ingest_analysis(analysis_id, result)
        svc.ingest_analysis(analysis_id, result)
        assert mock_driver.session.return_value.__enter__.return_value.run.call_count == 2

        response = get_endpoint_response(
            app,
            f"/api/graph/commitment/{commitment_id}/evidence",
            {"analysis_id": analysis_id},
        )

        assert response.status_code == 200
        evidence = response.json()
        assert evidence["graph_available"] is True
        assert len(evidence["supporting_transactions"]) == 1


def test_unavailable_endpoint_returns_503():
    from src.api import app

    unavailable = {
        "commitment_id": "ghost_commitment",
        "graph_available": False,
        "error": "Neo4j unavailable",
    }
    with patch("src.graph_routes.get_commitment_evidence", return_value=unavailable):
        response = get_endpoint_response(
            app,
            "/api/graph/commitment/ghost_commitment/evidence",
            {"analysis_id": "ghost_analysis"},
        )

    assert response.status_code == 503
    assert response.json()["detail"]["error"] == "Neo4j unavailable"
