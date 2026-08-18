// FULL RESET for launch: deletes every user account and everything they
// created — profiles, founders, organisations, backer-posted grants,
// projects, applications, messages, notifications, contact requests,
// backings. KEEPS the curated external grants catalogue (is_external
// orgs/grants) and the local-dev founder fixture (DEV_FOUNDER_ID).
// Run from backend/: npx tsx scripts/wipe-test-data.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DEV_FOUNDER_ID = process.env.DEV_FOUNDER_ID; // local-dev fixture, kept

async function main() {
  // 1. Which orgs to KEEP: curated/external ones (the grants catalogue).
  const { data: extGrants } = await sb.from('grants').select('organization_id').eq('is_external', true);
  const { data: extOrgs } = await sb.from('organizations').select('id').eq('is_external', true);
  const keepOrgIds = new Set([
    ...(extGrants ?? []).map((g) => g.organization_id),
    ...(extOrgs ?? []).map((o) => o.id),
  ]);

  // 2. Cross-cutting tables — every row is user-generated test data.
  for (const t of ['messages', 'notifications', 'contact_requests', 'backings', 'profile_views', 'shortlist_entries', 'founder_saved_grants', 'application_answers', 'applications']) {
    const r = await sb.from(t).delete({ count: 'exact' }).not('id', 'is', null);
    console.log(t + ':', r.error ? r.error.message : `${r.count ?? '?'} rows deleted`);
  }

  // 3. User-posted grants (anything not part of the curated catalogue).
  const { data: allGrants } = await sb.from('grants').select('id, title, organization_id, is_external');
  const dropGrants = (allGrants ?? []).filter((g) => !g.is_external && !keepOrgIds.has(g.organization_id));
  for (const g of dropGrants) {
    const { error } = await sb.from('grants').delete().eq('id', g.id);
    console.log(`grant "${g.title}":`, error ? error.message : 'deleted');
  }

  // 4. Non-curated organisations.
  const { data: allOrgs } = await sb.from('organizations').select('id, name');
  for (const o of (allOrgs ?? []).filter((x) => !keepOrgIds.has(x.id))) {
    const { error } = await sb.from('organizations').delete().eq('id', o.id);
    console.log(`org "${o.name}":`, error ? error.message : 'deleted');
  }

  // 5. Projects (leftovers not removed by cascades).
  {
    const r = await sb.from('projects').delete({ count: 'exact' }).not('id', 'is', null);
    console.log('projects:', r.error ? r.error.message : `${r.count ?? '?'} rows deleted`);
  }

  // 6. Every auth user except the local-dev fixture.
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list?.users ?? []) {
    if (DEV_FOUNDER_ID && u.id === DEV_FOUNDER_ID) { console.log(`keep dev fixture ${u.email}`); continue; }
    const { error } = await sb.auth.admin.deleteUser(u.id);
    console.log(`user ${u.email}:`, error ? error.message : 'deleted');
  }

  // 7. Report what's left.
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const { count: grantsLeft } = await sb.from('grants').select('id', { count: 'exact', head: true });
  const { count: orgsLeft } = await sb.from('organizations').select('id', { count: 'exact', head: true });
  console.log('\nremaining users:', (users?.users ?? []).map((u) => u.email));
  console.log('remaining grants (curated catalogue):', grantsLeft);
  console.log('remaining orgs (curated grantors):', orgsLeft);
}

main().catch((e) => { console.error(e); process.exit(1); });
