// Seeds the researched 2026 grants catalogue (backend/db/grants-catalogue-2026.json)
// into organizations / grants / grant_questions. Idempotent by reference_code.
//
// The catalogue was curated from official sources (application forms, guideline
// PDFs, OurSG Grants portal docs) — see the git history for research provenance.
//
// Run from backend/: npx tsx scripts/seed-grants-2.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { admin } from '../src/db.js';

const here = dirname(fileURLToPath(import.meta.url));
const CATALOGUE = JSON.parse(readFileSync(join(here, '../db/grants-catalogue-2026.json'), 'utf8'));

async function getOrCreateOrg(name: string, type: string, url?: string): Promise<string> {
  const { data: existing, error: findErr } = await admin
    .from('organizations').select('id').eq('name', name).maybeSingle();
  if (findErr) throw new Error(`org lookup failed: ${findErr.message}`);
  if (existing) return existing.id;
  const { data, error } = await admin
    .from('organizations')
    .insert({ name, type, location: 'Singapore', is_external: true, ...(url ? { external_url: url } : {}) })
    .select('id').single();
  if (error) throw new Error(`org insert failed (${name}): ${error.message}`);
  return data.id;
}

async function main() {
  let inserted = 0, skipped = 0;
  for (const g of CATALOGUE) {
    const { data: existing } = await admin
      .from('grants').select('id').eq('reference_code', g.reference_code).maybeSingle();
    if (existing) { skipped++; continue; }

    const orgId = await getOrCreateOrg(g.org_name, g.org_type, g.org_url);
    const { data: grant, error } = await admin.from('grants').insert({
      organization_id: orgId,
      reference_code: g.reference_code,
      title: g.title,
      grant_type: g.grant_type,
      amount_display: g.amount_display,
      difficulty: g.difficulty,
      focus_areas: g.focus_areas,
      is_rolling: g.is_rolling,
      application_closes_at: g.application_closes_at,
      frequency: g.frequency,
      eligibility_age_min: g.eligibility_age_min ?? 15,
      eligibility_age_max: g.eligibility_age_max ?? 99,
      eligibility_citizenship: g.eligibility_citizenship,
      eligibility_stage: g.eligibility_note,
      offering_description: g.offering_description,
      application_instructions: g.application_instructions,
      is_external: true,
      external_portal_url: g.external_portal_url,
      status: 'active',
    }).select('id').single();
    if (error) throw new Error(`grant insert failed (${g.reference_code}): ${error.message}`);

    if (g.questions?.length) {
      const rows = g.questions.map((q: any, i: number) => ({
        grant_id: grant.id,
        question_key: q.question_key,
        label: q.label,
        ai_draft_hint: q.ai_draft_hint,
        field_type: 'long_text',
        required: true,
        order_index: i,
      }));
      const { error: qErr } = await admin.from('grant_questions').insert(rows);
      if (qErr) throw new Error(`questions insert failed (${g.reference_code}): ${qErr.message}`);
    }
    inserted++;
    console.log('seeded:', g.reference_code, '|', g.title, '|', g.questions?.length ?? 0, 'questions');
  }
  console.log(`done: ${inserted} inserted, ${skipped} already present`);
}

main().catch((err) => { console.error(err); process.exit(1); });
