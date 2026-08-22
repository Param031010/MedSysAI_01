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
    """FastAPI dependency: returns the Clerk user id (`sub` claim) or raises 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["exp", "iat", "sub"]},
            # Clerk session tokens are short-lived (~60s) and this machine's
            # Windows Time service is disabled (unsynced clock, confirmed
            # ~7-8s drift and growing), so tolerate more than a few seconds
            # of skew rather than rejecting genuinely valid tokens.
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid session token: {exc}") from None

    return claims["sub"]
