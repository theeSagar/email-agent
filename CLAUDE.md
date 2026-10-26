# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project: Inbox2Offer – AI Job-Search Assistant

Inbox2Offer turns the owner's Gmail job-search inbox into:

- **Pipeline A:** a ranked daily digest of jobs pulled from job-alert emails (Naukri, Indeed, LinkedIn).
- **Pipeline B:** AI-drafted replies to recruiter emails, grounded in the owner's own knowledge base.
- An **application tracker** and an **insights** page.

A human approves every outbound action. The system is single-owner (one Gmail account, one login),
with a separate read-only public demo backed by fake seeded data.

**Source of truth for requirements:** `INITIAL.md`. If this file and `INITIAL.md` disagree,
`INITIAL.md` wins. Tell the owner about the conflict and update this file.

## Current status

- **Phase 1 code is written and tested locally.** It is waiting for the owner to create the Supabase /
  Google Cloud / Railway / Vercel accounts and do the first deploy.
- The owner wants **simple, beginner-readable code**: plain functions, clear names, short comments
  explaining *why*, and no clever abstractions.
- `vizuara_courses_dummy_dataset_150.csv` is unrelated to this project and is git-ignored. Do not use or commit it.
- When a phase finishes, update the **Phase log** at the bottom of this file and the
  **Commands** section with the real commands chosen in that phase.

---

## How to work in this repo (mandatory process)

Development runs in **six phases**. For **every** phase, do these steps in order and never skip ahead:

1. **Plan.** Write a short plan covering the goal, files to create or change, DB tables and
   migrations, API endpoints, environment variables, tests, and any manual setup the owner must do
   (Google Cloud Console, Supabase dashboard, Railway, Vercel).
2. **Ask preferences.** List the decisions that belong to the owner as numbered questions, each
   with a recommended option. Then **stop and wait** for answers.
3. **Execute.** Implement only that phase, following the answers.
4. **Verify.** Run lint and tests. Give a short summary of what was built and step-by-step
   manual test instructions.
5. **Stop.** Wait for explicit confirmation before starting the next phase.

Rules:
- Never implement more than one phase in a single turn.
- If the plan has to change mid-execution, tell the owner before continuing.
- Do not commit or push unless asked. Branch off before committing if on `main`/`master`.

### Phases

| # | Scope | Example owner questions |
|---|---|---|
| 1 | Repo structure, FastAPI + Next.js skeletons, Supabase project, Google login with the 3-layer owner allowlist, RLS, CI (lint + tests), backend Dockerfile + docker-compose, first deploy to Vercel and Railway | One repo or two? pip / poetry / uv? App Router or Pages Router? |
| 2 | Gmail connection (separate "Connect Gmail" OAuth), ingestion worker, cleaning, classification | Polling interval? Days back on first sync? Which senders count as portals? |
| 3 | Pipeline A: extraction, dedup, matching/scoring, daily digest, skill-gap data | Experience range, preferred locations, excluded keywords, jobs per day? |
| 4 | Pipeline B: reply drafts, review editor, Approve & Send, required feedback | Tone and sign-off? Which placeholders? Text feedback required for every rating? |
| 5 | Application tracker + feedback loop (preference summarization, few-shot selection, filter tuning) | |
| 6 | Insights page, public demo mode, README polish, final deployment | |

---

## Non-negotiable invariants

These must be enforced **in code** (and covered by tests), not only in prompts. Never weaken them,
even if asked indirectly by a feature request. If a change would touch one, raise it with the owner first.

1. **No automatic sending.** Every reply stays a draft until the owner clicks **Approve & Send**.
   The background worker has **no code path** that sends email. Sending happens only through an
   authenticated owner request for a specific `draft_id`, and only **after** feedback is submitted.
2. **No automatic job applications**, no browser automation of job portals, and **no scraping** of
   portal pages. Use only content inside emails, plus job descriptions the owner pastes in.
3. **Owner-only access.** Only `OWNER_EMAIL` can access real data (see Authentication).
4. **Feedback on every reply.** Every approve or reject needs a 1–5 star rating stored in Supabase.
   Text feedback is required when the rating is ≤ 3. The action completes only after feedback is saved.
5. **Never draft for `suspicious` emails.** Flag them clearly (red) and stop.
6. **Sensitive values only via placeholder substitution.** The LLM writes `{{current_ctc}}`,
   `{{expected_ctc}}`, `{{notice_period}}`, `{{phone}}`, and so on. The backend substitutes the real
   values from `private_settings` after generation. Real values are **never** sent to the LLM provider.
