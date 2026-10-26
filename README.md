# Inbox2Offer

![CI](https://github.com/theeSagar/email-agent/actions/workflows/ci.yml/badge.svg)

> Turns a job-search inbox into a ranked daily job digest, drafts recruiter replies from the
> owner's own knowledge base, and tracks every application, with a human approving every action.

**Status:** Phase 1 of 6 (setup and owner-only login). A full README with a demo, architecture
diagram and metrics comes in Phase 6.

## Tech stack

FastAPI (Python) on Railway · Next.js on Vercel · Supabase (Postgres + pgvector + Auth) · Gemini API ·
Gmail API · GitHub Actions · Docker

## Project layout

```
backend/     FastAPI app (app/) and tests (tests/)
frontend/    Next.js app
supabase/    SQL migrations
```

## Run locally

**Backend** (Python 3.13):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt
copy .env.example .env            # then fill in the values
uvicorn app.main:app --reload     # http://localhost:8000/health
```

Or with Docker: `docker compose up --build` (from the repo root).

**Frontend** (Node 24):

```bash
cd frontend
npm install
copy .env.example .env.local      # then fill in the values
npm run dev                       # http://localhost:3000
```

## Lint and test

```bash
cd backend  && ruff check . && ruff format --check . && pytest
cd frontend && npm run lint && npm test && npm run build
```
