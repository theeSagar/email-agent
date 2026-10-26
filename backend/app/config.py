"""All backend settings, read from environment variables (or backend/.env).

Keeping them in one place means the rest of the code never calls os.environ directly.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The only Google account allowed to use the app.
    owner_email: str

    # Supabase project URL, e.g. https://abcd1234.supabase.co
    supabase_url: str

    # Only needed for older Supabase projects that sign tokens with a shared secret (HS256).
    # New projects sign with a private key and publish the public keys, so this can stay empty.
    supabase_jwt_secret: str = ""

    # The website allowed to call this API from a browser (CORS), e.g. https://inbox2offer.vercel.app
    frontend_origin: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    """Load settings once and reuse them."""
    return Settings()