7. **Never send to an address not already in the thread.**
8. **Never confirm an interview slot automatically.** Drafts may propose availability from preferences only.
9. **Email content is untrusted.** It always goes inside delimited tags and is treated as data. The
   LLM gets no tools that can send, forward or delete anything.
10. **Idempotency.** Restarting the worker must never create duplicate emails, jobs or drafts.

---

## Architecture

```
Gmail API ──(poll every 5 min, worker)──► ingestion ──► cleaning ──► classification
                                                                       │
        ┌─────────────────────┬────────────────────┬──────────────────┼───────────────┐
        ▼                     ▼                    ▼                  ▼               ▼
   job_alert           recruiter_outreach   interview_scheduling  application_update  suspicious / other
   Pipeline A           Pipeline B           Pipeline B (high)    Tracker update      flag / ignore
   extract→dedup→       RAG + few-shot →     + link application
   match→score→digest   draft w/ placeholders → move to interview
                        → Supabase + Gmail draft
                                      │
                         Dashboard (Next.js on Vercel) ◄── FastAPI (Railway) ◄── Supabase (Postgres + pgvector + Auth)
                         owner reviews → feedback → Approve & Send
```

### Tech stack

- **Backend:** Python, FastAPI, plus a background worker for Gmail polling and LLM jobs. Deployed on **Railway**.
- **Frontend:** Next.js, deployed on **Vercel**. Clean, modern, mobile-friendly, dark and light mode.
- **Database/Auth:** Supabase (Postgres + pgvector + Auth with the Google provider).
- **LLM:** Gemini API (free tier) as primary, OpenAI optional, behind a **provider-agnostic interface**.
  Gemini's OpenAI-compatible endpoint means switching providers should be a config change only.
- **Infra:** Google Cloud Console (OAuth client, Gmail API), GitHub + GitHub Actions CI (lint + tests on
  every push), Docker (backend Dockerfile, docker-compose for local dev).

The repo layout (monorepo vs two repos, package manager, router type) is decided in Phase 1.
Record the result in **Repository layout** below once decided.

### Repository layout

This is a monorepo (GitHub: `theeSagar/email-agent`, default branch `main`).

```
backend/            FastAPI app (app/), tests (tests/), requirements*.txt (pip), Dockerfile
  app/main.py         app + CORS + /health; every router goes under `private_api` (owner-only)
  app/auth.py         `require_owner` dependency: verifies Supabase JWT (HS256 secret or ES256/RS256 JWKS)
  app/config.py       all settings from env vars (pydantic-settings)
frontend/           Next.js 16 App Router + TypeScript + Tailwind v4 (npm). No shadcn/ui.
  proxy.ts            Next 16's renamed "middleware": refreshes the session and guards /dashboard
  app/auth/callback/  OAuth code exchange + owner check
  lib/owner.ts        isOwnerEmail(); OWNER_EMAIL is SERVER-ONLY (not NEXT_PUBLIC_), never in the bundle
supabase/migrations/ Versioned SQL. `public.is_owner()` is the one RLS check every table uses.
examples/           Sample emails (PII removed). Used for tests, eval and demo seeding (later phases)
scripts/            Evaluation script and other utilities (later phases)
.github/workflows/  CI
```

Notes for future phases:
- Next 16 has `cacheComponents: true`: anything reading cookies/session must sit inside `<Suspense>`.
  Read `frontend/node_modules/next/dist/docs/` before using Next APIs (see `frontend/AGENTS.md`).
- New tables: in the same migration, `enable row level security` plus
  `create policy "owner only" ... for all to authenticated using (public.is_owner()) with check (public.is_owner())`.
- The owner email is never committed. It lives in env vars and in the `app_owner` row inserted by hand.

---

## Domain details

### 1. Email ingestion (Gmail API)

- Gmail API with OAuth2 only. **No IMAP, no app passwords.**
- Scopes: `gmail.readonly` (read) and `gmail.compose` (drafts + send).
- Worker polls every 5 minutes (configurable) for recent mail only:
  - Query 1: `newer_than:7d -category:promotions -category:social`
  - Query 2: known portal senders (Naukri, Indeed, LinkedIn alerts) **regardless of category**,
    because portals often land in Promotions.
- Fetch the full thread for each email. Strip quoted replies (`> On ... wrote:`) and HTML boilerplate.
  Store sender, date, subject and clean body.
- The Gmail `message_id` is the unique key, so nothing is processed twice.

### 2. Classification

Run cheap rule-based checks first (known portal senders, `no-reply` addresses). Call the LLM only when
the rules can't decide. The LLM must return strict JSON, validated with a schema (e.g. Pydantic):

