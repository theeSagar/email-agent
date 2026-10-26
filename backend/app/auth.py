"""Owner-only access check: the real security boundary of the app.

How it works:
1. The browser logs in with Google through Supabase and receives a signed token (a JWT).
2. The browser sends that token to us in the header:  Authorization: Bearer <token>
3. We check the token's signature and expiry, so we know Supabase really issued it.
4. We check that the email inside the token is OWNER_EMAIL.

Missing or invalid token -> 401 (we don't know who you are)
Valid token, wrong email -> 403 (we know who you are, but you're not allowed)
"""

from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

# auto_error=False lets us return our own clear 401 message when the header is missing.
bearer_scheme = HTTPBearer(auto_error=False)

# Algorithms Supabase uses to sign tokens. Anything else is rejected.
SHARED_SECRET_ALGORITHMS = ["HS256"]
PUBLIC_KEY_ALGORITHMS = ["ES256", "RS256"]


@lru_cache
def get_jwks_client() -> jwt.PyJWKClient:
    """Downloads (and caches) Supabase's public signing keys."""
    jwks_url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(jwks_url)


def decode_supabase_token(token: str) -> dict:
    """Verify a Supabase token and return its contents (the "claims").

    Raises jwt.PyJWTError if the token is fake, expired or malformed.
    """
    settings = get_settings()
    algorithm = jwt.get_unverified_header(token).get("alg")

    if algorithm in SHARED_SECRET_ALGORITHMS:
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 token received but SUPABASE_JWT_SECRET is not set")
        key = settings.supabase_jwt_secret
    elif algorithm in PUBLIC_KEY_ALGORITHMS:
        key = get_jwks_client().get_signing_key_from_jwt(token).key
    else:
        raise jwt.InvalidTokenError(f"Unsupported signing algorithm: {algorithm}")

    # jwt.decode checks the signature and the expiry ("exp") for us.
    return jwt.decode(
        token,
        key,
        algorithms=[algorithm],
        audience="authenticated",  # Supabase sets this for logged-in users
        issuer=f"{settings.supabase_url}/auth/v1",  # the token must come from OUR project
    )


def require_owner(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """FastAPI dependency: allow the request only if it comes from the owner.

    Returns the token claims so endpoints can read e.g. the email.
    """
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing login token")

    try:
        claims = decode_supabase_token(credentials.credentials)
    except jwt.PyJWTError:
        # Don't reveal *why* the token failed; that only helps an attacker.
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired login token"
        ) from None

    email = (claims.get("email") or "").strip().lower()
    owner_email = get_settings().owner_email.strip().lower()
    if email != owner_email:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    return claims
