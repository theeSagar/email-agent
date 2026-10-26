# Inbox2Offer – AI Job-Search Assistant

> Turns my job-search inbox into a ranked daily job digest, drafts recruiter replies from my
> own knowledge base, and tracks every application, with a human approving every action.

## FEATURE

I am a Python backend / GenAI developer actively looking for a job switch. My Gmail inbox
gets two kinds of job-search email:

1. **Job alerts**: many recommendation emails daily from Naukri, Indeed and LinkedIn.
2. **Recruiter emails**: recruiters asking for CTC, notice period, resume, availability,
   or to schedule interviews.

Build a system with **two pipelines**, one for each, plus a dashboard to review everything.

### Non-negotiable requirements

1. **No automatic sending.** The system must never send an email on its own. Every reply
   stays a draft until I click **Approve & Send**. It must also never apply to a job
   automatically; I apply myself through the job link.
2. **Owner-only access.** Only I, the owner of the connected Gmail account, can access real
   data. Login is with Google, and any other Google account is rejected.
3. **Feedback on every reply.** Every AI-drafted reply gets a star rating and textual
   feedback, stored in Supabase.
4. **Phased implementation.** Plan first, ask my preferences, then execute one phase at a
   time (see "Implementation process" below).

---

### 1. Email ingestion (Gmail API)

- Gmail API with OAuth2 (no IMAP, no app passwords).
- Scopes: `gmail.readonly` for reading and `gmail.compose` for drafts and sending.
- A background worker polls every 5 minutes for recent emails only, not the whole inbox:
  `newer_than:7d -category:promotions -category:social`
  Job portals sometimes land in Promotions, so also run a second query for known portal
  senders (Naukri, Indeed, LinkedIn job alerts) regardless of category.
- Fetch the full thread for each email. Strip quoted replies (`> On ... wrote:`) and HTML
  boilerplate, then store each message cleanly with sender, date, subject and body.
- Use the Gmail `message_id` as a unique key so no email is processed twice.

### 2. Classification

Run cheap rule-based checks first (known portal senders, `no-reply` addresses), then use the
LLM only when needed. The LLM must return structured JSON:
`{ "category": ..., "priority": "high|normal", "reason": "..." }`

| Category | Example | Action |
|---|---|---|
| `job_alert` | Naukri/Indeed/LinkedIn recommendations | Send to **Pipeline A** (job digest). No reply. |
| `recruiter_outreach` | "Please share CTC, notice period, resume" | Send to **Pipeline B** (draft reply) |
| `interview_scheduling` | "Can you join a technical round Thursday 3 PM?" | Pipeline B, priority high |
| `application_update` | "Your application was viewed / rejected" | Update the application tracker |
| `suspicious` | Asks for registration fees, Aadhaar, PAN, bank details | Flag clearly. NEVER draft a reply. |
| `other` | Everything else | Ignore |

---

### 3. Pipeline A: Job alerts → ranked daily digest

**Step 1: Extract jobs.** One alert email contains several jobs. Extract each job as
structured data: title, company, location, experience required, skills mentioned,
salary (if shown), portal, and job link.
- Use per-portal HTML parsers (BeautifulSoup) first, because they are cheap and deterministic.
- Fall back to LLM extraction (structured JSON) when a parser fails or the template is unknown.
- Log which method was used, so I can see parser coverage on the dashboard.

**Step 2: Deduplicate.** The same job often arrives from multiple portals. Normalize
company, title and location (lowercase, strip suffixes like "Pvt Ltd"), hash them, and merge
duplicates into one job that lists all source portals.

**Step 3: Match and score.**
- Hard filters from my preferences first: experience range, preferred locations,
  excluded keywords (e.g. roles outside my stack).
- Embedding similarity between the job and my resume / KB (Supabase pgvector) for a fast
  first ranking.
- LLM scoring for the top candidates only (to save free-tier quota): a score from 0 to 100
  plus a short reason, e.g. "Strong match: FastAPI, PostgreSQL, RAG. Gap: asks 4+ years, I have 2."

**Step 4: Daily digest.**
- Dashboard view: "Today's top matches", sorted by score, each with company, role,
  location, score, match reason and an "Open job" link.
- Buttons per job: **Mark as Applied**, **Not Interested**, **Save for later**.
- Optional: paste the full job description into a job to get a deeper re-score.

**Step 5: Skill-gap insights.** Across all jobs matched in the last 7 and 30 days, show
the skills that appear most often in job descriptions but are missing or weak in my KB
(e.g. "Docker appears in 68% of matched jobs"). This tells me what to learn next.

