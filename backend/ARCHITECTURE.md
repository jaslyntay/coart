# Coart Backend — Architecture

This document is the source of truth for the Coart backend. Every table, column, and endpoint here is derived directly from what the frontend HTML (apply.html, backer.html, founder.html, index.html) reads or writes.

If something here doesn't match what your frontend actually does, this doc is wrong — fix it first, then code.

---

## Assumptions

Before reading further, here's what we've decided. Push back on any of these if they're wrong.

1. **Stack**: Node.js + TypeScript + Fastify on the backend. Supabase (hosted Postgres) for database, auth, and file storage. Anthropic API (Claude) for AI features.
2. **Hosting**: Backend deploys to Railway or Fly.io. Frontend stays on Vercel as static HTML. The two communicate over HTTPS with CORS configured.
3. **Frontend stays as static HTML**. Each `.html` page makes `fetch()` calls to the backend. No framework migration is assumed.
4. **Two user types**: `founder` (individual, ages 15–25) and `backer` (a person representing an organisation). One Supabase auth user → one role on Coart.
5. **Grants come in two flavours**:
   - **Internal grants** — posted by a backer org on Coart via the "Post A Grant" form. Applications happen inside Coart.
   - **External grants** — curated by Coart (NEA, NYC, SIF, NAC). The granting organisation does NOT have a Coart account. Coart shows the listing with an AI-assisted draft tool, then either deep-links to the organisation's official portal OR emails the draft on the founder's behalf.
