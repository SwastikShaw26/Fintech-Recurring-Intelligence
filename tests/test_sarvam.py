import json
from io import BytesIO
from contextlib import asynccontextmanager

from fastapi.testclient import TestClient

from src import sarvam_app, sarvam_service


def test_wrapper_runs_lifespan_on_mounted_application(monkeypatch):
    events = []

    @asynccontextmanager
    async def lifespan(app):
        assert app is sarvam_app.finsight_app
        events.append("startup")
        yield
        events.append("shutdown")

    monkeypatch.setattr(sarvam_app.finsight_app.router, "lifespan_context", lifespan)
    with TestClient(sarvam_app.app) as client:
        assert events == ["startup"]
        assert client.get("/api/health").status_code == 200
    assert events == ["startup", "shutdown"]


def test_hindi_forecast_sends_only_aggregate_evidence(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "test-key")
    requests = []

    def complete(request, *, timeout):
        requests.append(json.loads(request.data))
        return BytesIO(json.dumps({
            "choices": [{"message": {"content": "यह एक अनुमान है।"}}],
        }).encode())

    monkeypatch.setattr(sarvam_service, "urlopen", complete)
    with TestClient(sarvam_app.app) as client:
        evidence = {"language": "hi", "evidence_type": "forecast", "count": 2, "days": 7}
        assert client.post("/api/assistant/explain", json=evidence).status_code == 403
        assert requests == []
        response = client.post("/api/assistant/explain", json={
            **evidence, "consent": True, "description": "Private merchant reference",
        })
    assert response.json() == {"explanation": "यह एक अनुमान है।", "language": "hi", "source": "sarvam"}
    [request] = requests
    assert request["model"] in {"sarvam-105b", "sarvam-105b-conversations"}
    assert "Respond in Hindi" in request["messages"][0]["content"]
    assert request["messages"][1]["content"] == (
        "FinSight estimates 2 recurring debits over the next 7 days. "
        "These are projections based on observed patterns, not confirmed future charges."
    )
