"""Optional Clerk session verification for FastAPI endpoints."""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException, Request


def _authorized_parties() -> list[str]:
    return [
        item.strip()
        for item in os.getenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:3000").split(",")
        if item.strip()
    ]


def require_user(request: Request) -> dict[str, Any]:
    """Verify a Clerk session and return its claims for protected routes."""
    secret_key = os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        raise HTTPException(status_code=503, detail="Clerk authentication is not configured")

    try:
        from clerk_backend_api import AuthenticateRequestOptions, authenticate_request

        state = authenticate_request(
            request,
            AuthenticateRequestOptions(
                secret_key=secret_key,
                jwt_key=os.getenv("CLERK_JWT_KEY"),
                authorized_parties=_authorized_parties(),
                accepts_token=["session_token"],
            ),
        )
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Clerk SDK is not installed") from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Clerk session") from exc

    if not state.is_signed_in or not state.payload:
        reason = getattr(getattr(state, "reason", None), "name", None)
        raise HTTPException(status_code=401, detail=reason or "Authentication required")
    return dict(state.payload)


def actor_id(request: Request) -> str:
    """Return the Clerk user ID, with an explicit local demo fallback."""
    if os.getenv("CLERK_SECRET_KEY"):
        return str(require_user(request)["sub"])
    return request.headers.get("X-Actor-Id", "demo-user")