6. **Application questions are per-grant**. The default form has 3 questions, the NEA 3R Fund has 5 specific ones, the chat-based apply.html flow produces 6 fields. So each grant stores its own question schema (JSON), and applications store answers keyed against those question IDs.
7. **The "AI memory" feature** = a founder's profile + per-project "idea blocks" (a structured summary of the project's pitch, problem, beneficiaries, outcomes) that are used as context whenever the AI drafts or autofills for that project across different grants. Stored in `ai_memory_blocks`.
8. **Deferred to post-MVP** (per Jaslyn's WhatsApp): backer ↔ founder messaging, scheduling calls, email shortlist notifications. The frontend has UI for these (Request a Call panel, shortlist button). For MVP, those buttons can write to a `contact_requests` table that we'll process later — no actual messaging/scheduling integration today.

---

## Data Model

Each section gives the table, the columns, and a list of which frontend pages read or write it.

### `users` (managed by Supabase Auth)

Supabase provides `auth.users` with id, email, encrypted password. We layer a single `role` column on top via the `profiles` table below.

### `profiles`

Bridges Supabase auth users to a Coart role.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | references `auth.users(id)` |
| `role` | enum('founder', 'backer') | required at signup |
| `created_at` | timestamptz | default now() |

Pages that read this: every authenticated page, to determine which dashboard to load.

### `founders`

One row per founder user. Maps to founder.html → Profile page.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | references `profiles(id)` |
| `full_name` | text | required |
| `age` | int | required (validation: 15–25) |
| `university` | text | e.g. "National University of Singapore" |
| `field_of_study` | text | e.g. "Arts & Sustainability" |
| `location` | text | e.g. "Singapore" or "Tiong Bahru, Singapore" |
| `bio` | text | shown in profile + featured cards |
| `focus_areas` | text[] | e.g. ['Arts', 'Sustainability', 'Community'] — used as filter tags |
| `profile_photo_url` | text | optional — stored in Supabase Storage |
| `linkedin_url` | text | optional |
| `past_experience` | text | optional |
| `open_to_backers` | bool | default true — toggles "Open To Backers" tag |
| `seeking_grant_match` | bool | default false — toggles "Seeking Grant Match" tag |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | auto-update |

Frontend uses:
- founder.html sidebar (name, university, field), Profile page (all fields), Dashboard top bar
- backer.html Discover Founders grid (avatar initials, name, uni, bio, focus_areas tags), Featured card
- founder profile modal in backer.html (full bio, project list)

Computed (not stored): `profile_completion_pct` — derived at read time from which optional fields are filled. The "72%" badge in founder.html sidebar.

### `organizations`

One row per backer organisation. Posted-by-backer orgs have an associated user; curated external orgs (NEA, NYC, SIF, NAC) have NO user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. "Tiong Bahru Youth Network" |
| `type` | enum('community', 'government', 'corporate', 'foundation', 'accelerator', 'other') | matches grant filter pills |
| `location` | text | |
| `description` | text | |
| `focus_areas` | text[] | |
| `is_external` | bool | true = curated, no Coart account |
| `external_url` | text | for external orgs — link to their grants page |
| `logo_url` | text | optional |
| `created_at` | timestamptz | |

### `backer_members`

Joins a backer user to an organisation (so multiple people from one org could log in).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | references `profiles(id)` where role='backer' |
| `organization_id` | uuid | references `organizations(id)` |
| `role` | enum('admin', 'member') | for future permissions, default 'member' |
| `created_at` | timestamptz | |

Frontend uses:
- backer.html sidebar (org name, type, location)
- Organisation Profile page (all org fields)

### `projects`

A founder's project/idea. A founder can have multiple. Maps to founder.html → My Projects.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `founder_id` | uuid | references `founders(id)` |
| `title` | text | e.g. "Unwoventhread" |
| `tagline` | text | one-line summary shown on cards |
| `description` | text | longer prose |
| `format` | enum('solo', 'team', 'social_enterprise', 'startup') | "Format" from apply form |
| `stage` | enum('idea', 'planning', 'building', 'has_users') | "Stage" from apply form |
| `focus_areas` | text[] | project-level tags (Arts, Environment, etc.) |
| `status` | enum('draft', 'active', 'archived') | default 'draft' |
| `view_count` | int | denormalised counter, incremented on profile views |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Frontend uses:
- founder.html My Projects page (all fields), Dashboard project cards
- backer.html founder modal "Active Project" preview
- apply.html "which project is this application for?" dropdown

### `grants`

One row per grant — both internal (posted by a backer org) and external (curated).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | references `organizations(id)` |
| `reference_code` | text | e.g. "NYC-NYF-2025", "TBYN-CIG-2025" — used in UI grant-ref line |
| `title` | text | e.g. "National Youth Fund" |
| `grant_type` | enum('cash', 'mentorship', 'incubation', 'mixed', 'resource', 'scholarship') | from Post A Grant form |
| `amount_display` | text | free-text — "Up to S$5,000", "Up to 80% project cost" |
| `amount_min` | int | optional, in SGD, for filtering |
| `amount_max` | int | optional, in SGD, for filtering |
| `value_description` | text | longer description shown on the grant card |
| `difficulty` | enum('easy', 'moderate', 'selective') | shown in grant-ref line |
| `focus_areas` | text[] | tags used for matching |
| `application_opens_at` | date | nullable for rolling grants |
| `application_closes_at` | date | nullable for rolling grants |
| `is_rolling` | bool | "Rolling Deadline" |
| `frequency` | text | "Annually", "Rolling / ongoing", etc. |
| `eligibility_age_min` | int | default 15 |
| `eligibility_age_max` | int | default 25 |
| `eligibility_stage` | text | "Any stage welcome" etc. |
| `eligibility_citizenship` | text | "Open to all residents" etc. |
| `eligibility_team_solo` | text | "Both welcome" etc. |
| `eligibility_exclusions` | text | "Anything you are NOT looking to fund" |
| `offering_description` | text | "Describe what you are offering" |
| `expectations` | text | "What do you expect from funded founders?" |
| `engagement_style` | text | |
| `response_time` | text | |
| `application_instructions` | text | "What should founders submit?" |
| `has_pitch_round` | bool | |
| `pitch_format` | text | |
| `pitch_prep` | text | |
| `decision_timeline` | text | "Within 4 weeks" etc. |
| `notification_method` | text | |
| `is_external` | bool | true = external portal, no Coart application |
| `external_portal_url` | text | for external grants — where founders go to actually submit |
| `external_submission_email` | text | for external grants like NEA 3R that accept email submissions (e.g. WM_Fund@nea.gov.sg) |
| `external_submission_note` | text | the orange "How This Works" note shown in the apply modal |
| `status` | enum('draft', 'active', 'closed') | |
| `view_count` | int | |
| `application_count` | int | denormalised |
| `created_at` | timestamptz | |

Frontend uses:
- founder.html Featured Grants (dashboard), Explore Grants page (with filters), apply.html top bar
- backer.html Our Grants page (each grant block), Post A Grant form (writes all these fields)

### `grant_questions`

The per-grant question schema. Each grant has its own list of questions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `grant_id` | uuid | references `grants(id)` |
| `question_key` | text | stable identifier — e.g. "impact", "funding_use", "nea3r-tonnage" |
| `label` | text | shown above the textarea |
| `placeholder` | text | input placeholder |
| `help_text` | text | optional |
| `field_type` | enum('short_text', 'long_text', 'number', 'select', 'file') | |
| `options` | jsonb | for select type — array of options |
| `required` | bool | default true |
| `order_index` | int | sort order |
| `ai_draft_hint` | text | system prompt fragment used by the AI when drafting this field |

Frontend uses:
- founder.html grant application modal (renders default OR custom fields based on grant), apply.html (uses the grant's question list to determine the panel on the right)

### `applications`

One row per (founder, grant) attempt. Soft-deleted on withdrawal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `founder_id` | uuid | references `founders(id)` |
| `project_id` | uuid | references `projects(id)` |
| `grant_id` | uuid | references `grants(id)` |
| `status` | enum('draft', 'submitted', 'in_review', 'shortlisted', 'backed', 'rejected', 'withdrawn') | |
| `submitted_at` | timestamptz | nullable |
| `external_confirmation` | bool | for external grants — did the founder confirm they submitted to the org? |
| `external_confirmed_at` | timestamptz | when the founder confirmed |
| `external_confirmation_method` | enum('email_sent', 'manual_copy', 'portal_redirect') | how the external submission happened |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Frontend uses:
- founder.html Dashboard "Active Projects" status, founder profile modal in backer.html (status badge), Backers page (which orgs have engaged)
- backer.html Our Grants applicant table (status badges: New / In Review / Shortlisted / Backed)
- apply.html final submit

### `application_answers`

The actual content of each application. Keyed by question.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `application_id` | uuid | references `applications(id)` |
| `question_key` | text | matches `grant_questions.question_key` |
| `value` | text | the answer (free-text) |
| `ai_drafted` | bool | was this drafted by AI, then accepted/edited by the founder? |
| `source` | text | e.g. "from your profile", "from your answers", "coart research" — shown in apply.html |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Index: (`application_id`, `question_key`) unique.

### `ai_memory_blocks`

The "memory" Jaslyn described — extracted facts about a project that get reused across grant applications.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid | references `projects(id)` |
| `block_key` | enum('idea_summary', 'problem', 'beneficiaries', 'outcomes', 'budget_breakdown', 'founder_qualifications') | |
| `content` | text | the extracted fact / paragraph |
| `source` | text | "from chat", "from previous application", "manually entered" |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Index: (`project_id`, `block_key`) unique.

How it's populated: when a founder finishes a chat (apply.html) or fills an application, the backend extracts/updates these blocks via a Claude call. Next time they start an application for a different grant on the same project, the autofill uses these blocks as the primary context.

### `founder_saved_grants`

Founder favourites the grants they want to come back to.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `founder_id` | uuid | |
| `grant_id` | uuid | |
| `created_at` | timestamptz | |

Unique: (founder_id, grant_id).

### `backer_saved_founders`

Backer saves a founder profile (Save button on founder cards).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | |
| `founder_id` | uuid | |
| `created_at` | timestamptz | |

### `shortlist_entries`

Backer shortlists a specific application.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | |
| `application_id` | uuid | |
| `created_at` | timestamptz | |

### `backings`

Backer formally backs a founder's project (the Back This Founder button).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | |
| `project_id` | uuid | |
| `application_id` | uuid | nullable — which application this backing came from |
| `grant_id` | uuid | nullable — which grant funded it |
| `backed_at` | timestamptz | default now() |
| `note` | text | optional |

Frontend uses:
- founder.html Backers page ("Backed By"), project cards ("Backed + Funded" tag)
- backer.html Backed Projects page

### `contact_requests` (POST-MVP STUB)

The Request a Call flow. Stored but not actively delivered yet.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | who sent the request |
| `founder_id` | uuid | who it's for |
| `preferred_time` | text | "Weekday afternoon (12pm-5pm)" |
| `format` | text | "Video call", "Phone call", etc. |
| `message` | text | |
| `status` | enum('sent', 'accepted', 'declined') | default 'sent' |
| `created_at` | timestamptz | |

We just write the row. Actual email/notification delivery is deferred.

### `profile_views`

For the "134 Profile Views This Month" stat.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `founder_id` | uuid | |
| `viewer_organization_id` | uuid | nullable — null if anonymous viewer |
| `viewed_at` | timestamptz | default now() |

Aggregated server-side for the dashboard stat.

---

## API Endpoints

All endpoints prefixed `/api/v1`. All require a valid Supabase JWT in `Authorization: Bearer <token>` unless marked `[public]`.

### Auth

Supabase handles signup/signin client-side. The backend just verifies the JWT on each request.

- `POST /auth/profile` — create the `profiles` row + `founders` or `organizations` + `backer_members` row after Supabase signup. Called once after signup.

### Founders

- `GET /founders/me` — current user's founder profile
- `PATCH /founders/me` — update profile fields
- `GET /founders/:id` — public founder profile (used by backers viewing)
- `GET /founders` — `[backer-only]` list with filters: `focus_areas`, `stage`, `q` (search), `limit`, `offset`
- `GET /founders/me/stats` — dashboard stats (active_projects, profile_views_this_month, open_grants_count)

### Projects

- `GET /projects/me` — current founder's projects
- `POST /projects` — create
- `PATCH /projects/:id` — update
- `DELETE /projects/:id` — archive (soft)
- `GET /projects/:id` — public project view

### Grants

- `GET /grants` — `[public]` list with filters: `focus_areas`, `type` (gov/corporate/community), `difficulty`, `open_now`, `q`, `limit`, `offset`. Returns sorted by match score if `Authorization` is present and user is a founder.
- `GET /grants/:id` — `[public]` grant detail + question schema
- `POST /grants` — `[backer-only]` create grant (from Post A Grant form)
- `PATCH /grants/:id` — `[backer-only, own org only]` edit
- `POST /grants/:id/close` — `[backer-only, own org only]` close grant
- `POST /grants/:id/save` — founder saves a grant
- `DELETE /grants/:id/save` — unsave

### Applications

- `GET /applications/me` — founder's own applications
- `POST /applications` — start a draft (body: project_id, grant_id) → returns application id
- `GET /applications/:id` — get draft/submitted application + answers
- `PATCH /applications/:id/answers` — bulk upsert answers (body: `{ question_key, value, ai_drafted, source }[]`)
- `POST /applications/:id/submit` — submit for internal grants
- `POST /applications/:id/submit-external` — for external grants. Body: `{ method: 'email_sent' | 'manual_copy' | 'portal_redirect' }`. Server records confirmation, optionally emails the org on the founder's behalf via Resend.

### Applications (Backer side)

- `GET /grants/:id/applications` — `[backer-only, own org only]` list applicants
- `PATCH /applications/:id/status` — `[backer-only, own org only]` update status to in_review/shortlisted/etc.
- `POST /applications/:id/back` — `[backer-only]` shorthand: status=backed AND create row in `backings`

### Organisations

- `GET /organizations/me` — current backer's org
- `PATCH /organizations/me` — update
- `GET /organizations/:id` — public org page

### Backer actions

- `POST /founders/:id/save` — save a founder
- `DELETE /founders/:id/save` — unsave
- `POST /founders/:id/contact-request` — Request a Call (writes contact_requests row, no email sent yet)
- `POST /applications/:id/shortlist` — shortlist an application

### AI Endpoints

These are the brain of the application. Each takes a context bundle and returns a structured response. All call Anthropic Claude.

- `POST /ai/draft-field` — single-field autofill. Body: `{ application_id, question_key }`. Server pulls grant + question, founder profile, project, ai_memory_blocks, then asks Claude to draft this one field. Returns `{ draft, source }`.

- `POST /ai/chat` — the apply.html chat. Body: `{ application_id, message_history: Msg[], user_message }`. Server fetches grant + founder + project + memory + question list, sends to Claude, returns `{ ai_message, quick_replies: string[], fields_filled?: { question_key, draft, source }[], step_label?, generating?: bool }`. The shape matches what apply.html already renders.

- `POST /ai/extract-memory` — runs after an application is completed or chat finishes. Body: `{ application_id }`. Server asks Claude to extract structured memory blocks from the conversation + final answers, upserts to `ai_memory_blocks` for that project. Background job, not user-facing.

- `POST /ai/match-grants` — given a founder + project, returns ranked grants. Used by Explore Grants "best match" badge and dashboard "17 Grants Open To You".

---

## Decisions Worth Reviewing

These are choices made because the HTML left them ambiguous. Sanity-check with your friend.

**1. External grant submission flow.** For NEA-style grants with their own portals, the submit button in our app does ONE of three things, depending on the grant config:
- `external_submission_email` is set → backend generates a filled application as plaintext + PDF and emails it from a Coart system address on the founder's behalf. Confirms back to founder. Records `external_confirmation_method = 'email_sent'`.
- `external_portal_url` is set but no email → we generate the filled application as a download (PDF/text), show a modal saying "We've prepared your answers — paste them into the NEA portal." Deep-link to the portal in a new tab. Record `'manual_copy'` once founder confirms they submitted.
- Neither set → fall back to manual_copy with no link.

This matches Jaslyn's note: "when they press submit there should also be confirmation that they sent it to the organisation." The confirmation is BOTH a UI confirmation (modal saying it's done) and a DB record of the method used.

**2. Memory feature scope.** Memory is per-project, not per-founder. A founder with two different projects (Unwoventhread + Hawker Harvest) will have two separate memory sets, so autofill never mixes them up. Same project across many grants → reuses the same memory.

**3. Grant matching.** "Best Match" badges and the "17 Grants Open To You" stat use a simple scoring function for MVP: overlap of `focus_areas` + age eligibility + stage eligibility + not-yet-closed. Anything more (semantic similarity, ML ranking) is post-MVP.

**4. Profile completion percentage.** Computed at read time from a fixed list of fields. Storing it is not worth the complexity.

**5. View counts.** Stored as denormalised counters on `founders`, `projects`, `grants` and incremented on each GET (with a 1-per-viewer-per-day debounce to avoid inflated numbers).

---

## Things NOT in MVP

Per the WhatsApp messages: backer ↔ founder messaging, actual scheduling integration (Calendly etc.), email delivery of shortlist notifications, payment / success-fee tracking, premium subscriptions, file storage for pitch decks (upload UI exists in HTML but disabled in backend until we add Supabase Storage policies).

The frontend has UI for some of these (Request a Call panel). We write the rows to `contact_requests`. We do NOT send emails or schedule anything yet. The UI shows "Request sent" optimistically — that's fine for MVP.

---

## File Layout

```
backend/
├── ARCHITECTURE.md          (this file)
├── README.md                (setup + deploy guide)
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── db/
│   └── schema.sql           (Postgres DDL for Supabase)
└── src/
    ├── index.ts             (Fastify server entry)
    ├── config.ts            (env loader)
    ├── db.ts                (Supabase client)
    ├── ai.ts                (Anthropic client)
    ├── auth.ts              (JWT verification middleware)
    ├── routes/
    │   ├── founders.ts
    │   ├── projects.ts
    │   ├── grants.ts
    │   ├── applications.ts
    │   ├── organizations.ts
    │   └── ai.ts
    └── schemas/
        └── index.ts         (Zod validation schemas)
```
