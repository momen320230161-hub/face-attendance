import time
from unittest.mock import MagicMock, patch

from cryptography.hazmat.primitives.asymmetric import ec
import jwt
from jwt.exceptions import PyJWKClientError
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)

# Generate a test EC P-256 key pair for ES256 tests
TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
TEST_PUBLIC_KEY = TEST_PRIVATE_KEY.public_key()
TEST_KID = "test-valid-kid-123"

# Another EC key for invalid signature testing
WRONG_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


@pytest.fixture(autouse=True)
def override_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def mock_jwks_client():
    mock_client = MagicMock()

    def get_signing_key_from_jwt(token: str):
        try:
            header = jwt.get_unverified_header(token)
        except Exception as exc:
            raise PyJWKClientError("Malformed token") from exc

        kid = header.get("kid")
        if kid != TEST_KID:
            raise PyJWKClientError(f"Unable to find key with kid {kid}")

        mock_key = MagicMock()
        mock_key.key = TEST_PUBLIC_KEY
        return mock_key

    mock_client.get_signing_key_from_jwt.side_effect = get_signing_key_from_jwt

    with patch("app.auth.get_jwks_client", return_value=mock_client):
        yield mock_client


def make_es256_token(
    sub: str = "user-123-id",
    email: str = "user@test.com",
    audience: str = "authenticated",
    kid: str = TEST_KID,
    key=TEST_PRIVATE_KEY,
    algorithm: str = "ES256",
    expires_in: int = 3600,
) -> str:
    payload = {
        "sub": sub,
        "email": email,
        "aud": audience,
        "exp": int(time.time()) + expires_in,
    }
    headers = {"kid": kid} if kid else {}
    return jwt.encode(payload, key, algorithm=algorithm, headers=headers)


# 1. Missing Authorization -> 401
def test_missing_auth_header():
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "detail" in response.json()


# 2. Malformed Authorization -> 401
def test_malformed_auth_header():
    res1 = client.get("/api/v1/auth/me", headers={"Authorization": "Basic 12345"})
    assert res1.status_code == 401

    res2 = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer"})
    assert res2.status_code == 401

    res3 = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res3.status_code == 401


# 3. Invalid signature -> 401
def test_invalid_signature():
    token = make_es256_token(key=WRONG_PRIVATE_KEY)
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


# 4. Expired token -> 401
def test_expired_token():
    token = make_es256_token(expires_in=-3600)
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


# 5. Wrong algorithm -> 401
def test_wrong_algorithm():
    # Symmetric HS256 token when ES256 expected
    token = jwt.encode({"sub": "123", "exp": int(time.time()) + 3600, "aud": "authenticated"}, "secret", algorithm="HS256", headers={"kid": TEST_KID})
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


# 6. Unknown kid -> 401
def test_unknown_kid():
    token = make_es256_token(kid="unknown-kid-999")
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


# 7 & 8. Valid ES256 token with known kid -> GET /api/v1/auth/me returns 200
def test_valid_user_me_endpoint():
    token = make_es256_token(sub="user-uuid-1", email="test@example.com")

    mock_supabase = MagicMock()
    mock_response = MagicMock()
    mock_response.data = [{"id": "user-uuid-1", "role": "user", "full_name": "Test User"}]
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

    with patch("app.auth.get_supabase", return_value=mock_supabase):
        response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "user-uuid-1"
        assert data["email"] == "test@example.com"
        assert data["role"] == "user"
        assert data["full_name"] == "Test User"


# 9. Normal user -> GET /api/v1/auth/admin-check returns 403
def test_normal_user_admin_check_forbidden():
    token = make_es256_token(sub="user-uuid-2", email="normal@example.com")

    mock_supabase = MagicMock()
    mock_response = MagicMock()
    mock_response.data = [{"id": "user-uuid-2", "role": "user"}]
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

    with patch("app.auth.get_supabase", return_value=mock_supabase):
        response = client.get("/api/v1/auth/admin-check", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403
        assert response.json()["detail"] == "Admin authorization required"


# 10. Admin -> GET /api/v1/auth/admin-check returns 200
def test_admin_user_admin_check_success():
    token = make_es256_token(sub="admin-uuid-1", email="admin@example.com")

    mock_supabase = MagicMock()
    mock_response = MagicMock()
    mock_response.data = [{"id": "admin-uuid-1", "role": "admin"}]
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response

    with patch("app.auth.get_supabase", return_value=mock_supabase):
        response = client.get("/api/v1/auth/admin-check", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "authorized"
        assert data["user_id"] == "admin-uuid-1"
        assert data["role"] == "admin"
