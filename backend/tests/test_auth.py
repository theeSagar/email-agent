"""Tests for the owner-only access check (app/auth.py)."""

import re
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from app import auth
from app.main import app
from tests.conftest import OWNER_EMAIL, SUPABASE_URL, make_token


def get_me(client, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.get("/api/me", headers=headers)


# --- Allowed ---


def test_owner_gets_in(client):
    response = get_me(client, make_token())

    assert response.status_code == 200
    assert response.json() == {"email": OWNER_EMAIL}


def test_owner_email_check_ignores_upper_case(client):
    response = get_me(client, make_token(email="Owner@Example.com"))

    assert response.status_code == 200


# --- Rejected: valid login, but not the owner -> 403 ---


def test_other_google_account_is_forbidden(client):
    response = get_me(client, make_token(email="stranger@gmail.com"))

    assert response.status_code == 403


def test_token_without_email_is_forbidden(client):
    response = get_me(client, make_token(email=""))

    assert response.status_code == 403


# --- Rejected: not a valid login at all -> 401 ---


def test_missing_token_is_rejected(client):
    assert get_me(client).status_code == 401


def test_expired_token_is_rejected(client):
    expired = make_token(expires_in_seconds=-60)

    assert get_me(client, expired).status_code == 401


def test_token_signed_with_wrong_secret_is_rejected(client):
    forged = make_token(secret="someone-elses-secret-that-is-also-long-enough")

    assert get_me(client, forged).status_code == 401


def test_token_from_another_supabase_project_is_rejected(client):
    other_project = make_token(issuer="https://other-project.supabase.co/auth/v1")

    assert get_me(client, other_project).status_code == 401


def test_garbage_token_is_rejected(client):
    assert get_me(client, "not-a-real-token").status_code == 401


def test_unsigned_token_is_rejected(client):
    # alg "none" means "no signature". It must never be accepted.
    unsigned = jwt.encode({"email": OWNER_EMAIL}, key=None, algorithm="none")

    assert get_me(client, unsigned).status_code == 401


# --- New-style Supabase projects: tokens signed with a private key (ES256) ---


class FakeJwksClient:
    """Stands in for Supabase's public-key endpoint during tests."""

    def __init__(self, public_key):
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return jwt.PyJWK.from_dict(jwt.algorithms.ECAlgorithm.to_jwk(self.public_key, as_dict=True))


def make_es256_token(private_key, email):
    now = int(time.time())
    claims = {
        "email": email,
        "aud": "authenticated",
        "iss": f"{SUPABASE_URL}/auth/v1",
        "exp": now + 3600,
    }
    return jwt.encode(claims, private_key, algorithm="ES256")


def test_public_key_signed_token_works(client, monkeypatch):
    supabase_key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient(supabase_key.public_key()))

    owner = get_me(client, make_es256_token(supabase_key, OWNER_EMAIL))
    stranger = get_me(client, make_es256_token(supabase_key, "stranger@gmail.com"))

    assert owner.status_code == 200
    assert stranger.status_code == 403


def test_token_signed_by_unknown_private_key_is_rejected(client, monkeypatch):
    supabase_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, "get_jwks_client", lambda: FakeJwksClient(supabase_key.public_key()))

    forged = make_es256_token(attacker_key, OWNER_EMAIL)

    assert get_me(client, forged).status_code == 401


# --- Safety net: no /api endpoint may forget the owner check ---


def test_every_api_route_requires_the_owner(client):
    # The OpenAPI schema lists every endpoint the app exposes.
    all_paths = app.openapi()["paths"]
    api_paths = {path: methods for path, methods in all_paths.items() if path.startswith("/api")}
    assert api_paths, "expected at least one /api route"

    for path, methods in api_paths.items():
        # Fill in path parameters like /api/drafts/{draft_id} with a dummy value.
        url = re.sub(r"\{[^}]+\}", "1", path)
        for method in methods:
            response = client.request(method.upper(), url)
            assert response.status_code == 401, f"{method.upper()} {path} is not protected"
