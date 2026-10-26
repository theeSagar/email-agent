"""The FastAPI application: the entry point for the backend.

Run locally with:  uvicorn app.main:app --reload
"""

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import require_owner
from app.config import get_settings
from app.routes import me

app = FastAPI(title="Inbox2Offer API")

# CORS: only our own frontend may call this API from a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


# --- Public routes (no login) ---
@app.get("/health")
def health() -> dict:
    """Used by Railway (and us) to check the server is alive."""
    return {"status": "ok"}


# --- Private routes (owner only) ---
# Every router added here is automatically protected by require_owner,
# so a new endpoint can't accidentally skip the owner check.
private_api = APIRouter(prefix="/api", dependencies=[Depends(require_owner)])
private_api.include_router(me.router)

app.include_router(private_api)
