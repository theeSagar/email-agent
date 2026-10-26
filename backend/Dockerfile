# Backend container image (used by docker-compose locally and by Railway in production).
FROM python:3.13-slim

# Print logs straight away and don't write .pyc files.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install packages first, so Docker can cache this step when only code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Run as a normal user, not root.
RUN useradd --create-home appuser
USER appuser

# Railway tells us which port to listen on through $PORT (8000 locally).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
