"""Authentication routes for user registration, login, and profile fetching."""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.auth import authenticate_user, get_user_by_id, register_user, verify_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = ""


class LoginRequest(BaseModel):
    email: str
    password: str


def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Dependency helper to extract the active authenticated user from Authorization header."""
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    payload = verify_token(token)
    if not payload:
        return None
    return get_user_by_id(payload["uid"])


@router.post("/register")
def register(req: RegisterRequest):
    try:
        user_data = register_user(req.email, req.password, req.full_name or "")
        return user_data
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/login")
def login(req: LoginRequest):
    try:
        user_data = authenticate_user(req.email, req.password)
        return user_data
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication token invalid or expired.")
    return user
