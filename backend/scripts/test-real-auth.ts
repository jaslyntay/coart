// Dev-only smoke test for the real-JWT auth path (what magic-link sessions
// use). Creates a password test user, signs in with the anon client, then
// exercises POST /auth/profile + GET/PATCH /founders/me with the Bearer
// token against API_BASE (default local server).
//
// Run from backend/: npx tsx scripts/test-real-auth.ts [--cleanup]

import { createClient } from '@supabase/supabase-js';
import { admin } from '../src/db.js';
import { config } from '../src/config.js';

const EMAIL = 'authtest.dev@coart.test';
const PASSWORD = 'coart-dev-test-3921';
const API_BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';

async function getOrCreateUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error) return data.user.id;
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === EMAIL);
  if (!found) throw new Error(`createUser failed: ${error.message}`);
  return found.id;
}

async function cleanup(userId: string) {
  await admin.from('founders').delete().eq('id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
  console.log('cleaned up test user', userId);
}

async function main() {
  const userId = await getOrCreateUser();

  if (process.argv.includes('--cleanup')) {
    await cleanup(userId);
    return;
  }

  // Fresh slate so the onboarding path (404/403 → POST /auth/profile) runs.
  await admin.from('founders').delete().eq('id', userId);
  await admin.from('profiles').delete().eq('id', userId);

  const anon = createClient(config.supabase.url, config.supabase.anonKey);
  const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signinErr || !signin.session) throw new Error(`signin failed: ${signinErr?.message}`);
  const token = signin.session.access_token;
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const results: string[] = [];
  const check = async (label: string, expected: number, res: Response) => {
    const body = await res.text();
    const ok = res.status === expected ? 'PASS' : `FAIL (got ${res.status}, want ${expected})`;
    results.push(`${ok}  ${label}  ${body.slice(0, 120)}`);
  };

  // 1. Before onboarding: /founders/me should reject (403 role=null).
  await check('pre-onboarding GET /founders/me', 403, await fetch(`${API_BASE}/founders/me`, { headers: H }));

  // 2. Onboard.
  await check(
    'POST /auth/profile',
    200,
    await fetch(`${API_BASE}/auth/profile`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ role: 'founder', founder: { full_name: 'Auth Test', age: 21, contact_email: 'authtest.dev@coart.test', contact_phone: '+6591234567' } }),
    }),
  );

  // 3. Now /founders/me should work.
  await check('post-onboarding GET /founders/me', 200, await fetch(`${API_BASE}/founders/me`, { headers: H }));

  // 4. PATCH under RLS with the real user JWT.
  await check(
    'PATCH /founders/me',
    200,
    await fetch(`${API_BASE}/founders/me`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ bio: 'bio set via real JWT' }),
    }),
  );

  // 5. Bad token rejected.
  await check(
    'GET /founders/me with garbage token',
    401,
    await fetch(`${API_BASE}/founders/me`, { headers: { Authorization: 'Bearer garbage' } }),
  );

  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
