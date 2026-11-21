import pytest
from src.auth import register_user, authenticate_user, verify_token
from src.auth_routes import register, login, get_me, RegisterRequest, LoginRequest
from fastapi import HTTPException

def test_auth_registration_and_login_flow():
    email = "unique_analyst_pytest@finsight.io"
    password = "SuperSecretPassword456"
    full_name = "Chief Risk Officer"

    # 1. Register new user
    reg = register(RegisterRequest(email=email, password=password, full_name=full_name))
    assert reg["email"] == email
    assert reg["full_name"] == full_name
    assert "token" in reg
    assert reg["user_id"].startswith("usr_")

    token = reg["token"]

    # 2. Get profile with Bearer token
    me = get_me(authorization=f"Bearer {token}")
    assert me is not None
    assert me["email"] == email
    assert me["full_name"] == full_name

    # 3. Duplicate registration rejected
    with pytest.raises(HTTPException) as exc:
        register(RegisterRequest(email=email, password=password, full_name=full_name))
    assert exc.value.status_code == 400
    assert "already exists" in str(exc.value.detail)

    # 4. Successful login
    log = login(LoginRequest(email=email, password=password))
    assert log["user_id"] == reg["user_id"]
    assert "token" in log

    # 5. Invalid login rejected
    with pytest.raises(HTTPException) as exc:
        login(LoginRequest(email=email, password="WrongPassword!"))
    assert exc.value.status_code == 401

def test_unauthorized_profile_request():
    with pytest.raises(HTTPException) as exc:
        get_me(authorization=None)
    assert exc.value.status_code == 401
