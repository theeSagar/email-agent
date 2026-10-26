"""GET /api/me: a tiny protected endpoint that proves the login chain works."""

from fastapi import APIRouter, Depends

from app.auth import require_owner

router = APIRouter()


@router.get("/me")
def who_am_i(claims: dict = Depends(require_owner)) -> dict:
    return {"email": claims["email"]}
