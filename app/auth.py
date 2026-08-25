from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from .config import get_settings
from .db import get_supabase


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    try:
        payload = jwt.decode(
            authorization.removeprefix("Bearer "),
            get_settings().supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def require_staff(user_id: Annotated[str, Depends(get_current_user)]) -> str:
    result = get_supabase().table("staff").select("role").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return result.data[0]["role"]


def require_device(x_device_key: Annotated[str | None, Header()] = None) -> None:
    if x_device_key != get_settings().device_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid device key")