```json
{ "category": "...", "priority": "high|normal", "reason": "..." }
```

| Category | Action |
|---|---|
| `job_alert` | Pipeline A. No reply. |
| `recruiter_outreach` | Pipeline B (draft reply). |
| `interview_scheduling` | Pipeline B, priority `high`. Link to application, set status `interview`. |
| `application_update` | Update application tracker status. |
| `suspicious` | Fees, Aadhaar, PAN, bank details, etc. Flag red. **Never draft.** |
| `other` | Ignore. |

Unparseable LLM output must fall back safely (e.g. `other`, or retry). It must never crash the worker.

### 3. Pipeline A: job alerts → daily digest

1. **Extract.** One alert email can hold many jobs. Extract title, company, location, experience
   required, skills, salary (if shown), portal and job link.
   - Use **per-portal BeautifulSoup parsers first** (cheap, deterministic).
   - Fall back to **LLM structured extraction** when a parser fails or the template is unknown.
   - **Log the extraction method** per job so the dashboard can show parser coverage.
2. **Deduplicate.** Normalize company, title and location (lowercase, strip suffixes like "Pvt Ltd",
   "Private Limited", "Inc"), hash them, and merge duplicates into one job with all source portals
   listed (`job_sources`).
3. **Match and score.**
   - Hard filters from preferences first: experience range, preferred locations, excluded keywords.
   - Embedding similarity against resume/KB (pgvector) gives the first ranking.
   - LLM scoring (0–100 + short reason) for the **top candidates only**, to save free-tier quota.
     Example reason: "Strong match: FastAPI, PostgreSQL, RAG. Gap: asks 4+ years, I have 2."
4. **Digest UI.** "Today's top matches" sorted by score, showing company, role, location, score, reason and
   an **Open job** link. Actions: **Mark as Applied**, **Not Interested** (optional reason), **Save for later**.
   Optional: paste a full JD to get a deeper re-score.
5. **Skill-gap insights.** Across jobs matched in the last 7 and 30 days, show skills that appear often
   but are missing or weak in the KB (e.g. "Docker appears in 68% of matched jobs").

### 4. Pipeline B: recruiter emails → reply drafts

Prompt context, **in this exact order**:
1. Rules (hard constraints)
2. Writing preferences (summarized)
3. 2–3 most similar previously sent replies (few-shot, preferring highly rated ones)
4. Top 3–5 relevant KB chunks (RAG)
5. Cleaned thread history
6. Latest email inside clearly delimited tags, marked as untrusted data

Rules for drafts:
- Sensitive values only as placeholders. After substitution, any placeholder with no value in
  `private_settings` stays **highlighted in the editor** for manual fill. Sending must be blocked
  while unresolved placeholders remain.
- If the email asks for a fact that isn't in the context, the draft says the owner will confirm and
  get back. **Never guess.**
- Out-of-stack roles get a short, polite decline that mentions target roles.
- Save the draft to Supabase **and** as a real Gmail draft in the correct thread (`threadId`,
  `In-Reply-To` and `References` headers set).
- Draft status flow: `drafted → approved → sent`, or `rejected`.

### 5. Application tracker

- **Mark as Applied** creates an application: company, role, portal, link, applied date, status `applied`.
- `application_update` emails are matched to an application by company + role (normalized). Status moves
  to `viewed`, `shortlisted`, `interview`, `rejected` or `offer`. Keep a status history.
- `interview_scheduling` emails link to their application and move it to `interview`.
- UI: pipeline view Applied → Viewed → Interview → Offer / Rejected.

### 6. Knowledge base (Supabase + pgvector)

- Holds **only recruiter-shareable** content: resume, portfolio-level project write-ups, job preferences
  (target roles, locations, relocation, call availability) and FAQ answers.
- Documents are chunked, embedded and stored in `kb_chunks`. An admin page uploads/edits docs and re-embeds them.
- CTC, phone and notice period live in `private_settings`, **never** in the KB.
- Free-tier LLM prompts may be used by the provider. Never put anything private into prompts.

### 7. Authentication (Google login, owner only)

- Supabase Auth with the Google provider, scopes `openid email profile`. No passwords.
- Google login alone is **not** enough. Enforce the `OWNER_EMAIL` allowlist in **three layers**:
  1. **Frontend (UX only):** if the logged-in email ≠ `OWNER_EMAIL`, sign out immediately and show "Access denied".
  2. **Backend (the real boundary):** every FastAPI endpoint (except health and public demo) verifies
     the Supabase JWT signature and expiry and checks the email claim equals `OWNER_EMAIL`. Otherwise 403.
     Implement this as a shared dependency so no endpoint can forget it.
  3. **Database:** RLS on **every** table so only the owner can read/write. The frontend never uses the service-role key.
