---
name: coart-platform
description: >
  Everything about the coart platform (coart.vercel.app) — architecture,
  Supabase setup, Vercel deployment, Google login, local development, and
  recipes for common changes. Use this skill whenever working on any part
  of the coart codebase: front-end pages (index/founder/backer.html), the
  Fastify backend under backend/, deployments, auth, notifications, the
  database, or debugging production issues.
---

# coart — Platform Guide

Two-sided platform for young Singapore founders (founders ↔ backers).
Live at **https://coart.vercel.app**. Repo: **github.com/jaslyntay/coart**, branch `main`.
Every push to `main` auto-deploys front-end + backend together (~60–90s).

## Architecture (one picture)

```
Browser (static HTML pages, no framework)
  index.html    login (Google OAuth + email magic link)
  founder.html  founder dashboard (projects, grants, applications, profile)
  backer.html   backer dashboard (discover, our grants, post-a-grant, org profile)
  apply.html    LEGACY — unreferenced, ignore
        │  fetch /api/v1/... with Supabase JWT (Authorization: Bearer)
        ▼
Vercel Serverless Functions (same project, api/ directory)
  api/[s1].ts … api/[s1]/[s2]/[s3]/[s4].ts   ← one re-export per URL depth
        │  (bare Vercel api/ routing has NO catch-all — this is why)
        ▼
  backend/src/vercel.ts → backend/src/app.ts  (Fastify app, all routes)
        │  service-role client (bypasses RLS) or user-JWT client (RLS applies)
        ▼
Supabase (project ref vbnztpgnnkhpoxxkchkd, Singapore region)
  Postgres + Auth (Google OAuth, magic link) + Storage (avatars bucket)
```

- Frontend JS convention: each page has an `api(path, opts)` helper that
  attaches the session JWT. In local dev without a session it falls back to
  the `X-Dev-User` header (see Local development).
- Backend routes live in `backend/src/routes/*.ts`, validation schemas in
  `backend/src/schemas/index.ts`, auth middleware in `backend/src/auth.ts`,
  notifications helper in `backend/src/notify.ts`, image uploads in
  `backend/src/storage.ts`.

## Who owns what (accounts)

| Thing | Where | Owner |
|---|---|---|
| GitHub repo | github.com/jaslyntay/coart | Jaslyn (Shivani is collaborator) |
| Vercel project + env vars + deploy logs | vercel.com → coart | **Jaslyn** (jaslyntay04 account) |
| Supabase project (DB, auth, storage) | supabase.com → "shivanicc's Project" | **Shivani** |
| Google OAuth client (login) | console.cloud.google.com → project "coart" | whoever created it (see Google login) |
| Anthropic API key (AI drafting) | console.anthropic.com | Shivani |

Secrets live in two places only: `backend/.env` locally (gitignored, created
from `backend/.env.example`) and Vercel → Settings → Environment Variables
(SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
ANTHROPIC_API_KEY, CORS_ORIGINS). **Never commit .env.**

## Data model (tables that matter)

