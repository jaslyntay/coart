// Delete organisations whose owning user account was deleted (zero
// backer_members), plus their grants/messages/etc. These "ghost orgs"
// otherwise leave founder-visible grants that nobody can respond to.
// Run from backend/: npx tsx scripts/cleanup-orphan-orgs.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: orgs } = await sb.from('organizations').select('id, name');
  const { data: members } = await sb.from('backer_members').select('organization_id');
  const memberOrgIds = new Set((members ?? []).map((m) => m.organization_id));
  // Curated/seeded external orgs have no members either — keep anything
  // that owns an is_external grant or was seeded (is_external orgs).
  const { data: externalGrants } = await sb.from('grants').select('organization_id').eq('is_external', true);
  const keepIds = new Set((externalGrants ?? []).map((g) => g.organization_id));
  const { data: extOrgs } = await sb.from('organizations').select('id').eq('is_external', true);
  (extOrgs ?? []).forEach((o) => keepIds.add(o.id));

  const orphans = (orgs ?? []).filter((o) => !memberOrgIds.has(o.id) && !keepIds.has(o.id));
  if (!orphans.length) { console.log('No orphan orgs.'); return; }

  for (const o of orphans) {
    console.log(`Deleting orphan org "${o.name}" (${o.id})…`);
    for (const t of ['messages', 'contact_requests', 'backings']) {
      const { error } = await sb.from(t).delete().eq('organization_id', o.id);
      if (error) console.log(`  ${t}: ${error.message}`);
    }
    const { error: ge } = await sb.from('grants').delete().eq('organization_id', o.id);
    console.log('  grants:', ge ? ge.message : 'ok');
    const { error: oe } = await sb.from('organizations').delete().eq('id', o.id);
    console.log('  org:', oe ? oe.message : 'ok');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
