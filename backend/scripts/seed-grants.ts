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
  tbyn: { name: 'Tiong Bahru Youth Network', type: 'community', location: 'Tiong Bahru, Singapore' },
  nea: { name: 'National Environment Agency', type: 'government', location: 'Singapore', external_url: 'https://www.nea.gov.sg' },
};

const GRANTS = [
  {
    org: 'nyc',
    reference_code: 'NYC-NYF-2025',
    title: 'National Youth Fund',
    grant_type: 'cash',
    amount_display: 'Up to 80% of project cost',
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
  {
    org: 'nac',
    reference_code: 'NAC-AEF-2025',
    title: 'Arts Education Fund',
    grant_type: 'cash',
    amount_display: 'Up to S$50,000',
    difficulty: 'moderate',
    focus_areas: ['Arts', 'Education'],
    is_rolling: false,
    application_closes_at: '2026-03-31',
    offering_description:
      'For projects that bring arts programming to underserved communities across Singapore.',
    application_instructions: 'Apply via the NAC funding and schemes portal.',
    is_external: true,
    external_portal_url: 'https://www.nac.gov.sg/support/funding-and-schemes',
    status: 'active',
  },
  {
    org: 'tbyn',
    reference_code: 'TBYN-CIG-2025',
    title: 'Community Impact Grant',
    grant_type: 'cash',
    amount_display: 'Up to S$5,000',
    difficulty: 'easy',
    focus_areas: ['Community'],
    is_rolling: false,
    application_closes_at: '2026-12-31',
    offering_description:
      'Supports youth-led projects with a direct impact on the Tiong Bahru and surrounding communities.',
    application_instructions: 'Apply directly on coart.',
    is_external: false,
    status: 'active',
  },
  {
    org: 'nea',
    reference_code: 'NEA-3R-2025',
    title: 'NEA 3R Fund',
    grant_type: 'cash',
    amount_display: 'Up to S$300,000',
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
  {
    org: 'nea',
    reference_code: 'NEA-EEF-2025',
    title: 'NEA Environmental Education Fund',
    grant_type: 'cash',
    amount_display: 'Up to S$50,000',
    difficulty: 'moderate',
    focus_areas: ['Environment', 'Education'],
    is_rolling: true,
    offering_description:
      'Funds environmental education programmes that raise awareness and build capability for sustainable behaviours, especially among youth.',
    application_instructions:
      'Draft your answers on coart; the EEF supports environmental education programmes and submissions go to NEA.',
    is_external: true,
    external_portal_url: 'https://www.nea.gov.sg/programmes-grants/grants-and-awards',
    status: 'active',
    questions: [
      { question_key: 'org', label: 'Organisation name and background', placeholder: 'Describe your organisation and its environmental work...', ai_draft_hint: 'Introduce the organisation, when it was founded, and its environmental education track record.' },
      { question_key: 'programme', label: 'Programme description - what environmental education will you deliver?', placeholder: 'Describe the programme content, format, and delivery...', ai_draft_hint: 'Describe content, format, frequency, and delivery of the education programme.' },
      { question_key: 'target', label: 'Target audience and expected reach', placeholder: 'Who will participate and how many people will you reach?', ai_draft_hint: 'Name the primary audience, expected direct participants, and secondary reach.' },
      { question_key: 'outcomes', label: 'Expected environmental outcomes and how you will measure them', placeholder: 'What behaviour change do you expect and how will you track it?', ai_draft_hint: 'List expected behaviour changes and concrete measurement methods (surveys, attendance, follow-ups).' },
      { question_key: 'budget', label: 'Programme budget breakdown', placeholder: 'Break down costs across materials, facilitators, venue, outreach...', ai_draft_hint: 'Break costs into facilitators, materials, venue/logistics, and outreach with percentages and a total.' },
    ],
  },
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
