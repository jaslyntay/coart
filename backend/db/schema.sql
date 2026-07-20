-- Coart Database Schema
-- Postgres / Supabase
-- Run this in the Supabase SQL editor, or via the Supabase CLI: supabase db push
--
-- Conventions:
-- - UUIDs everywhere for primary keys
-- - timestamptz for all timestamps
-- - All tables have row-level security enabled; policies below
-- - `auth.users` is provided by Supabase Auth — we extend it via `profiles`

-- ─── EXTENSIONS ──────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────────────

create type user_role as enum ('founder', 'backer');

create type project_format as enum ('solo', 'team', 'social_enterprise', 'startup');
create type project_stage  as enum ('idea', 'planning', 'building', 'has_users');
create type project_status as enum ('draft', 'active', 'archived');

create type org_type as enum ('community', 'government', 'corporate', 'foundation', 'accelerator', 'other');

create type grant_type      as enum ('cash', 'mentorship', 'incubation', 'mixed', 'resource', 'scholarship');
create type grant_difficulty as enum ('easy', 'moderate', 'selective');
create type grant_status    as enum ('draft', 'active', 'closed');

create type question_field_type as enum ('short_text', 'long_text', 'number', 'select', 'file');

create type application_status as enum (
  'draft', 'submitted', 'in_review', 'shortlisted', 'backed', 'rejected', 'withdrawn'
);

create type external_confirmation_method as enum (
  'email_sent', 'manual_copy', 'portal_redirect'
);

create type memory_block_key as enum (
  'idea_summary', 'problem', 'beneficiaries', 'outcomes', 'budget_breakdown', 'founder_qualifications'
);

create type contact_request_status as enum ('sent', 'accepted', 'declined');

create type member_role as enum ('admin', 'member');

-- ─── UTILITY: updated_at trigger ─────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── profiles ────────────────────────────────────────────────────────
-- One row per Supabase auth user. Determines which dashboard they see.

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: read own"
  on profiles for select using (auth.uid() = id);

create policy "profiles: insert own"
  on profiles for insert with check (auth.uid() = id);

-- Backers can read founder profiles' role too (for permission checks)
create policy "profiles: read all for authed users"
  on profiles for select using (auth.role() = 'authenticated');

-- ─── founders ────────────────────────────────────────────────────────

