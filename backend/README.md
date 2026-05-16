# Coart Backend

Backend API for Coart — Singapore's discovery platform connecting young founders with backers and grants.

The frontend lives in a separate repo: [jaslyntay/coart](https://github.com/jaslyntay/coart) (static HTML on Vercel).

## What this is

A Fastify + TypeScript service that:

- Stores founders, projects, grants, organisations, applications, and answers in Postgres (hosted by Supabase).
- Verifies user JWTs issued by Supabase Auth.
- Calls Claude (Anthropic) for three AI features: single-field autofill, the chat-based application flow you see on `apply.html`, and a memory layer that lets the same project autofill across different grants.
- Handles two types of grants: internal (posted by a backer org on Coart) and external (curated, founder submits via the org's own portal or email).

See `ARCHITECTURE.md` for the full data model and endpoint list — every table is annotated with which frontend page reads or writes it.

## Prerequisites

Before you can run this locally, you need three things:

**1. Node.js 20 or higher.** Check with `node -v`. If you don't have it, install via [nvm](https://github.com/nvm-sh/nvm).

**2. A Supabase project.** Free tier is fine. Go to [supabase.com](https://supabase.com), create a new project, and grab three values from Settings → API:
- Project URL
- `anon` public key
- `service_role` secret key (keep this safe, never commit it)

Then open the SQL Editor in your Supabase dashboard, paste in the contents of `db/schema.sql`, and run it. That creates every table.

**3. An Anthropic API key.** Sign up at [console.anthropic.com](https://console.anthropic.com), create a key. Free credits get you through development.

## Local setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in the values in .env from Supabase + Anthropic
npm run dev
```

The server starts on `http://localhost:3001`. Test it with:

```bash
curl http://localhost:3001/healthz
# → {"ok":true,"env":"development"}
```

## Connecting the frontend

In your friend's HTML files (apply.html, founder.html, backer.html), add a JavaScript file that talks to this backend. For example:

```html
<script type="module">
const API = 'http://localhost:3001/api/v1'; // change to your deployed URL in prod
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // from supabase-js

async function fetchMyProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const res = await fetch(`${API}/founders/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  return res.json();
}
</script>
```

On your backend `.env`, make sure `CORS_ORIGINS` includes the frontend URL (e.g. `http://localhost:3000,https://coart.vercel.app`).

## Deploying

For MVP, the simplest path is **Railway**:

1. Push this `backend/` folder to a new GitHub repo (e.g. `coart-backend`).
2. Sign up at [railway.app](https://railway.app), connect the repo.
3. Add the environment variables from `.env` to Railway's Variables tab.
4. Railway auto-detects Node and deploys. You'll get a `*.up.railway.app` URL.
5. Update your frontend's `API` constant to point there, and add the Railway URL to `CORS_ORIGINS`.

Alternatives: [Fly.io](https://fly.io), [Render](https://render.com). All are similarly priced (~$5/month for a small service).

## What's done

- Database schema with row-level security (Supabase RLS) so users can only access their own data.
- Auth profile creation endpoint (creates founder OR backer + organisation on first login).
- Full founder CRUD + dashboard stats + public discovery (with filters).
- Project CRUD.
- Grants list/detail/post + per-grant question schemas.
- Application flow: create draft, save answers, submit (internal grants), confirm submission (external grants with email/copy/portal).
- Backer side: see applicants, update status, shortlist, back.
- AI: single-field draft, chat conversation that fills the right-panel fields, memory extraction after submission.
- Contact request (Request a Call) — stored in DB, no delivery yet.

## What's deferred (per Jaslyn's WhatsApp notes)

These are stubbed or unimplemented. The schema and routes are designed so they can be added without breaking changes.

- **Email delivery for external grant submissions** — currently we record `external_confirmation_method: 'email_sent'` but don't actually send the email. Wire up Resend in `applications.ts → submit-external` to make it real. Took 30 minutes when I prototyped it; left out for now.
- **Backer ↔ founder messaging** — `contact_requests` table exists, but no actual notifications, scheduling integration, or inbox UI.
- **File uploads** (pitch decks, profile photos) — schema has the URL columns; you need to add a `POST /uploads` route that gets a signed upload URL from Supabase Storage.
- **Grant matching by ML** — current matching is simple overlap on `focus_areas` + age eligibility. Good enough for MVP, swap in something smarter when you have data.
- **View-count debouncing** — currently every GET on a founder profile inserts a `profile_views` row. Add a 1/day/viewer debounce before this gets noisy.
- **Background workers** — `extract-memory` is called inline. For prod, move it to a background job (Supabase Edge Functions, or a Trigger.dev / Inngest worker).
- **Tests.** None yet. Add Vitest + a small integration test per route once the shape stabilises.

## Assumptions worth verifying

Before going far, push back on me if any of these are wrong:

1. The backend is in `/Users/shivanicc/Documents/Claude/Projects/coart/backend/`. When you push this to GitHub it should be its own repo, separate from the frontend, with this folder's contents at the root.
2. Singapore-based Supabase region. When you create the Supabase project, pick **Southeast Asia (Singapore)** to keep latency low for your users.
3. Founder roles only allow one founder identity per Supabase user. If a founder also wants to act as a backer, they'd need a separate account. (Worth revisiting later.)
4. External grants are seeded by you/Coart team, not posted by an organisation account. So someone with admin access to the DB needs to insert rows into `organizations` (with `is_external=true`) and `grants` for NEA, NYC, SIF, NAC etc. I'd write a `db/seed.sql` next.
5. The applications-related backer permissions are enforced at the service layer (not RLS). That's pragmatic — RLS for cross-org-owned-grant queries gets gnarly fast. If you want RLS-only enforcement, we'd add a security-definer function.

## Folder layout

```
backend/
├── ARCHITECTURE.md          The source-of-truth schema + endpoint doc
├── README.md                (you are here)
├── package.json
├── tsconfig.json
├── .env.example             Copy to .env and fill in secrets
├── .gitignore
├── db/
│   └── schema.sql           Run this in Supabase SQL editor
└── src/
    ├── index.ts             Fastify entry — wires up routes
    ├── config.ts            Env loader with required-var checks
    ├── db.ts                Supabase admin + per-user clients
    ├── ai.ts                Anthropic client + system prompts
    ├── auth.ts              JWT verification middleware
    ├── schemas/
    │   └── index.ts         Zod input validation
    └── routes/
        ├── auth.ts          Profile creation post-signup
        ├── founders.ts
        ├── projects.ts
        ├── grants.ts
        ├── applications.ts
        ├── organizations.ts
        └── ai.ts            draft-field, chat, extract-memory
```

## Working with Claude Code from here

The architecture doc + this README give you everything you need to keep building. When you fire up Claude Code in this folder, useful starter prompts:

- "Read ARCHITECTURE.md and tell me which features are still missing compared to what the frontend HTML needs."
- "Add a `db/seed.sql` that seeds the four external orgs (NEA, NYC, SIF, NAC) and their grants based on the data in `../founder.html`."
- "Wire up Resend in `src/routes/applications.ts → submit-external` so when method is email_sent, we actually email the grant's `external_submission_email`."
- "Write a Vitest test for the chat endpoint that mocks Anthropic and verifies it upserts answers correctly."

Don't ask Claude Code to do all of it at once. One slice at a time, review the diff, run the dev server, test the endpoint with curl.