---

### 4. Pipeline B: Recruiter emails → reply drafts

**Context passed to the LLM, in this order:**
1. Rules (hard constraints)
2. Writing preferences (summarized)
3. 2–3 of my previously sent replies most similar to this email (few-shot examples)
4. Top 3–5 relevant knowledge-base chunks (RAG)
5. Cleaned thread history
6. The latest email, inside clearly delimited tags, treated as untrusted data

**Sensitive values via placeholders.** The LLM must never write personal numbers itself.
It outputs placeholders such as `{{current_ctc}}`, `{{expected_ctc}}`, `{{notice_period}}`
and `{{phone}}`. After generation, the backend substitutes the real values from my private
settings table. This means:
- The LLM can never hallucinate a wrong salary figure.
- My CTC and phone number are never sent to the LLM provider.
- If a value is not set in my settings, the placeholder stays highlighted in the editor
  so I fill it in manually.

**Missing facts.** If the email asks for something not in the context, the draft must say I
will confirm and get back, rather than guessing.

**Output.** Save the draft in Supabase and as a real Gmail draft in the correct thread
(`threadId`, `In-Reply-To` and `References` headers set).

---

### 5. Application tracker

- When I click **Mark as Applied** on a job, create an application record
  (company, role, portal, link, applied date, status `applied`).
- When an `application_update` email arrives, match it to an existing application by
  company and role, and update the status (`viewed`, `shortlisted`, `interview`, `rejected`, `offer`).
- Interview scheduling emails link to their application and move it to `interview`.
- Dashboard shows a pipeline view: Applied → Viewed → Interview → Offer / Rejected.

---

### 6. Knowledge base (Supabase + pgvector)

Contains only information I am comfortable sharing with recruiters:
- Resume content
- Project write-ups (portfolio-level detail only)
- Job preferences: target roles, preferred locations, relocation, availability for calls
- FAQ answers to common recruiter questions

Each document is chunked, embedded and stored with pgvector. Provide an admin page to
upload or edit KB documents and re-embed them.

Sensitive values (CTC, phone number, notice period) live in a separate private settings
table, NOT in the KB, and are only used for placeholder substitution.

---

### 7. Authentication (Google login, owner only)

- Login with Google through Supabase Auth (Google provider). No passwords.
- **Google login alone is not enough:** anyone with a Google account can sign in. Access
  must be restricted to one allowlisted email, `OWNER_EMAIL`, set as an environment variable.
- Enforce the allowlist in three layers:
  1. **Frontend:** after login, if the email is not `OWNER_EMAIL`, sign out immediately and
     show "Access denied". This is for user experience only, not security.
  2. **Backend:** every FastAPI endpoint verifies the Supabase JWT (signature and expiry) and
     checks that its email claim equals `OWNER_EMAIL`, returning 403 otherwise. This is the
     real security boundary.
  3. **Database:** Row Level Security (RLS) on every Supabase table so only the owner can
     read or write. The frontend never uses the Supabase service-role key.
- If Supabase allows it, disable new sign-ups after the owner account is created.
- **Login and Gmail access are separate.** Google login only proves who I am
  (`openid email profile` scopes). Connecting Gmail is a separate "Connect Gmail" step handled
  by the backend, which requests the Gmail scopes with offline access and stores the refresh
  token encrypted. The background worker needs Gmail access even when I am not logged in,
  which is why this must live on the backend.
- The connected Gmail account must be the same as `OWNER_EMAIL`; reject any other account.
- Logout button, and session refresh handled by the Supabase client.
- Public demo routes never call authenticated endpoints and only read a separate seeded
  demo dataset.

### 8. Dashboard (frontend)

**Private mode (me):** Google login, owner only (see Authentication). Every page except the
landing page and the public demo requires login.
- **Home:** today's stats (new job alerts, jobs extracted, top match score, drafts waiting,
  applications by status).
- **Job Digest:** ranked jobs with match reasons and actions.
- **Reply Inbox:** recruiter emails needing replies. For each: the thread, the AI draft
  (placeholders highlighted), an editor, and buttons for **Approve & Send**, **Save edit** and **Reject**.
- **Feedback on every reply:** when I click **Approve & Send** or **Reject**, a feedback form
  appears with a 1–5 star rating and a textual feedback box. The rating is required. Text
  feedback is required when the rating is 3 or below, so weak drafts always get an
  explanation. The action completes only after the feedback is submitted.
- **Applications:** tracker pipeline view.
- **Insights:** skill-gap chart, jobs per portal, average match score over time,
  average draft rating over time, percentage of drafts sent without edits.