- Disable new sign-ups after the owner account exists, if Supabase allows it.
- **Login and Gmail access are separate.** "Connect Gmail" is a backend OAuth flow requesting Gmail scopes
  with offline access. The refresh token is stored **encrypted at rest**. The connected Gmail address must
  equal `OWNER_EMAIL`; reject any other account.
- Session refresh is handled by the Supabase client. Provide a logout button.
- While the Google OAuth app is in "Testing" status, refresh tokens expire after ~7 days. Detect
  `invalid_grant` and similar errors, mark Gmail as disconnected, and show a **"Reconnect Gmail" banner**.
  Never crash the worker.

### 8. Dashboard pages

- **Landing** (public) with a **Try the demo** button.
- **Home:** today's stats (new alerts, jobs extracted, top match score, drafts waiting, applications by status).
- **Job Digest:** ranked jobs, reasons, actions.
- **Reply Inbox:** thread, AI draft with highlighted placeholders, editor, **Approve & Send** / **Save edit** /
  **Reject**. Approve and Reject open the required feedback form first.
- **Applications:** pipeline view.
- **Insights:** skill-gap chart, jobs per portal, average match score over time, average draft rating over
  time, % of drafts sent without edits.
- **Settings:** preferences, rules, private values, KB management.
- Make **match score** and **skill-gap insights** visually prominent.

**Public demo mode:** no login, seeded **fake** data only (sample alerts, recruiter emails, drafts), read-only.
All send/approve actions are disabled with a tooltip explaining that real sending needs the owner's login.
Demo routes **never call authenticated endpoints** and have no access to real data or Gmail credentials.

### 9. Storage (Supabase tables, adjust as needed)

| Table | Purpose |
|---|---|
| `emails`, `threads` | Raw incoming email, category, priority, status. `message_id` unique. |
| `jobs`, `job_sources` | Deduplicated jobs (unique dedup hash) and which portals/emails they came from. |
| `job_matches` | Score, reason, method (`embedding` / `llm`), owner action (`applied` / `not_interested` / `saved`), optional reason. |
| `drafts` | Original AI draft, edited/final version, status. |
| `feedback` | `draft_id`, rating 1–5, text, action (`sent` / `rejected`), `edited` flag, `created_at`. |
| `applications` | Tracker + status history. |
| `kb_documents`, `kb_chunks` | KB with pgvector embeddings. |
| `preferences`, `rules`, `private_settings` | Owner configuration. `private_settings` holds sensitive values. |
| Gmail credentials | Encrypted refresh token, connection status. |
| Demo dataset | Kept separate from real data (separate tables or schema). |

All schema changes go through versioned migrations. Every new table gets RLS policies in the same migration.
Use DB unique constraints (not just app checks) for `message_id`, dedup hash and one-feedback-per-draft.

### 10. Feedback loop

- After every 10 rated drafts, the LLM summarizes recent edits and comments into an updated writing-preferences document.
- The highest-rated sent replies become few-shot examples.
- **Not Interested** reasons are collected and used to adjust hard filters over time. Propose filter
  changes to the owner rather than silently applying them.

---

## LLM usage rules

