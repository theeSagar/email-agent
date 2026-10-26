"""Shared test setup.

Tests never talk to the real Supabase. Instead we:
- set fake settings (owner email, Supabase URL, secret) below, and
- create our own signed tokens with `make_token`, exactly like Supabase would.
"""

import os
import time

import jwt
import pytest

# Fake settings. These must be set before the app is imported.
OWNER_EMAIL = "owner@example.com"
SUPABASE_URL = "https://test-project.supabase.co"
JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"

os.environ["OWNER_EMAIL"] = OWNER_EMAIL
os.environ["SUPABASE_URL"] = SUPABASE_URL
os.environ["SUPABASE_JWT_SECRET"] = JWT_SECRET
os.environ["FRONTEND_ORIGIN"] = "http://localhost:3000"

from fastapi.testclient import TestClient  # noqa: E402  (import after env vars on purpose)

from app.main import app  # noqa: E402


def make_token(
    email: str = OWNER_EMAIL,
    expires_in_seconds: int = 3600,
    secret: str = JWT_SECRET,
    issuer: str = f"{SUPABASE_URL}/auth/v1",
) -> str:
    """Create a token that looks like one Supabase issues after Google login."""
    now = int(time.time())
    claims = {
        "sub": "user-id-123",
        "email": email,
        "aud": "authenticated",
        "iss": issuer,
        "iat": now,
        "exp": now + expires_in_seconds,
    }
    return jwt.encode(claims, secret, algorithm="HS256")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
