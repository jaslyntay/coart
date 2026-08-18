// E2E for media (video/image) grant questions:
// 1. backer posts a grant with a text + video + image question
// 2. founder starts an application, gets a signed upload URL, uploads a
//    tiny file directly to storage, saves the URL as the answer
// 3. backer reads the application back with field_type/help_text intact
// Run from backend/: API_BASE=http://localhost:3001/api/v1 npx tsx scripts/test-media-answers.ts
// Cleans up everything it creates.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const BACKER_EMAIL = 'mediatest.backer@coart.test';
const FOUNDER_EMAIL = 'mediatest.founder@coart.test';
const PASSWORD = 'coart-media-test-4242';

let failures = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : ' — ' + JSON.stringify(extra)));
  if (!ok) failures++;
}

async function ensureUser(email: string): Promise<string> {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  return data.user.id;
}

async function jwtFor(email: string): Promise<string> {
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(error.message);
  return data.session!.access_token;
}

async function api(path: string, jwt: string, opts: RequestInit = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function cleanup(backerId: string, founderId: string) {
  const { data: member } = await sb.from('backer_members').select('organization_id').eq('user_id', backerId).maybeSingle();
  if (member) {
    await sb.from('grants').delete().eq('organization_id', member.organization_id);
    await sb.from('organizations').delete().eq('id', member.organization_id);
  }
  await sb.auth.admin.deleteUser(backerId).catch(() => {});
  await sb.auth.admin.deleteUser(founderId).catch(() => {});
}

async function main() {
  // Reset users so passwords are known
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list?.users ?? []) {
    if (u.email === BACKER_EMAIL || u.email === FOUNDER_EMAIL) await sb.auth.admin.deleteUser(u.id);
  }
  const backerId = await ensureUser(BACKER_EMAIL);
  const founderId = await ensureUser(FOUNDER_EMAIL);

  try {
    const backerJwt = await jwtFor(BACKER_EMAIL);
    const founderJwt = await jwtFor(FOUNDER_EMAIL);

    // Onboard both sides
    let r = await api('/auth/profile', backerJwt, {
      method: 'POST',
      body: JSON.stringify({ role: 'backer', organization: { name: 'Media Test Org', type: 'community', contact_name: 'MT', contact_email: BACKER_EMAIL, contact_phone: '+6590000001' } }),
    });
    check('backer onboarding', r.status === 200, r.body);
    r = await api('/auth/profile', founderJwt, {
      method: 'POST',
      body: JSON.stringify({ role: 'founder', founder: { full_name: 'Media Tester', age: 21, contact_email: FOUNDER_EMAIL, contact_phone: '+6590000002' } }),
    });
    check('founder onboarding', r.status === 200, r.body);

    // Backer posts a grant with text + video + image questions
    r = await api('/grants', backerJwt, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Media Question Test Grant',
        grant_type: 'cash',
        amount_display: '1000',
        offering_description: 'test',
        application_instructions: 'test',
        focus_areas: ['Tech'],
        questions: [
          { question_key: 'q1', label: 'Describe your project', field_type: 'long_text', required: true, order_index: 0 },
          { question_key: 'q2', label: 'A 1–2 min video about your project', field_type: 'file', help_text: 'video', required: true, order_index: 1 },
          { question_key: 'q3', label: 'A photo of your work', field_type: 'file', help_text: 'image', required: true, order_index: 2 },
        ],
      }),
    });
    check('post grant with media questions', r.status === 200 && r.body.id, r.body);
    const grantId = r.body.id;

    // Grant detail exposes field_type + help_text
    r = await api('/grants/' + grantId, founderJwt);
    const vq = (r.body.questions || []).find((q: any) => q.question_key === 'q2');
    check('grant detail: video question has field_type=file help_text=video', vq?.field_type === 'file' && vq?.help_text === 'video', r.body.questions);

    // Founder: project + application
    r = await api('/projects', founderJwt, { method: 'POST', body: JSON.stringify({ title: 'Media Project', tagline: 't', description: 'd', focus_areas: ['Tech'] }) });
    check('create project', r.status === 200 && r.body.id, r.body);
    const projectId = r.body.id;
    r = await api('/applications', founderJwt, { method: 'POST', body: JSON.stringify({ project_id: projectId, grant_id: grantId }) });
    check('start application', r.status === 200 && r.body.id, r.body);
    const appId = r.body.id;

    // Signed upload URL + direct upload (tiny fake mp4 payload)
    r = await api('/applications/' + appId + '/answer-upload', founderJwt, {
      method: 'POST',
      body: JSON.stringify({ question_key: 'q2', content_type: 'video/mp4' }),
    });
    check('answer-upload returns signed url', r.status === 200 && r.body.token && r.body.public_url, r.body);
    const { path, token, public_url } = r.body;

    const bytes = new Uint8Array(4096).fill(7);
    const up = await anon.storage.from('avatars').uploadToSignedUrl(path, token, bytes, { contentType: 'video/mp4' });
    check('direct upload to storage', !up.error, up.error?.message);

    // Rejects wrong owner + wrong type
    r = await api('/applications/' + appId + '/answer-upload', backerJwt, { method: 'POST', body: JSON.stringify({ question_key: 'q2', content_type: 'video/mp4' }) });
    check('answer-upload rejects non-owner', r.status === 403 || r.status === 400, r);
    r = await api('/applications/' + appId + '/answer-upload', founderJwt, { method: 'POST', body: JSON.stringify({ question_key: 'q2', content_type: 'application/pdf' }) });
    check('answer-upload rejects bad type', r.status === 400, r);

    // Save answers (media URL + text) and submit
    r = await api('/applications/' + appId + '/answers', founderJwt, {
      method: 'PATCH',
      body: JSON.stringify({ answers: [
        { question_key: 'q1', value: 'A community project.', ai_drafted: false },
        { question_key: 'q2', value: public_url, ai_drafted: false },
        { question_key: 'q3', value: 'https://youtu.be/link-fallback', ai_drafted: false },
      ] }),
    });
    check('save answers incl. media URLs', r.status === 200, r.body);
    r = await api('/applications/' + appId + '/submit', founderJwt, { method: 'POST', body: '{}' });
    check('submit application', r.status === 200, r.body);

    // Backer reads it back with question metadata
    r = await api('/grants/' + grantId + '/applications', backerJwt);
    const qMeta = (r.body.questions || []).find((q: any) => q.question_key === 'q2');
    const ans = r.body.applications?.[0]?.answers?.find((a: any) => a.question_key === 'q2');
    check('backer sees media question metadata', qMeta?.field_type === 'file' && qMeta?.help_text === 'video', r.body.questions);
    check('backer sees uploaded media URL answer', ans?.value === public_url, ans);

    // Uploaded file is publicly reachable
    const head = await fetch(public_url);
    check('uploaded file publicly reachable', head.ok, head.status);

    // Storage cleanup of the test file
    await sb.storage.from('avatars').remove([path]);
  } finally {
    await cleanup(backerId, founderId);
    console.log('cleanup done');
  }
  console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
