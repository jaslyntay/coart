// Seed a dev test founder so the dev-mode auth bypass (X-Dev-User header)
// has a real row behind /api/v1/founders/me.
//
// Run from backend/: npx tsx scripts/seed-dev-founder.ts
//
// Idempotent: if a founder named "Jaslyn Tay" already exists, it just
// prints the existing UUID. profiles.id references auth.users(id), so we
// create a Supabase auth user first via the admin API.

import { admin } from '../src/db.js';

const DEV_EMAIL = 'jaslyn.dev@coart.test';

const FOUNDER = {
  full_name: 'Jaslyn Tay',
  age: 22,
  university: 'NUS',
  field_of_study: 'Arts & Sustainability',
  bio: 'Final-year Arts & Sustainability student at NUS, building community-led creative spaces...',
  focus_areas: ['Arts', 'Sustainability', 'Community'],
  past_experience:
    'Three years studying the intersection of cultural heritage and environmental practice. Founded Unwoventhread after organising community pop-ups in Tiong Bahru.',
};

async function main() {
  // Already seeded? (match by full_name)
  const { data: existing, error: findErr } = await admin
    .from('founders')
    .select('id')
    .eq('full_name', FOUNDER.full_name)
    .maybeSingle();
  if (findErr) throw new Error(`founders lookup failed: ${findErr.message}`);
  if (existing) {
    console.log(`Founder "${FOUNDER.full_name}" already seeded.`);
    console.log(`DEV_FOUNDER_ID=${existing.id}`);
    return;
  }

  // Create (or reuse) the auth user — profiles.id FKs auth.users(id).
  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    email_confirm: true,
  });
  if (createErr) {
    // Likely already exists from a partial prior run — look it up by email.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw new Error(`createUser failed (${createErr.message}) and listUsers failed (${listErr.message})`);
    const found = list.users.find((u) => u.email === DEV_EMAIL);
    if (!found) throw new Error(`createUser failed: ${createErr.message}`);
    userId = found.id;
  } else {
    userId = created.user.id;
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, role: 'founder' }, { onConflict: 'id' });
  if (profileErr) throw new Error(`profiles upsert failed: ${profileErr.message}`);

  const { error: founderErr } = await admin.from('founders').insert({ id: userId, ...FOUNDER });
  if (founderErr) throw new Error(`founders insert failed: ${founderErr.message}`);

  console.log(`Seeded founder "${FOUNDER.full_name}".`);
  console.log(`DEV_FOUNDER_ID=${userId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
