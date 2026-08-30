from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError, PyJWKClient, PyJWKClientError
from pydantic import BaseModel

from .config import get_settings
from .db import get_supabase


class UserProfile(BaseModel):
    user_id: str
    email: str | None = None
    role: str = "user"
    full_name: str | None = None


@lru_cache
def get_jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_keys=True)


def get_auth_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token empty",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def verify_jwt_token(token: str) -> dict:
    settings = get_settings()

    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    alg = header.get("alg")
    kid = header.get("kid")

    if not alg:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing algorithm",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        if alg == "HS256" and settings.supabase_jwt_secret:
            # Fallback for legacy HS256 tokens if secret is explicitly provided
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                leeway=300,
                options={"require": ["exp", "sub"]},
            )
        else:
            if alg != "ES256":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Unsupported token algorithm: {alg}",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing key ID (kid)",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            jwks_client = get_jwks_client(settings.jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token)

            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
                leeway=300,
                options={"require": ["exp", "sub"]},
            )
    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except (PyJWKClientError, InvalidTokenError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid signature or key",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def get_current_user(token: Annotated[str, Depends(get_auth_token)]) -> UserProfile:
    payload = verify_jwt_token(token)
    user_id: str = payload["sub"]
    email: str | None = payload.get("email")

    # Determine application role from public.profiles table in Supabase
    role = "user"
    full_name = None
    try:
        res = get_supabase().table("profiles").select("id, role, full_name").eq("id", user_id).execute()
        if res.data and len(res.data) > 0:
            profile = res.data[0]
            role = profile.get("role", "user")
            full_name = profile.get("full_name")
    except Exception:
        # Fallback to user if profiles lookup fails
        role = "user"

    return UserProfile(
        user_id=user_id,
        email=email,
        role=role,
        full_name=full_name,
    )


def require_user(current_user: Annotated[UserProfile, Depends(get_current_user)]) -> UserProfile:
    """Allow any authenticated user (role=user or role=admin)."""
    return current_user


def require_admin(current_user: Annotated[UserProfile, Depends(get_current_user)]) -> UserProfile:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin authorization required",
        )
    return current_user


def require_staff(current_user: Annotated[UserProfile, Depends(get_current_user)]) -> str:
    if current_user.role not in ("admin", "staff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required",
        )
    return current_user.role


def require_device(x_device_key: Annotated[str | None, Header()] = None) -> None:
    if x_device_key != get_settings().device_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid device key",
        )