- **Settings:** preferences, rules, private values, KB management.

**Public demo mode (for recruiters and portfolio visitors):**
- A "Try the demo" button on the landing page, no login needed.
- Uses seeded **fake** data only (sample job alerts, sample recruiter emails, sample drafts),
  never my real inbox.
- Read-only. All send / approve actions are disabled with a tooltip explaining that real
  sending requires the owner's login.
- This is how anyone can see the product working, since my real dashboard is private.

**Design:** clean, modern and mobile-friendly. Dark and light mode. Make the match score
and skill-gap insights visually prominent, because they are the most eye-catching features.

---

### 9. Storage (Supabase)

Suggested tables (adjust as needed):
- `emails`, `threads`: raw incoming emails, category, priority, status
- `jobs`, `job_sources`: extracted, deduplicated jobs and which portals they came from
- `job_matches`: score, reason, method (embedding / LLM), my action (applied / not interested / saved)
- `drafts`: original AI draft, final sent version, status
  (`drafted → approved → sent` or `rejected`)
- `feedback`: one row per draft: `draft_id`, star rating (1–5), text feedback, action
  taken (`sent` / `rejected`), whether I edited the draft, `created_at`
- `applications`: application tracker with status history
- `kb_documents`, `kb_chunks`: knowledge base with embeddings
- `preferences`, `rules`, `private_settings`

### 10. Feedback loop

- After every 10 rated drafts, use the LLM to summarize my recent edits and comments into
  an updated writing-preferences document.
- Use my highest-rated sent replies as few-shot examples.
- When I mark jobs as **Not Interested**, store the reason (optional) and use those
  patterns to adjust hard filters over time.

---

### 11. Tech stack

- **Backend:** Python, FastAPI, background worker for Gmail polling and LLM jobs.
  Deployed on **Railway**.
- **Frontend:** Next.js, deployed on **Vercel**.
- **Database:** Supabase (Postgres + pgvector + Auth).
- **LLM:** Gemini API (free tier) as primary, OpenAI optional, behind a provider-agnostic
  interface. Gemini supports an OpenAI-compatible endpoint, so switching is a config change.
- **Google Cloud Console:** OAuth client and Gmail API.
- **GitHub:** code hosting, plus GitHub Actions CI (lint + tests on every push).
- **Docker:** Dockerfile for the backend, and docker-compose for local development.

### 12. Implementation process (follow this strictly)

Work in phases. For EVERY phase, follow these steps in order and do not skip ahead:

1. **Plan.** Write a short plan: the goal, files to create or change, database tables and
   migrations, API endpoints, environment variables, tests, and anything I must set up
   manually (for example Google Cloud Console or Supabase dashboard steps).
2. **Ask my preferences.** List the decisions that are mine to make for this phase as
   numbered questions, with your recommended option for each. Then STOP and wait for my answers.
3. **Execute.** Implement only that phase, following my answers.
4. **Verify.** Run the tests, then give me a short summary of what was built and step-by-step
   instructions to test it manually.
5. **Stop.** Wait for my confirmation before starting the next phase.

Never implement more than one phase in one go. If the plan needs to change during
execution, tell me before continuing.

**Phases:**

- **Phase 1: Setup and authentication.** Repo structure, FastAPI and Next.js skeletons,
  Supabase project, Google login with the owner allowlist (all three layers), RLS, CI with lint
  and tests, backend Dockerfile, and a first deployment of the skeleton to Vercel and Railway.
  *Example questions:* one repo or two? Python package manager (pip, poetry or uv)?
  Next.js App Router or Pages Router?
- **Phase 2: Gmail connection, ingestion and classification.**
  *Example questions:* polling interval? how many days back on the first sync? which
  senders count as job portals?
- **Phase 3: Pipeline A (job digest).**
  *Example questions:* experience range, preferred locations, excluded keywords, how many
  jobs to show per day?
- **Phase 4: Pipeline B (reply drafts), review editor, send, and feedback on every reply.**
  *Example questions:* tone and sign-off, which placeholders I need, whether text feedback
  should be required for every rating?
- **Phase 5: Application tracker and feedback loop.**
- **Phase 6: Insights page, public demo mode, README polish and final deployment.**

---

## EXAMPLES

Store sample emails in `examples/` (real emails with personal details removed).
They are also used to seed the public demo.

1. **Job alert (Naukri)**: an email listing 6 jobs, e.g. "Python Developer – Noida – 2–5 yrs".
   → Category `job_alert`. Extract all 6 jobs, deduplicate against existing jobs, score them,
   and show them in the digest.

