// Dev-only: create a password test backer (auth user + profiles + org +
// backer_members) so the backer dashboard can be exercised in a browser.
//
// Run from backend/: npx tsx scripts/seed-test-backer.ts [--cleanup]

import { admin } from '../src/db.js';

const EMAIL = 'backertest.dev@coart.test';
const PASSWORD = 'coart-dev-backer-7418';
const ORG_NAME = 'Dev Test Backers Collective';

async function main() {
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list?.users.find((u) => u.email === EMAIL);

  if (process.argv.includes('--cleanup')) {
    if (user) {
      const { data: member } = await admin.from('backer_members').select('organization_id').eq('user_id', user.id).maybeSingle();
      await admin.from('backer_members').delete().eq('user_id', user.id);
      if (member) {
        await admin.from('backings').delete().eq('organization_id', member.organization_id);
        await admin.from('shortlist_entries').delete().eq('organization_id', member.organization_id);
        await admin.from('contact_requests').delete().eq('organization_id', member.organization_id);
        const { data: grants } = await admin.from('grants').select('id').eq('organization_id', member.organization_id);
        for (const g of grants ?? []) {
          await admin.from('applications').delete().eq('grant_id', g.id);
        }
        await admin.from('grants').delete().eq('organization_id', member.organization_id);
        await admin.from('organizations').delete().eq('id', member.organization_id);
      }
      await admin.from('profiles').delete().eq('id', user.id);
      await admin.auth.admin.deleteUser(user.id);
      console.log('cleaned up test backer');
    } else {
      console.log('no test backer to clean up');
    }
    return;
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user = data.user;
  }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile) {
    const { error: pErr } = await admin.from('profiles').insert({ id: user.id, role: 'backer' });
    if (pErr) throw new Error(`profiles insert failed: ${pErr.message}`);
  }

  const { data: member } = await admin.from('backer_members').select('organization_id').eq('user_id', user.id).maybeSingle();
  if (!member) {
    const { data: org, error: oErr } = await admin
      .from('organizations')
      .insert({ name: ORG_NAME, type: 'community', location: 'Singapore', is_external: false })
      .select('id')
      .single();
    if (oErr) throw new Error(`org insert failed: ${oErr.message}`);
    const { error: mErr } = await admin
      .from('backer_members')
      .insert({ user_id: user.id, organization_id: org.id, role: 'admin' });
    if (mErr) throw new Error(`member insert failed: ${mErr.message}`);
  }

  console.log('test backer ready:', EMAIL, '/', PASSWORD, '| user:', user.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
