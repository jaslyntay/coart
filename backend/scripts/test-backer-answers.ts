// Dev-only E2E: backer posts a grant → founder applies with answers →
// backer's applicant endpoint returns those answers + question labels.
//
// Run from backend/: npx tsx scripts/test-backer-answers.ts
// (expects the dev server on :3001 and the test backer seeded)

import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config.js';

const API = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const BACKER = { email: 'backertest.dev@coart.test', password: 'coart-dev-backer-7418' };
const DEV_FOUNDER = 'e32a58dc-0531-49df-9bff-d5bbdca8360a';

async function main() {
  const anon = createClient(config.supabase.url, config.supabase.anonKey);
  const { data: signin, error } = await anon.auth.signInWithPassword(BACKER);
  if (error || !signin.session) throw new Error('backer signin failed: ' + error?.message);
  const bH = { 'Content-Type': 'application/json', Authorization: `Bearer ${signin.session.access_token}` };
  const fH = { 'Content-Type': 'application/json', 'X-Dev-User': DEV_FOUNDER };

  const j = async (r: Response) => {
    const body = await r.json();
    if (!r.ok) throw new Error(`${r.url} ${r.status}: ${JSON.stringify(body)}`);
    return body;
  };

  // backer posts a grant with the standard questions
  const grant = await j(await fetch(`${API}/grants`, {
    method: 'POST', headers: bH,
    body: JSON.stringify({
      title: 'Answers View Test Grant',
      grant_type: 'cash',
      amount_display: 'S$1,000',
      offering_description: 'test',
      application_instructions: 'test',
      questions: [
        { question_key: 'impact', label: 'Describe your project and its impact', field_type: 'long_text', required: true, order_index: 0 },
        { question_key: 'funding', label: 'How will you use this grant?', field_type: 'long_text', required: true, order_index: 1 },
      ],
    }),
  }));

  // founder creates a project, applies, answers, submits
  const project = await j(await fetch(`${API}/projects`, {
    method: 'POST', headers: fH,
    body: JSON.stringify({ title: 'Answers Test Project', tagline: 'testing answers' }),
  }));
  const appli = await j(await fetch(`${API}/applications`, {
    method: 'POST', headers: fH,
    body: JSON.stringify({ project_id: project.id, grant_id: grant.id }),
  }));
  await j(await fetch(`${API}/applications/${appli.id}/answers`, {
    method: 'PATCH', headers: fH,
    body: JSON.stringify({ answers: [
      { question_key: 'impact', value: 'THE IMPACT ANSWER', ai_drafted: true },
      { question_key: 'funding', value: 'THE FUNDING ANSWER', ai_drafted: false },
    ] }),
  }));
  // no Content-Type here — bodyless POST
  await j(await fetch(`${API}/applications/${appli.id}/submit`, { method: 'POST', headers: { 'X-Dev-User': DEV_FOUNDER } }));

  // backer reads applicants — answers + questions must be present
  const res = await j(await fetch(`${API}/grants/${grant.id}/applications`, { headers: bH }));
  const a = res.applications[0];
  const checks = [
    ['application present', !!a],
    ['answers present', (a?.answers ?? []).length === 2],
    ['impact answer text', a?.answers?.some((x: any) => x.value === 'THE IMPACT ANSWER' && x.ai_drafted === true)],
    ['funding answer text', a?.answers?.some((x: any) => x.value === 'THE FUNDING ANSWER' && x.ai_drafted === false)],
    ['question labels returned', (res.questions ?? []).length === 2 && res.questions[0].label.includes('impact')],
    ['project description included', 'description' in (a?.project ?? {})],
  ];
  checks.forEach(([label, ok]) => console.log(ok ? 'PASS' : 'FAIL', ' ', label));
  console.log('grant:', grant.id, '| application:', appli.id);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