2. **Same job from LinkedIn**: a LinkedIn alert containing one of the same jobs.
   → Merged into the existing job, with both portals listed as sources.

3. **Recruiter outreach**: "Hi Sagar, we have a Python Backend role in Gurgaon. Please share
   your current CTC, expected CTC, notice period and updated resume."
   → Category `recruiter_outreach`. Draft uses `{{current_ctc}}`, `{{expected_ctc}}` and
   `{{notice_period}}` placeholders, location preference from the KB, and mentions the resume.

4. **Interview scheduling**: "Can you join a technical round on Thursday at 3 PM?"
   → Category `interview_scheduling`, priority high. Draft proposes availability from my
   preferences but never confirms a slot on its own. Linked application moves to `interview`.

5. **Application update**: "Your application for Backend Engineer at X was viewed."
   → Category `application_update`. Matching application status changes to `viewed`.

6. **Scam email**: "Pay a registration fee of ₹2,000 and send your Aadhaar to confirm your
   interview."
   → Category `suspicious`. Flagged in red. No draft.

7. **Unrelated role**: a recruiter reaching out for a role clearly outside my target stack.
   → Short, polite decline that mentions my target roles.

## DOCUMENTATION

- Gmail API: https://developers.google.com/gmail/api
- Gmail API Python quickstart: https://developers.google.com/gmail/api/quickstart/python
- Gemini API: https://ai.google.dev/gemini-api/docs
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Supabase AI and vectors (pgvector): https://supabase.com/docs/guides/ai
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Login with Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- FastAPI: https://fastapi.tiangolo.com
- Next.js: https://nextjs.org/docs
- Railway: https://docs.railway.com
- Vercel: https://vercel.com/docs
- BeautifulSoup: https://www.crummy.com/software/BeautifulSoup/bs4/doc/

## OTHER CONSIDERATIONS

**Safety and human-in-the-loop**
- Never auto-send emails and never auto-apply to jobs. No browser automation of job portals,
  since their terms restrict bots and automated access and this could get my accounts restricted.
- Do not scrape job portal pages. Use only the information inside the emails, plus job
  descriptions I paste manually.

**Prompt injection**
- Email content is untrusted. Wrap it in delimited tags, instruct the model to treat it as
  data only, and give the LLM no tools that can send, forward or delete anything.

**Hard rules enforced in code, not only in the prompt**
- Never send to an address that is not already part of the thread.
- Never draft replies for `suspicious` emails.
- Sensitive values are only inserted by placeholder substitution, never generated by the LLM.
- Never confirm an interview slot automatically.
- The background worker has no code path that sends email. Sending happens only through
  an authenticated owner request for a specific `draft_id`, after feedback is submitted.

**Reliability**
- Idempotency via Gmail `message_id` and job dedup hashes. A worker restart must never
  create duplicate jobs, drafts or emails.
- The Gemini free tier has low rate limits: use a queue, retries with exponential backoff,
  and handle HTTP 429 gracefully. Use the LLM only where rules and embeddings are not enough.
- While the Google OAuth app is in "Testing" status, add my Gmail as a test user.
  Refresh tokens expire after about 7 days in this mode, so handle re-authentication cleanly
  and show a "Reconnect Gmail" banner instead of crashing.

**Security**
- All keys in environment variables, never committed. Provide a `.env.example`.
- Store Google OAuth tokens encrypted at rest.
- CORS on the Railway backend allows only my Vercel frontend domain.
- Public demo mode must have no access to real data or real Gmail credentials.

**Privacy**
- On the free tier, prompts may be used by the provider to improve their products.
  Only put information in the KB that I would be comfortable sharing with a recruiter.

**Testing**
- Unit tests for: classifier output parsing, each portal parser, job deduplication,
  placeholder substitution, quote stripping and the idempotency check.
- Evaluation script: run the classifier and extractor on the `examples/` emails and report
  accuracy, so I can measure improvements over time.

**README (important: recruiters will read this first)**
- One-line pitch and a short demo GIF at the top.
- Live demo link (public demo mode).
- Architecture diagram (Mermaid) of both pipelines.
- "Key engineering decisions" section: human-in-the-loop, placeholder substitution for
  sensitive values, hybrid parser + LLM extraction, prompt-injection defence, idempotency,
  rate-limit handling.
- Metrics section with real numbers once available, e.g. jobs extracted, duplicates merged,
  classification accuracy, percentage of drafts sent without edits.
- Setup instructions, tech stack, and CI badge.