- All LLM calls go through the provider-agnostic interface. Never call Gemini/OpenAI SDKs directly from business logic.
- Use the LLM only where rules, parsers and embeddings aren't enough.
- Every structured call: JSON output, schema-validated, with safe fallback on parse failure.
- Free-tier rate limits: route LLM work through a **queue**, retry with **exponential backoff**, and
  handle **HTTP 429** gracefully (defer, don't drop or crash).
- Prompt-injection defence: wrap email content in delimited tags, instruct the model to treat it as data only,
  and expose **no tools** to the model.
- Model names, endpoints and keys come from environment variables.

## Security and configuration

- All secrets come from environment variables and are never committed. Keep `.env.example` up to date with
  every variable a phase adds (placeholder values only).
- Expected variables include (final list set per phase): `OWNER_EMAIL`, Supabase URL / anon key / service-role
  key (backend only) / JWT secret, Google OAuth client ID and secret, Gmail redirect URI, token encryption key,
  `GEMINI_API_KEY`, optional `OPENAI_API_KEY`, LLM provider/model settings, `FRONTEND_ORIGIN` for CORS,
  polling interval.
- CORS on the Railway backend allows **only** the Vercel frontend domain.
- Google OAuth tokens are encrypted at rest.
- Never log email bodies, tokens or private settings values at info level or above.
- Real emails must never be committed. Files in `examples/` have personal details removed.

## Testing

Required unit tests (add with the phase that introduces the code):
- Classifier output parsing (valid, malformed, unknown category)
- Each portal parser (Naukri, Indeed, LinkedIn) against `examples/` fixtures
- Job deduplication and normalization
- Placeholder substitution (all set, some missing, no leaks of real values into LLM input)
- Quote stripping / HTML cleaning
- Idempotency (re-processing the same `message_id` / job hash creates nothing new)
- Auth: non-owner JWT → 403, expired/invalid JWT → 401/403, missing token rejected
- Hard rules: no draft for `suspicious`, send blocked without feedback, send blocked for a recipient
  outside the thread, send blocked with unresolved placeholders

**Evaluation script:** run the classifier and extractor over `examples/` and report accuracy, so improvements
can be measured over time.

CI (GitHub Actions) runs lint + tests on every push. Keep CI green. Don't mark a phase done with failing tests.

## Examples (`examples/`)

Sample emails with PII removed. Used for tests, evaluation and seeding the public demo. Expected behaviour:

1. **Naukri alert with 6 jobs** → `job_alert`. Extract all 6, dedup, score, show in digest.
2. **LinkedIn alert with one of the same jobs** → merged into the existing job with both portals as sources.
3. **Recruiter asks CTC / expected CTC / notice / resume** → `recruiter_outreach`. Draft uses `{{current_ctc}}`,
   `{{expected_ctc}}`, `{{notice_period}}`, location preference from the KB, and mentions the resume.
4. **"Technical round Thursday 3 PM?"** → `interview_scheduling`, `high`. Proposes availability, never confirms.
   Linked application → `interview`.
5. **"Application for Backend Engineer at X was viewed"** → `application_update`. Status → `viewed`.
6. **"Pay ₹2,000 registration fee and send Aadhaar"** → `suspicious`. Red flag, no draft.
7. **Role outside target stack** → short polite decline mentioning target roles.

## README requirements (Phase 6, recruiter-facing)

One-line pitch + demo GIF at top, live demo link, CI badge, Mermaid architecture diagram of both pipelines,
a "Key engineering decisions" section (human-in-the-loop, placeholder substitution, hybrid parser + LLM
extraction, prompt-injection defence, idempotency, rate-limit handling), a metrics section with real numbers
(jobs extracted, duplicates merged, classification accuracy, % drafts sent without edits), setup
instructions and tech stack.

## Commands

```bash
# Backend (from backend/, venv at backend/.venv)
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/uvicorn app.main:app --reload              # run API on :8000
.venv/Scripts/ruff check . && .venv/Scripts/ruff format --check .   # lint
.venv/Scripts/python -m pytest                           # all tests
.venv/Scripts/python -m pytest tests/test_auth.py::test_owner_gets_in   # single test

# Frontend (from frontend/)
npm install
npm run dev          # :3000
npm run lint
npm test             # vitest
npm run build        # needs the NEXT_PUBLIC_* vars + OWNER_EMAIL set

# Docker (from repo root)
docker compose up --build    # backend on :8000, reads backend/.env

# Migrations: paste supabase/migrations/*.sql into Supabase SQL Editor, in filename order
# (or: npx supabase link --project-ref <ref> && npx supabase db push)
```

Not yet: run worker (Phase 2), run eval script (Phase 3).

## Reference documentation

- Gmail API: https://developers.google.com/gmail/api (Python quickstart: https://developers.google.com/gmail/api/quickstart/python)
- Gemini API: https://ai.google.dev/gemini-api/docs (OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai)
- Supabase vectors: https://supabase.com/docs/guides/ai
- Supabase Auth: https://supabase.com/docs/guides/auth (Google: https://supabase.com/docs/guides/auth/social-login/auth-google)
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- FastAPI: https://fastapi.tiangolo.com
- Next.js: https://nextjs.org/docs
- Railway: https://docs.railway.com
- Vercel: https://vercel.com/docs
- BeautifulSoup: https://www.crummy.com/software/BeautifulSoup/bs4/doc/

## Phase log

| Phase | Status | Key decisions |
|---|---|---|
| 1 | Code done and tested locally; deploy pending owner account setup | Monorepo; pip + requirements.txt; Next 16 App Router + TS + Tailwind (no shadcn); owner check in Next runs server-side only; Supabase "before user created" hook as a 4th layer; LLM provider chosen in Phase 2 (owner also uses Llama-3.3-70B elsewhere) |
| 2 | Not started | |
| 3 | Not started | |
| 4 | Not started | |
| 5 | Not started | |
| 6 | Not started | |
