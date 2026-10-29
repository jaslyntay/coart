// Seeds the curated Singapore grants catalogue (previously hard-coded in
// founder.html) into organizations / grants / grant_questions.
//
// Run from backend/: npx tsx scripts/seed-grants.ts
// Idempotent: grants are matched by reference_code, orgs by name.

import { admin } from '../src/db.js';

type OrgSeed = { name: string; type: string; location: string; external_url?: string };

const ORGS: Record<string, OrgSeed> = {
  nyc: { name: 'National Youth Council', type: 'government', location: 'Singapore', external_url: 'https://www.nyc.gov.sg' },
  sif: { name: 'Singapore International Foundation', type: 'corporate', location: 'Singapore', external_url: 'https://www.sif.org.sg' },
  nac: { name: 'National Arts Council', type: 'government', location: 'Singapore', external_url: 'https://www.nac.gov.sg' },
  nea: { name: 'National Environment Agency', type: 'government', location: 'Singapore', external_url: 'https://www.nea.gov.sg' },
};

const GRANTS = [
  {
    org: 'nyc',
    reference_code: 'NYC-NYF-2025',
    title: 'National Youth Fund',
    grant_type: 'cash',
    amount_display: 'Up to 80% of project cost (capped S$10,000–S$100,000 by track)',
    difficulty: 'easy',
    focus_areas: ['Community', 'Arts', 'Environment', 'Education'],
    is_rolling: true,
    offering_description:
      "Singapore's most accessible youth grant, open to all registered youth-led initiatives. No fixed deadline — apply anytime.",
    application_instructions: 'Apply through the NYC grants portal.',
    is_external: true,
    external_portal_url: 'https://www.nyc.gov.sg/programmes-grants/grants---national-youth-fund',
    status: 'active',
  },
  {
    org: 'sif',
    reference_code: 'SIF-YSE-2025',
    title: 'Young Social Entrepreneurs',
    grant_type: 'incubation',
    amount_display: 'Up to S$20,000',
    difficulty: 'selective',
    focus_areas: ['Community', 'Education'],
    is_rolling: false,
    application_opens_at: '2026-01-01',
    application_closes_at: '2026-03-31',
    frequency: 'Jan–Mar intake, annual',
    offering_description:
      '6-month incubator programme with mentorship, funding, and a cohort of fellow social entrepreneurs.',
    application_instructions: 'Apply via the SIF YSE Global page during the intake window.',
    is_external: true,
    external_portal_url: 'https://www.sif.org.sg/Our-Work/Youth/YSE-Global',
    status: 'active',
  },
  // NAC-AEF-2025 removed Oct 2026: no such scheme in NAC's restructured
  // funding directory. TBYN-CIG-2025 (mock org from the prototype) removed
  // too — never seed fictitious grantor organisations.
  {
    org: 'nea',
    reference_code: 'NEA-3R-2025',
    title: 'NEA 3R Fund',
    grant_type: 'cash',
    amount_display: 'Up to 80% of qualifying costs, capped at S$1,000,000',
    difficulty: 'moderate',
    focus_areas: ['Environment'],
    is_rolling: true,
    offering_description:
      'Supports projects that promote reduce, reuse, and recycle behaviours among households, schools, and communities in Singapore.',
    application_instructions:
      'NEA requires a Pre-Assessment Form emailed to WM_Fund@nea.gov.sg. Draft your answers on coart and submit them by email.',
    is_external: true,
    external_portal_url: 'https://www.nea.gov.sg/programmes-grants/grants-and-awards/3r-fund',
    external_submission_email: 'WM_Fund@nea.gov.sg',
    status: 'active',
    questions: [
      { question_key: 'org', label: 'Organisation name and type', placeholder: 'e.g. a registered non-profit...', ai_draft_hint: 'State the organisation name, its legal form, and its waste-reduction mission in one or two sentences.' },
      { question_key: 'project', label: 'Project description - what waste problem does it solve?', placeholder: 'Describe your project and the waste it will reduce or recycle...', ai_draft_hint: 'Describe the project, the waste stream it targets, and the estimated tonnage diverted.' },
      { question_key: 'tonnage', label: 'Estimated waste reduced / recycled (minimum 100 tonnes over project duration)', placeholder: 'e.g. 120 tonnes of textile waste over 18 months...', ai_draft_hint: 'Give a tonnage estimate with the calculation basis (item weights × throughput × duration).' },
      { question_key: 'timeline', label: 'Project timeline (preparatory max 6 months, operations max 3 years)', placeholder: 'e.g. Month 1-3: setup, Month 4-18: operations...', ai_draft_hint: 'Split into a preparatory phase (max 6 months) and an operations phase (max 3 years).' },
      { question_key: 'budget', label: 'Budget breakdown - manpower, equipment, professional services, other', placeholder: 'Break down qualifying costs across the four categories...', ai_draft_hint: 'Break qualifying costs into manpower, equipment/materials, professional services, and other, with percentages and a total.' },
    ],
  },
  // NEA-EEF-2025 removed Oct 2026: no NEA fund by this name exists (the
  // entry was a mislabel). Closest live schemes for a future entry: NEA
  // Call for Ideas Fund / Partnership Fund.
];

async function getOrCreateOrg(seed: OrgSeed): Promise<string> {
  const { data: existing, error: findErr } = await admin
    .from('organizations')
    .select('id')
    .eq('name', seed.name)
    .maybeSingle();
  if (findErr) throw new Error(`org lookup failed: ${findErr.message}`);
  if (existing) return existing.id;

  const { data, error } = await admin
    .from('organizations')
    .insert({ ...seed, is_external: true })
    .select('id')
    .single();
  if (error) throw new Error(`org insert failed (${seed.name}): ${error.message}`);
  return data.id;
}

async function main() {
  const orgIds: Record<string, string> = {};
  for (const [key, seed] of Object.entries(ORGS)) {
    orgIds[key] = await getOrCreateOrg(seed);
  }

  let inserted = 0;
  let skipped = 0;
  for (const g of GRANTS) {
    const { data: existing } = await admin
      .from('grants')
      .select('id')
      .eq('reference_code', g.reference_code)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }
    const { org, questions, ...fields } = g as typeof g & { questions?: unknown[] };
    const { data: grant, error } = await admin
      .from('grants')
      .insert({ ...fields, organization_id: orgIds[org] })
      .select('id')
      .single();
    if (error) throw new Error(`grant insert failed (${g.reference_code}): ${error.message}`);

    if (questions?.length) {
      const rows = (questions as Record<string, unknown>[]).map((q, i) => ({
        ...q,
        grant_id: grant.id,
        field_type: 'long_text',
        order_index: i,
      }));
      const { error: qErr } = await admin.from('grant_questions').insert(rows);
      if (qErr) throw new Error(`questions insert failed (${g.reference_code}): ${qErr.message}`);
    }
    inserted++;
  }
  console.log(`grants seeded: ${inserted} inserted, ${skipped} already present`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