`profiles` (user id + role: founder/backer) → `founders` (profile fields,
general application = bio/focus_areas/past_experience/community/
typical_budget, contact_email/contact_phone, profile_photo_url) and
`organizations` + `backer_members` (backer side, contact_* + logo_url).
`projects` (founder's projects, status draft/active/archived).
`grants` (+ `grant_questions`) — both curated/seeded and backer-posted.
`applications` (+ `application_answers`) — founder × project × grant,
status: draft → submitted → in_review/shortlisted → backed/rejected.
`notifications` — in-app notifications per user.
`profile_views`, `founder_saved_grants`, `contact_requests`, `backings`.

Schema source of truth: `backend/db/schema.sql` (+ columns added later via
dashboard SQL — see Migrations below).

**Contact privacy rule:** founders' and orgs' contact_* fields are stripped
from every public endpoint and revealed to the other party ONLY when an
application reaches status `backed` (enforced in routes, plus column-level
REVOKEs from the anon role in SQL).

## Auth

- **Google login**: Supabase Auth → Sign In/Providers → Google, using an
  OAuth client from Google Cloud console (redirect URI
  `https://vbnztpgnnkhpoxxkchkd.supabase.co/auth/v1/callback`).
- **Magic link**: enabled by default; Supabase built-in SMTP is rate-limited
  to a few emails/hour — Google is the primary path.
- Redirect allowlist (Supabase → Auth → URL Configuration): Site URL
  `https://coart.vercel.app`, redirect URLs `https://coart.vercel.app/**`
  and `http://localhost:8000/**`.
- After first login users pick founder/backer (onboarding modal in
  founder.html) → `POST /auth/profile`. "Switch role" in the sidebar calls
  `DELETE /auth/profile` to reset. Role routing: founder.html redirects
  backers to backer.html and vice versa via `GET /auth/me`.
- **Dev bypass**: in development only, requests with header
  `X-Dev-User: <uuid>` skip JWT verification (backend/src/auth.ts). The
  dev founder uuid is in backend/.env as DEV_FOUNDER_ID. Verified rejected
  in production.

## Local development

```bash
cd backend && npm install && npm run dev     # API on :3001
cd .. && python3 -m http.server 8000         # front-end on :8000  (MUST be 8000 — CORS)
open http://localhost:8000/founder.html      # auto-signed-in as dev founder
```

Gotchas:
- supabase-js needs Node ≥22 (WebSocket). If your shell defaults to Node 20,
  prefix commands: `PATH=/opt/homebrew/opt/node@23/bin:$PATH ...` or shim
  `globalThis.WebSocket = class {};` before importing supabase code in scripts.
- Scripts in `backend/scripts/`: `seed-dev-founder.ts`, `seed-grants.ts`
  (curated grants catalogue, idempotent), `seed-test-backer.ts` (+ --cleanup),
  `setup-storage.ts` (avatars bucket), `test-real-auth.ts` and
  `test-backer-answers.ts` (E2E smoke tests; API_BASE env var targets
  local or prod).

## Deploying

`git push origin main` → Vercel builds and deploys everything. Verify with:
- `https://coart.vercel.app/api/healthz` → `{"ok":true,"env":"production"}`
- Deploy status without dashboard access:
  `gh api repos/jaslyntay/coart/commits/<sha>/status`

Gotchas:
- Clicking **Redeploy** in the Vercel dashboard re-deploys an OLD build and
  can resurrect stale code. Fix: push a new commit (empty is fine:
  `git commit --allow-empty -m "redeploy" && git push`).
- Right after a deploy, the CDN can serve mixed old/new responses for
  ~1–2 minutes. Wait before concluding something is broken.
- Env var changes in Vercel only apply to NEW deployments — push after
  changing them.

## Supabase operations

- **Read data**: dashboard → Table Editor (rows), Authentication → Users
  (signups), SQL Editor (queries).
- **Migrations (adding columns/tables)**: the service key cannot run DDL.
  Paste SQL in the dashboard SQL Editor. Keep `backend/db/schema.sql`
  updated to match so the file stays the source of truth.
- **Free-tier auto-pause**: after ~7 idle days the project pauses and its
  DNS disappears (login dies, `ENOTFOUND`). Dashboard → Restore project
  (~2 min). Real traffic prevents it; upgrade to Pro ($25/mo) to remove.
- **No backups on free tier** — export important tables as CSV occasionally.

## Notifications

In-app: `notifications` table; helper `notify()` / `notifyOrgMembers()` in
backend/src/notify.ts; bell UI in both dashboards polls `GET /notifications`.
Events wired: application submitted (→ org members), shortlisted (→ founder),
backed (→ founder, announces contact reveal), contact request / grant invite
(→ founder). To add a new type: call `notify()` at the event site — the UI
needs no changes.

Email notifications: wired. `notify()` also emails the recipient's login
address via Resend (from notifications@coartsg.com — domain verified in
Resend, DNS at Porkbun under Shivani's account). Needs RESEND_API_KEY,
RESEND_FROM_EMAIL, and SITE_URL env vars (in backend/.env locally and in
Vercel for production). Addresses ending in .test are skipped (fixtures).

## AI drafting

`POST /ai/draft-field {application_id, question_key}` → Claude (model in
backend/.env, key = ANTHROPIC_API_KEY). Wired to the "✦ AI Draft" buttons in
the application modal for grants with structured questions. Costs cents per
call; usage at console.anthropic.com.

## Common recipes

- **New API endpoint**: add route in `backend/src/routes/<module>.ts` (or a
  new module registered in `app.ts` with prefix `/api/v1/<name>`). Zod
  schema for the body in schemas/index.ts. If the URL is deeper than 4
  segments after /api, add another `api/[s1]/.../[s5].ts` re-export file.
- **New founder/org field**: SQL column (dashboard) → zod schema → front-end
  form → keep schema.sql in sync. If the field is private, strip it in the
  public endpoints (see contact fields for the pattern).
- **Change the curated grants**: edit `backend/scripts/seed-grants.ts`; it
  skips grants whose reference_code already exists (delete the row first to
  re-seed one).
- **Debug a prod issue**: reproduce locally first (`npm run dev` + :8000);
  browser devtools network tab for the failing call; Vercel runtime logs
  need Jaslyn's dashboard.

## Known gaps / roadmap

- Site domain coartsg.com bought (Porkbun, Shivani) — Vercel connection
  pending (Jaslyn adds it in Settings → Domains; then update Supabase
  redirect URLs, Google OAuth origins, CORS_ORIGINS, SITE_URL).
- Google consent screen shows the supabase.co
  domain until Supabase Pro + custom auth domain (~$35/mo) — cosmetic.
- Magic-link email rate limit (~2–4/hour) until custom SMTP.
- No "rejected" notification (deliberate); no application withdrawal UI;
  no editing posted grants beyond open/close.