create table founders (
  id                  uuid primary key references profiles(id) on delete cascade,
  full_name           text not null,
  age                 int not null check (age between 13 and 99),
  university          text,
  field_of_study      text,
  location            text,
  bio                 text,
  focus_areas         text[] default array[]::text[],
  profile_photo_url   text,
  linkedin_url        text,
  past_experience     text,
  open_to_backers     bool not null default true,
  seeking_grant_match bool not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index founders_focus_areas_gin on founders using gin (focus_areas);
create index founders_open_to_backers on founders(open_to_backers) where open_to_backers = true;

create trigger founders_updated before update on founders
  for each row execute function set_updated_at();

alter table founders enable row level security;

create policy "founders: read own"
  on founders for select using (auth.uid() = id);

create policy "founders: read all (public discovery)"
  on founders for select using (open_to_backers = true);

create policy "founders: insert own"
  on founders for insert with check (auth.uid() = id);

create policy "founders: update own"
  on founders for update using (auth.uid() = id);

-- ─── organizations ───────────────────────────────────────────────────

create table organizations (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  type          org_type not null default 'community',
  location      text,
  description   text,
  focus_areas   text[] default array[]::text[],
  is_external   bool not null default false,
  external_url  text,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index organizations_focus_areas_gin on organizations using gin (focus_areas);
create index organizations_is_external on organizations(is_external);

create trigger organizations_updated before update on organizations
  for each row execute function set_updated_at();

alter table organizations enable row level security;

create policy "organizations: public read"
  on organizations for select using (true);

-- Insert/update policies handled at service layer

-- ─── backer_members ──────────────────────────────────────────────────

create table backer_members (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role            member_role not null default 'member',
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index backer_members_user on backer_members(user_id);
create index backer_members_org on backer_members(organization_id);

alter table backer_members enable row level security;

create policy "backer_members: read own"
  on backer_members for select using (user_id = auth.uid());

-- ─── projects ────────────────────────────────────────────────────────

create table projects (
  id          uuid primary key default uuid_generate_v4(),
  founder_id  uuid not null references founders(id) on delete cascade,
  title       text not null,
  tagline     text,
  description text,
  format      project_format,
  stage       project_stage,
  focus_areas text[] default array[]::text[],
  status      project_status not null default 'draft',
  view_count  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_founder on projects(founder_id);
create index projects_status on projects(status);
create index projects_focus_areas_gin on projects using gin (focus_areas);

create trigger projects_updated before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;

create policy "projects: owner read/write"
  on projects for all using (founder_id = auth.uid()) with check (founder_id = auth.uid());

create policy "projects: public read active projects"
  on projects for select using (status = 'active');

-- ─── grants ──────────────────────────────────────────────────────────

create table grants (
  id                          uuid primary key default uuid_generate_v4(),
  organization_id             uuid not null references organizations(id) on delete cascade,
  reference_code              text unique,
  title                       text not null,
  grant_type                  grant_type not null default 'cash',
  amount_display              text,
  amount_min                  int,
  amount_max                  int,
  value_description           text,
  difficulty                  grant_difficulty default 'moderate',
  focus_areas                 text[] default array[]::text[],
  application_opens_at        date,
  application_closes_at       date,
  is_rolling                  bool not null default false,
  frequency                   text,
  eligibility_age_min         int default 15,
  eligibility_age_max         int default 25,
  eligibility_stage           text,
  eligibility_citizenship     text,
  eligibility_team_solo       text,
  eligibility_exclusions      text,
  offering_description        text,
  expectations                text,
  engagement_style            text,
  response_time               text,
  application_instructions    text,
  has_pitch_round             bool not null default false,
  pitch_format                text,
  pitch_prep                  text,
  decision_timeline           text,
  notification_method         text,
  is_external                 bool not null default false,
  external_portal_url         text,
  external_submission_email   text,
  external_submission_note    text,
  status                      grant_status not null default 'draft',
  view_count                  int not null default 0,
  application_count           int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index grants_org on grants(organization_id);
create index grants_status on grants(status);
create index grants_is_external on grants(is_external);
create index grants_focus_areas_gin on grants using gin (focus_areas);
create index grants_open_dates on grants(application_opens_at, application_closes_at);

create trigger grants_updated before update on grants
  for each row execute function set_updated_at();

alter table grants enable row level security;

create policy "grants: public read active"
  on grants for select using (status = 'active');

-- ─── grant_questions ─────────────────────────────────────────────────

create table grant_questions (
  id              uuid primary key default uuid_generate_v4(),
  grant_id        uuid not null references grants(id) on delete cascade,
  question_key    text not null,
  label           text not null,
  placeholder     text,
  help_text       text,
  field_type      question_field_type not null default 'long_text',
  options         jsonb,
  required        bool not null default true,
  order_index     int not null default 0,
  ai_draft_hint   text,
  unique (grant_id, question_key)
);

create index grant_questions_grant on grant_questions(grant_id);

alter table grant_questions enable row level security;

create policy "grant_questions: public read"
  on grant_questions for select using (true);

-- ─── applications ────────────────────────────────────────────────────

create table applications (
  id                              uuid primary key default uuid_generate_v4(),
  founder_id                      uuid not null references founders(id) on delete cascade,
  project_id                      uuid not null references projects(id) on delete cascade,
  grant_id                        uuid not null references grants(id) on delete cascade,
  status                          application_status not null default 'draft',
  submitted_at                    timestamptz,
  external_confirmation           bool not null default false,
  external_confirmed_at           timestamptz,
  external_confirmation_method    external_confirmation_method,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index applications_founder on applications(founder_id);
create index applications_grant on applications(grant_id);
create index applications_project on applications(project_id);
create index applications_status on applications(status);

create trigger applications_updated before update on applications
  for each row execute function set_updated_at();

alter table applications enable row level security;

create policy "applications: founder read/write own"
  on applications for all using (founder_id = auth.uid()) with check (founder_id = auth.uid());

-- Backers can read applications to their grants — enforced at service layer
-- (joining via grants.organization_id → backer_members.organization_id)

-- ─── application_answers ────────────────────────────────────────────

create table application_answers (
  id              uuid primary key default uuid_generate_v4(),
  application_id  uuid not null references applications(id) on delete cascade,
  question_key    text not null,
  value           text,
  ai_drafted      bool not null default false,
  source          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, question_key)
);

create index application_answers_app on application_answers(application_id);

create trigger application_answers_updated before update on application_answers
  for each row execute function set_updated_at();

alter table application_answers enable row level security;

create policy "application_answers: founder access own via application"
  on application_answers for all
  using (
    exists (
      select 1 from applications a
      where a.id = application_answers.application_id
      and a.founder_id = auth.uid()
    )
  );

-- ─── ai_memory_blocks ────────────────────────────────────────────────

create table ai_memory_blocks (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references projects(id) on delete cascade,
  block_key   memory_block_key not null,
  content     text not null,
  source      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, block_key)
);

create index ai_memory_blocks_project on ai_memory_blocks(project_id);

create trigger ai_memory_blocks_updated before update on ai_memory_blocks
  for each row execute function set_updated_at();

alter table ai_memory_blocks enable row level security;

create policy "ai_memory_blocks: founder owns via project"
  on ai_memory_blocks for all
  using (
    exists (
      select 1 from projects p
      where p.id = ai_memory_blocks.project_id
      and p.founder_id = auth.uid()
    )
  );

-- ─── founder_saved_grants ────────────────────────────────────────────

create table founder_saved_grants (
  id          uuid primary key default uuid_generate_v4(),
  founder_id  uuid not null references founders(id) on delete cascade,
  grant_id    uuid not null references grants(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (founder_id, grant_id)
);

create index founder_saved_grants_founder on founder_saved_grants(founder_id);

alter table founder_saved_grants enable row level security;

create policy "founder_saved_grants: own"
  on founder_saved_grants for all
  using (founder_id = auth.uid()) with check (founder_id = auth.uid());

-- ─── backer_saved_founders ───────────────────────────────────────────

create table backer_saved_founders (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  founder_id      uuid not null references founders(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (organization_id, founder_id)
);

create index backer_saved_founders_org on backer_saved_founders(organization_id);

alter table backer_saved_founders enable row level security;

-- Policy enforced at service layer (need to check user is member of org)

-- ─── shortlist_entries ───────────────────────────────────────────────

create table shortlist_entries (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id  uuid not null references applications(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (organization_id, application_id)
);

create index shortlist_entries_org on shortlist_entries(organization_id);
create index shortlist_entries_app on shortlist_entries(application_id);

alter table shortlist_entries enable row level security;

-- ─── backings ────────────────────────────────────────────────────────

create table backings (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  application_id  uuid references applications(id) on delete set null,
  grant_id        uuid references grants(id) on delete set null,
  backed_at       timestamptz not null default now(),
  note            text
);

create index backings_org on backings(organization_id);
create index backings_project on backings(project_id);

alter table backings enable row level security;

create policy "backings: public read"
  on backings for select using (true);

-- ─── contact_requests ────────────────────────────────────────────────

create table contact_requests (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  founder_id      uuid not null references founders(id) on delete cascade,
  preferred_time  text,
  format          text,
  message         text,
  status          contact_request_status not null default 'sent',
  created_at      timestamptz not null default now()
);

create index contact_requests_founder on contact_requests(founder_id);
create index contact_requests_org on contact_requests(organization_id);

alter table contact_requests enable row level security;

create policy "contact_requests: founder reads own"
  on contact_requests for select using (founder_id = auth.uid());

-- ─── profile_views ───────────────────────────────────────────────────

create table profile_views (
  id                      uuid primary key default uuid_generate_v4(),
  founder_id              uuid not null references founders(id) on delete cascade,
  viewer_organization_id  uuid references organizations(id) on delete set null,
  viewed_at               timestamptz not null default now()
);

create index profile_views_founder_time on profile_views(founder_id, viewed_at desc);
create index profile_views_org on profile_views(viewer_organization_id);

alter table profile_views enable row level security;

create policy "profile_views: founder reads own"
  on profile_views for select using (founder_id = auth.uid());

-- ─── DONE ────────────────────────────────────────────────────────────
-- After running this, seed initial external orgs and curated grants
-- via a separate seed script (db/seed.sql — TODO).


-- ─── MIGRATIONS APPLIED AFTER INITIAL SCHEMA (via dashboard SQL editor) ──
-- 2026-07-19: general application server-side
-- alter table founders add column if not exists community text;
-- alter table founders add column if not exists typical_budget text;
--
-- 2026-07-20: contact exchange + notifications (see below, run as one block)
alter table founders add column if not exists community text;
alter table founders add column if not exists typical_budget text;
alter table founders add column if not exists contact_email text;
alter table founders add column if not exists contact_phone text;
alter table organizations add column if not exists contact_name text;
alter table organizations add column if not exists contact_email text;
alter table organizations add column if not exists contact_phone text;

-- Contact details must never be readable through the public PostgREST API.
-- NOTE: column-level REVOKE alone is a no-op while a table-level GRANT
-- exists (PG privileges are additive) — revoke the table, grant columns.
-- New columns added later are NOT readable via direct PostgREST unless
-- granted here; the backend (service role) is unaffected.
revoke select on founders from anon, authenticated;
grant select (id, full_name, age, university, field_of_study, location, bio, focus_areas, profile_photo_url, linkedin_url, past_experience, community, typical_budget, open_to_backers, seeking_grant_match, created_at, updated_at) on founders to anon, authenticated;
revoke select on organizations from anon, authenticated;
grant select (id, name, type, location, description, focus_areas, is_external, external_url, logo_url, created_at, updated_at) on organizations to anon, authenticated;

create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_time on notifications(user_id, created_at desc);
alter table notifications enable row level security;
drop policy if exists "notifications: read own" on notifications;
create policy "notifications: read own" on notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications: update own" on notifications;
create policy "notifications: update own" on notifications for update using (auth.uid() = user_id);
