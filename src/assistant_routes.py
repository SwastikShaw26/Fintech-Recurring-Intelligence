
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.sarvam_service import (
    SarvamServiceError,
    explain_with_sarvam,
)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class ExplanationRequest(BaseModel):
    language: Literal["en", "hi"] = "en"
    consent: bool = False
    evidence_type: Literal[
        "forecast", "review"
    ]
    count: int = Field(ge=0, le=10000)
    days: int | None = Field(default=None, ge=1, le=365)


class ExplanationResponse(BaseModel):
    explanation: str
    language: str
    source: str = "sarvam"


@router.post("/explain", response_model=ExplanationResponse)
async def explain_financial_evidence(
    request: ExplanationRequest,
):
    if not request.consent:
        raise HTTPException(
            status_code=403,
            detail="Explicit consent is required for AI explanations.",
        )

    if request.evidence_type == "forecast":
        if request.days is None:
            raise HTTPException(
                status_code=422,
                detail="Forecast horizon is required.",
            )

        summary = (
            f"FinSight estimates {request.count} recurring "
            f"debits over the next {request.days} days. "
            "These are projections based on observed patterns, "
            "not confirmed future charges."
        )
    else:
        if request.days is not None:
            raise HTTPException(
                status_code=422,
                detail="Review evidence must not include a forecast horizon.",
            )

        summary = (
            f"FinSight identified {request.count} review "
            "signals in the loaded records. These are "
            "potential issues that require verification."
        )

    try:
        explanation = await explain_with_sarvam(
            summary,
            request.language,
        )
    except SarvamServiceError as exc:
        raise HTTPException(
            status_code=503,
            detail="AI explanation is unavailable. Use the local evidence.",
        ) from exc

    return ExplanationResponse(
        explanation=explanation,
        language=request.language,
    )
