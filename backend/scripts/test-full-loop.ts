// Full-lifecycle E2E: backer posts grant → founder applies → notifications
// fire → shortlist → back → contact details revealed BOTH ways (and hidden
// before backing). Plus saved grants, avatar upload, and the anon
// column-privilege lock. Run from backend/ with the dev server on :3001.
//
//   npx tsx scripts/seed-test-backer.ts
//   npx tsx scripts/test-full-loop.ts
//   npx tsx scripts/seed-test-backer.ts --cleanup

import { createClient } from '@supabase/supabase-js';
import { admin } from '../src/db.js';
import { config } from '../src/config.js';

const API = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const BACKER = { email: 'backertest.dev@coart.test', password: 'coart-dev-backer-7418' };
const DEV_FOUNDER = 'e32a58dc-0531-49df-9bff-d5bbdca8360a';
const results: [string, boolean][] = [];
const ok = (label: string, cond: unknown) => results.push([label, !!cond]);

async function main() {
  const anon = createClient(config.supabase.url, config.supabase.anonKey);
  const { data: s, error } = await anon.auth.signInWithPassword(BACKER);
  if (error || !s.session) throw new Error('backer signin failed: ' + error?.message);
  const backerUserId = s.session.user.id;
  const bH = { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session.access_token}` };
  const bHplain = { Authorization: `Bearer ${s.session.access_token}` };
  const fH = { 'Content-Type': 'application/json', 'X-Dev-User': DEV_FOUNDER };
  const fHplain = { 'X-Dev-User': DEV_FOUNDER };
  const j = async (r: Response) => {
    const body = await r.json();
    if (!r.ok) throw new Error(`${r.url} ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
    return body;
  };

  // clean notification slate for deterministic assertions
  await admin.from('notifications').delete().in('user_id', [DEV_FOUNDER, backerUserId]);

  // founder has contact details
  await j(await fetch(`${API}/founders/me`, {
    method: 'PATCH', headers: fH,
    body: JSON.stringify({ contact_email: 'jaslyn.dev@coart.test', contact_phone: '+6590001111' }),
  }));

  // ── grant lifecycle ──
  const grant = await j(await fetch(`${API}/grants`, {
    method: 'POST', headers: bH,
    body: JSON.stringify({
      title: 'Full Loop Grant', grant_type: 'cash', amount_display: 'S$2,000',
      offering_description: 'test', application_instructions: 'test',
      questions: [{ question_key: 'impact', label: 'Impact?', field_type: 'long_text', required: true, order_index: 0 }],
    }),
  }));

  // founder discovers it, saves it, unsaves it
  const explore = await j(await fetch(`${API}/grants`, { headers: fHplain }));
  ok('backer grant visible to founder', explore.grants.some((g: any) => g.id === grant.id));
  await j(await fetch(`${API}/grants/${grant.id}/save`, { method: 'POST', headers: fHplain }));
  let saved = await j(await fetch(`${API}/grants/saved/list`, { headers: fHplain }));
  ok('saved list contains grant', saved.grant_ids.includes(grant.id));
  await j(await fetch(`${API}/grants/${grant.id}/save`, { method: 'DELETE', headers: fHplain }));
  saved = await j(await fetch(`${API}/grants/saved/list`, { headers: fHplain }));
  ok('unsave removes grant', !saved.grant_ids.includes(grant.id));

  // founder applies
  const project = await j(await fetch(`${API}/projects`, {
    method: 'POST', headers: fH, body: JSON.stringify({ title: 'Loop Project' }),
  }));
  const appli = await j(await fetch(`${API}/applications`, {
    method: 'POST', headers: fH, body: JSON.stringify({ project_id: project.id, grant_id: grant.id }),
  }));
  await j(await fetch(`${API}/applications/${appli.id}/answers`, {
    method: 'PATCH', headers: fH,
    body: JSON.stringify({ answers: [{ question_key: 'impact', value: 'LOOP ANSWER', ai_drafted: false }] }),
  }));
  await j(await fetch(`${API}/applications/${appli.id}/submit`, { method: 'POST', headers: fHplain }));

  // backer notified of new application
  let bNotifs = await j(await fetch(`${API}/notifications`, { headers: bHplain }));
  ok('backer notified of application', bNotifs.notifications.some((n: any) => n.type === 'application_received'));

  // pre-backing: contacts hidden both ways
  let apps = await j(await fetch(`${API}/grants/${grant.id}/applications`, { headers: bHplain }));
  ok('founder contact HIDDEN before backing', !apps.applications[0].founder.contact_email);
  let mine = await j(await fetch(`${API}/applications/${appli.id}`, { headers: fHplain }));
  ok('org contact HIDDEN before backing', !mine.grant.organization?.contact_email);

  // shortlist → founder notified
  await j(await fetch(`${API}/applications/${appli.id}/shortlist`, { method: 'POST', headers: bHplain }));
  let fNotifs = await j(await fetch(`${API}/notifications`, { headers: fHplain }));
  ok('founder notified of shortlist', fNotifs.notifications.some((n: any) => n.type === 'shortlisted'));

  // back → founder notified + contacts revealed BOTH ways
  await j(await fetch(`${API}/applications/${appli.id}/status`, {
    method: 'PATCH', headers: bH, body: JSON.stringify({ status: 'backed' }),
  }));
  fNotifs = await j(await fetch(`${API}/notifications`, { headers: fHplain }));
  ok('founder notified of backing', fNotifs.notifications.some((n: any) => n.type === 'backed'));
  apps = await j(await fetch(`${API}/grants/${grant.id}/applications`, { headers: bHplain }));
  ok('founder contact REVEALED after backing', apps.applications[0].founder.contact_email === 'jaslyn.dev@coart.test');
  mine = await j(await fetch(`${API}/applications/${appli.id}`, { headers: fHplain }));
  ok('org contact REVEALED after backing', mine.grant.organization?.contact_email === 'backertest.dev@coart.test');

  // read-all clears unread
  await j(await fetch(`${API}/notifications/read-all`, { method: 'POST', headers: fHplain }));
  fNotifs = await j(await fetch(`${API}/notifications`, { headers: fHplain }));
  ok('read-all clears unread', fNotifs.unread === 0);

  // avatar upload (1x1 red pixel PNG)
  const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const withAvatar = await j(await fetch(`${API}/founders/me/avatar`, {
    method: 'POST', headers: fH, body: JSON.stringify({ image_base64: px, content_type: 'image/png' }),
  }));
  ok('avatar uploaded + url set', /supabase\.co\/storage.*avatars/.test(withAvatar.profile_photo_url || ''));

  // anon PostgREST cannot read contact columns directly (column privilege revoke)
  const { error: colErr } = await anon.from('founders').select('contact_email').limit(1);
  ok('anon blocked from contact columns', !!colErr);

  // ── report + cleanup of loop artifacts ──
  results.forEach(([label, pass]) => console.log(pass ? 'PASS' : 'FAIL', ' ', label));
  await admin.from('applications').delete().eq('id', appli.id);
  await admin.from('projects').delete().eq('id', project.id);
  await admin.from('grant_questions').delete().eq('grant_id', grant.id);
  await admin.from('backings').delete().eq('grant_id', grant.id);
  await admin.from('grants').delete().eq('id', grant.id);
  await admin.from('founders').update({ profile_photo_url: null, contact_email: null, contact_phone: null }).eq('id', DEV_FOUNDER);
  await admin.from('notifications').delete().in('user_id', [DEV_FOUNDER, backerUserId]);
  console.log('loop artifacts cleaned');
  if (results.some(([, p]) => !p)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
