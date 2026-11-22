from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from .auth import verify_token
from .neo4j_service import get_commitment_evidence

router = APIRouter(prefix="/graph", tags=["graph"])

_classifications: dict[tuple[str, str], dict] = {}


class ClassifyRequest(BaseModel):
    expense_category: str


@router.get("/commitment/{commitment_id}/evidence")
async def get_evidence(
    commitment_id: str,
    analysis_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    if not analysis_id or not analysis_id.strip():
        raise HTTPException(
            status_code=400,
            detail={"error": "analysis_id query parameter is required"},
        )

    user_id = None
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        payload = verify_token(token)
        if payload:
            user_id = payload.get("uid")

    result = get_commitment_evidence(analysis_id, commitment_id, user_id=user_id)
    if not result.get("graph_available"):
        raise HTTPException(
            status_code=503,
            detail={"error": "Neo4j unavailable", "commitment_id": commitment_id},
        )

    return result


@router.post("/commitment/{commitment_id}/classify")
async def classify_commitment(
    commitment_id: str,
    body: ClassifyRequest,
    analysis_id: Optional[str] = Query(None),
):
    if not analysis_id or not analysis_id.strip():
        raise HTTPException(
            status_code=400,
            detail={"error": "analysis_id query parameter is required"},
        )

    if body.expense_category not in ("business", "personal"):
        raise HTTPException(
            status_code=422,
            detail={"error": "expense_category must be business or personal"},
        )

    entry = {
        "expense_category": body.expense_category,
        "analysis_id": analysis_id,
        "commitment_id": commitment_id,
    }
    _classifications[(analysis_id, commitment_id)] = entry

    return {
        "commitment_id": commitment_id,
        "expense_category": body.expense_category,
        "analysis_id": analysis_id,
    }


@router.get("/commitments/classified")
async def list_classified_commitments(
    analysis_id: Optional[str] = Query(None),
    expense_category: Optional[str] = Query(None),
):
    if not analysis_id or not analysis_id.strip():
        raise HTTPException(
            status_code=400,
            detail={"error": "analysis_id query parameter is required"},
        )

    matching = [
        item for (aid, _), item in _classifications.items()
        if aid == analysis_id and (expense_category is None or item["expense_category"] == expense_category)
    ]

    return {
        "analysis_id": analysis_id,
        "commitments": matching,
        "count": len(matching),
    }


@router.get("/summary/business")
def get_business_summary(analysis_id: Optional[str] = Query(None)):
    if not analysis_id or not analysis_id.strip():
        raise HTTPException(status_code=400, detail="analysis_id is required.")

    classified = [
        entry
        for entry in _classifications.values()
        if entry.get("analysis_id") == analysis_id
        and entry.get("expense_category") == "business"
    ]

    total_commitments = len(classified)
    commitment_ids = [entry["commitment_id"] for entry in classified]
    total_estimated_spend = round(
        sum(
            float(entry.get("typical_amount") or 0.0)
            for entry in classified
            if entry.get("typical_amount") is not None
        ),
        2,
    )

    return {
        "analysis_id": analysis_id,
        "total_business_commitments": total_commitments,
        "commitment_ids": commitment_ids,
        "total_estimated_spend": total_estimated_spend,
    }

