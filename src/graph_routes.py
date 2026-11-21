from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .neo4j_service import get_commitment_evidence, is_available

router = APIRouter(prefix="/graph", tags=["graph"])

_classifications: dict[tuple[str, str], dict] = {}


class ClassifyRequest(BaseModel):
    expense_category: str


@router.get("/commitment/{commitment_id}/evidence")
async def get_evidence(
    commitment_id: str,
    analysis_id: Optional[str] = Query(None),
):
    if not analysis_id or not analysis_id.strip():
        raise HTTPException(
            status_code=400,
            detail={"error": "analysis_id query parameter is required"},
        )

    result = get_commitment_evidence(analysis_id, commitment_id)
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
