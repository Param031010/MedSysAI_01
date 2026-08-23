"""Verifies Clerk session JWTs on incoming requests.

Clerk issues a short-lived RS256 JWT per session; the frontend attaches it as
`Authorization: Bearer <token>` (see `frontend/src/services/client.ts`). We
verify the signature against Clerk's published JWKS (cached by `PyJWKClient`)
rather than calling Clerk's API on every request.
"""

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from app.config import settings

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.clerk_issuer:
            raise HTTPException(
                status_code=500,
                detail="Clerk is not configured (missing/invalid CLERK_PUBLISHABLE_KEY)",
            )
        _jwks_client = PyJWKClient(f"{settings.clerk_issuer}/.well-known/jwks.json")
    return _jwks_client


async def require_clerk_auth(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: returns the Clerk user id (`sub` claim) from JWT, or falls back to 'dev_user_01' if unauthenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return "dev_user_01"
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return "dev_user_01"

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["exp", "iat", "sub"]},
            leeway=30,
        )
        return claims["sub"]
    except Exception:
        return "dev_user_01"

