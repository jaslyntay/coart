// Seeds 100 synthetic DEMO founder profiles for class/demo presentations.
// These are placeholder personas, not real people: every account lives on
// the reserved domain @demo.coartsg.test (cannot receive mail), has no
// photo (initials avatar renders), and is deterministic (seeded PRNG).
//
// Run from backend/:  npx tsx scripts/seed-demo-users.ts
// Remove them all:    npx tsx scripts/seed-demo-users.ts --cleanup
//
// IMPORTANT: coart has ONE database — these profiles appear on the live
// Discover page while seeded. Run --cleanup right after the demo.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DEMO_DOMAIN = 'demo.coartsg.test';
const COUNT = 100;

// Deterministic PRNG so reruns produce the same cast.
let seed = 20261030;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;

// ---------- name pools (Singapore mix) ----------
const CN_SURNAMES = ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Goh', 'Chua', 'Chan', 'Koh', 'Teo', 'Ang', 'Yeo', 'Tay', 'Ho', 'Low', 'Toh', 'Sim', 'Foo', 'Seah', 'Quek', 'Neo', 'Pang', 'Soh', 'Chew'];
const CN_GIVEN = ['Wei Ling', 'Jia Hui', 'Xin Yi', 'Kai Wen', 'Jun Jie', 'Zhi Hao', 'Yi Xuan', 'Hui Min', 'Shu Ting', 'Wen Jie', 'Jia Jun', 'Li Ting', 'Yu Xuan', 'Zi Xuan', 'Ming En', 'Kai Xin', 'Rui En', 'Jing Yi', 'Cheng Han', 'Yan Lin', 'Zhi Wei', 'Hao Ran', 'Si Qi', 'Jun Kai'];
const CN_WESTERN = ['Ethan', 'Chloe', 'Ryan', 'Natalie', 'Marcus', 'Rachel', 'Darren', 'Vanessa', 'Jovan', 'Clarissa', 'Brandon', 'Megan', 'Isaac', 'Nicole', 'Keith', 'Amanda', 'Shawn', 'Valerie', 'Lucas', 'Charmaine'];
const MY_GIVEN = ['Nur Aisyah', 'Danial', 'Irfan', 'Nabilah', 'Haziq', 'Syafiqah', 'Amirul', 'Farhana', 'Zulhilmi', 'Nadiah', 'Iman', 'Arif Hakim'];
const MY_SURNAMES = ['Rahman', 'Hassan', 'Ismail', 'Yusof', 'Zainal', 'Kamal', 'Hamid', 'Salleh'];
const IN_GIVEN = ['Arjun', 'Priya', 'Karthik', 'Shalini', 'Vikram', 'Meera', 'Rohan', 'Divya', 'Aditya', 'Lakshmi'];
const IN_SURNAMES = ['Nair', 'Menon', 'Pillai', 'Sharma', 'Krishnan', 'Raj', 'Subramaniam', 'Chandran'];
const EURASIAN = ['Clara de Souza', 'Joshua Pereira', 'Megan Oliveiro', 'Dylan Rozario', 'Tasha Fernandez'];

function makeName(i: number): string {
  if (i % 25 === 24) return EURASIAN[(i / 25) | 0 % EURASIAN.length] ?? pick(EURASIAN);
  const r = rnd();
  if (r < 0.72) {
    const s = pick(CN_SURNAMES);
    return chance(0.45) ? `${pick(CN_WESTERN)} ${s}` : `${s} ${pick(CN_GIVEN)}`;
  }
  if (r < 0.87) return `${pick(MY_GIVEN)} ${pick(MY_SURNAMES)}`;
  return `${pick(IN_GIVEN)} ${pick(IN_SURNAMES)}`;
}

// ---------- profile pools ----------
const SCHOOLS = ['NUS', 'NTU', 'SMU', 'SUTD', 'SIT', 'SUSS', 'Singapore Polytechnic', 'Ngee Ann Polytechnic', 'Temasek Polytechnic', 'Nanyang Polytechnic', 'Republic Polytechnic', 'LASALLE College of the Arts', 'NAFA', null];
const FIELDS = ['Business', 'Computer Science', 'Environmental Studies', 'Communications', 'Sociology', 'Design', 'Mechanical Engineering', 'Social Work', 'Arts Management', 'Food Science', 'Psychology', 'Life Sciences', 'Political Science', 'Accountancy', 'Industrial Design'];
const AREAS = ['Tiong Bahru', 'Bedok', 'Tampines', 'Jurong East', 'Yishun', 'Ang Mo Kio', 'Clementi', 'Punggol', 'Sengkang', 'Bukit Timah', 'Queenstown', 'Toa Payoh', 'Hougang', 'Woodlands', 'Pasir Ris', 'Serangoon', 'Kallang', 'Bishan'];
const FOCUS = ['Arts', 'Environment', 'Community', 'Education', 'Food', 'Heritage', 'Youth', 'Social Enterprise'];

type Arch = { title: string; tagline: string; desc: string; focus: string[]; format: string };
const PROJECTS: Arch[] = [
  { title: 'Second Stitch', tagline: 'Pop-up repair cafés for fast fashion waste', desc: 'Monthly repair cafés in community centres where residents learn to mend and upcycle clothing instead of binning it. Partnering tailors teach basic skills; collected textiles go to upcycling workshops.', focus: ['Environment', 'Community'], format: 'team' },
  { title: 'Kopi Stories', tagline: 'Recording hawker elders before their recipes vanish', desc: 'An oral-history project interviewing first-generation hawkers, pairing audio stories with illustrated recipe zines sold at the stalls themselves.', focus: ['Heritage', 'Food'], format: 'solo' },
  { title: 'MathBuddies SG', tagline: 'Free peer tutoring for Normal-stream students', desc: 'Matches JC and poly volunteers with Sec 1–3 students from low-income families for weekly maths sessions at void decks and CCs.', focus: ['Education', 'Youth'], format: 'team' },
  { title: 'Greenline Collective', tagline: 'Community composting for HDB estates', desc: 'Block-level compost bins managed by resident volunteers, turning food scraps into soil for estate gardens. Piloting in two precincts.', focus: ['Environment', 'Community'], format: 'social_enterprise' },
  { title: 'Wayang Reimagined', tagline: 'Street opera for a TikTok generation', desc: 'Short-form performances and behind-the-scenes content that introduce Chinese street opera to under-25s, with live shows at heritage festivals.', focus: ['Arts', 'Heritage'], format: 'team' },
  { title: 'PlateForward', tagline: 'Rescuing buffet surplus for migrant worker dorms', desc: 'Coordinates same-day pickup of untouched catering surplus from hotels and events, delivering to dormitories with volunteer riders.', focus: ['Food', 'Community'], format: 'social_enterprise' },
  { title: 'CodeAunties', tagline: 'Digital literacy classes taught by teens, for seniors', desc: 'Weekly sessions where youth volunteers teach seniors to use government apps, video calls and e-payments, in dialect where needed.', focus: ['Education', 'Community'], format: 'team' },
  { title: 'Mangrove Watch', tagline: 'Citizen science for Singapore’s last mangroves', desc: 'Trains student volunteers to run monthly biodiversity surveys at Sungei Buloh and Pasir Ris, feeding data to NParks researchers.', focus: ['Environment', 'Education'], format: 'team' },
  { title: 'Lepak Library', tagline: 'Pop-up reading corners in rental flat void decks', desc: 'Book swap shelves and weekend storytelling sessions for kids in rental blocks, stocked by donation drives at schools.', focus: ['Education', 'Community', 'Youth'], format: 'solo' },
  { title: 'Sambal Lab', tagline: 'A youth-run test kitchen for heritage recipes', desc: 'Workshops where grandparents and grandchildren cook family recipes together; the best are compiled into a community cookbook.', focus: ['Food', 'Heritage'], format: 'team' },
  { title: 'Mural Mornings', tagline: 'Neighbourhood murals painted with residents', desc: 'Co-designs estate murals with residents and seniors’ corners so the art reflects local memory, not just an artist’s portfolio.', focus: ['Arts', 'Community'], format: 'solo' },
  { title: 'EcoBrick Club', tagline: 'Turning school plastic waste into furniture', desc: 'Lunchtime clubs at secondary schools that compress plastic waste into ecobricks, assembled into benches for school gardens.', focus: ['Environment', 'Youth'], format: 'team' },
  { title: 'Night Owl Study', tagline: 'Late-night study spaces with peer mentors', desc: 'Keeps CC rooms open till midnight during exam season with free milo, quiet zones and poly seniors on hand for questions.', focus: ['Education', 'Youth'], format: 'team' },
  { title: 'Grandma’s Playlist', tagline: 'Music memory sessions for seniors with dementia', desc: 'Volunteers build personalised playlists of 60s–70s kampong-era songs for dementia day-care centres, run as weekly singalongs.', focus: ['Community', 'Heritage'], format: 'solo' },
  { title: 'Spice Route Tours', tagline: 'Student-led heritage walks of Little India', desc: 'Free weekend walking tours researched and guided by students, with proceeds from private bookings funding community meals.', focus: ['Heritage', 'Education'], format: 'social_enterprise' },
  { title: 'Rooftop Greens', tagline: 'Youth-run urban farm on an industrial rooftop', desc: 'Grows kang kong and cai xin on a borrowed rooftop, selling veg boxes to nearby offices and donating a share to food banks.', focus: ['Environment', 'Food'], format: 'startup' },
  { title: 'SignFirst', tagline: 'Basic sign language for F&B frontliners', desc: 'One-hour crash courses teaching café and hawker staff enough SgSL to serve Deaf customers, co-taught with Deaf trainers.', focus: ['Community', 'Education'], format: 'team' },
  { title: 'Botak Hill Sessions', tagline: 'Open-mic nights for young musicians', desc: 'Monthly open mics at parks and CCs giving teen musicians their first stage, with gear pooled from members.', focus: ['Arts', 'Youth'], format: 'team' },
  { title: 'ReWear SG', tagline: 'School uniform exchange across districts', desc: 'Collects outgrown uniforms, launders and redistributes them free before each school year, saving families money and textile waste.', focus: ['Environment', 'Community', 'Education'], format: 'social_enterprise' },
  { title: 'Makan Kakis', tagline: 'Lunch buddies for isolated seniors', desc: 'Pairs youth volunteers with seniors who eat alone, for weekly hawker lunches on us. Simple idea, measurable loneliness impact.', focus: ['Community', 'Food'], format: 'team' },
  { title: 'Peranakan Pixel', tagline: 'Digitising Peranakan tile and textile patterns', desc: 'Photographs and vectorises disappearing Peranakan motifs, releasing them as an open archive for designers and schools.', focus: ['Heritage', 'Arts'], format: 'solo' },
  { title: 'Trash Tag SG', tagline: 'Competitive beach cleanups with live leaderboards', desc: 'Gamifies coastal cleanups: teams weigh in their haul, climb a leaderboard, and sponsors convert kilos to donations.', focus: ['Environment', 'Youth'], format: 'team' },
  { title: 'First Gen Files', tagline: 'Guides for first-in-family university students', desc: 'Peer-written playbooks and mentoring circles for students whose parents never went to university, covering admissions to internships.', focus: ['Education', 'Social Enterprise'], format: 'team' },
  { title: 'Kampung Kitchen', tagline: 'Community fridge network in the heartlands', desc: 'Installs and stocks community fridges outside coffee shops, coordinating donations through a simple Telegram bot.', focus: ['Food', 'Community'], format: 'social_enterprise' },
  { title: 'Shutter Seniors', tagline: 'Photography walks pairing teens and retirees', desc: 'Monthly photo walks where seniors share neighbourhood history and teens teach phone photography; exhibits at the CC.', focus: ['Arts', 'Community', 'Heritage'], format: 'solo' },
  { title: 'Exam Decompress', tagline: 'Mental health peer circles during exam season', desc: 'Trained student facilitators run small decompress circles at schools, normalising help-seeking before burnout hits.', focus: ['Youth', 'Education'], format: 'team' },
  { title: 'Bottle2Brick', tagline: 'Glass recycling for island-wide bars', desc: 'Collects glass from bars (barely recycled today), crushing it into aggregate for landscaping. Testing with three Keong Saik outlets.', focus: ['Environment', 'Social Enterprise'], format: 'startup' },
  { title: 'Dialect Diaries', tagline: 'Teaching Hokkien and Teochew basics to Gen Z', desc: 'Casual classes and comics that teach enough dialect to talk to your grandparents, taught by seniors paid a stipend.', focus: ['Heritage', 'Education'], format: 'team' },
  { title: 'Sprout Scholars', tagline: 'Gardening as therapy for at-risk youth', desc: 'After-school gardening programme with youth-work undergrads, using plots as a low-pressure setting for mentoring.', focus: ['Youth', 'Environment'], format: 'team' },
  { title: 'Canvas Void Deck', tagline: 'Art jamming for rental-flat kids', desc: 'Free Saturday art sessions at rental blocks with donated supplies; term-end exhibitions in the lift lobby.', focus: ['Arts', 'Youth', 'Community'], format: 'solo' },
  { title: 'Lontong Logistics', tagline: 'Helping home-based food sellers go digital', desc: 'Sets up makcik home bakers with simple ordering pages and delivery coordination, taking zero commission.', focus: ['Food', 'Social Enterprise'], format: 'startup' },
  { title: 'Heritage Hunt SG', tagline: 'AR scavenger hunts through historic districts', desc: 'A web app that turns Chinatown and Katong into self-guided scavenger hunts, built with heritage bloggers.', focus: ['Heritage', 'Youth'], format: 'startup' },
  { title: 'StudyBento', tagline: 'Affordable meal bundles for studying students', desc: 'Negotiates off-peak hawker bundles near campuses so students eat proper dinners during exam grind, not cup noodles.', focus: ['Food', 'Youth'], format: 'team' },
  { title: 'Clean Coasts Club', tagline: 'Adopt-a-beach programme for secondary schools', desc: 'Each member school adopts 200m of coastline for a year with quarterly cleanups and classroom data analysis.', focus: ['Environment', 'Education'], format: 'team' },
  { title: 'Open Jalan', tagline: 'Accessibility audits of parks by wheelchair users', desc: 'Youth volunteers and wheelchair users co-audit park connectors, publishing accessibility maps and reporting barriers.', focus: ['Community', 'Environment'], format: 'team' },
  { title: 'Tingkat Tales', tagline: 'Illustrated children’s books from local folklore', desc: 'Writes and illustrates bilingual picture books from Singapore folklore, distributed free to preschools in rental estates.', focus: ['Arts', 'Heritage', 'Education'], format: 'solo' },
];

const STAGES = ['idea', 'idea', 'planning', 'planning', 'building', 'building', 'building', 'has_users'];
const PAST = [
  'Organised two community events through my CCA before deciding to run something of my own.',
  'Volunteered weekly with a family service centre for a year; this project grew out of what I saw there.',
  'Interned at a social enterprise last summer and wanted to try building one from scratch.',
  'Started this as a school project and kept going after the module ended.',
  'Ran my school’s environment club; this is the bigger version of what we tried there.',
  'First venture. Learning everything as I go and looking for people who’ve done it before.',
  'Helped a friend run a market stall for a year, which taught me the operations side.',
  'Was a grassroots volunteer with my CC youth network before starting this.',
];

function bio(f: { name: string; school: string | null; field: string | null; area: string; focus: string[]; arch?: Arch }): string {
  const who = f.school ? `${f.field} student at ${f.school}` : `young founder based in ${f.area}`;
  const doing = f.arch ? `currently building ${f.arch.title} — ${f.arch.tagline.toLowerCase()}` : `exploring ideas in ${f.focus.slice(0, 2).join(' and ').toLowerCase()}`;
  const closers = [
    'Looking for backers who can open doors, not just wallets.',
    'Keen to learn from anyone who’s run something similar.',
    'Small team, big neighbourhood ambitions.',
    'Happy to chat with anyone working on the same problems.',
    'Trying to prove this works in one estate before scaling.',
  ];
  return `${who.charAt(0).toUpperCase()}${who.slice(1)}, ${doing}. ${pick(closers)}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

async function cleanup() {
  const { data: list, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const demo = (list?.users ?? []).filter((u) => u.email?.endsWith('@' + DEMO_DOMAIN));
  console.log(`found ${demo.length} demo users`);
  let ok = 0;
  for (const u of demo) {
    const { error: e } = await sb.auth.admin.deleteUser(u.id); // cascades: profiles → founders → projects
    if (e) console.log(`FAILED ${u.email}: ${e.message}`); else ok++;
  }
  console.log(`deleted ${ok}/${demo.length} demo users (founders/projects removed by cascade)`);
}

async function seedOne(i: number, archPool: Arch[]) {
  const name = makeName(i);
  const email = `${slug(name)}.${i}@${DEMO_DOMAIN}`;
  const school = pick(SCHOOLS);
  const field = school ? pick(FIELDS) : null;
  const area = pick(AREAS);
  const hasProject = chance(0.7);
  const arch = hasProject ? (archPool.length ? archPool.splice(Math.floor(rnd() * archPool.length), 1)[0] : pick(PROJECTS)) : undefined;
  const focus = arch ? arch.focus : [pick(FOCUS), pick(FOCUS)].filter((v, x, a) => a.indexOf(v) === x);

  const { data: created, error: ue } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (ue) { console.log(`skip ${email}: ${ue.message}`); return false; }
  const id = created.user.id;

  const { error: pe } = await sb.from('profiles').insert({ id, role: 'founder' });
  if (pe) { console.log(`profile fail ${email}: ${pe.message}`); return false; }

  const createdAt = new Date(Date.now() - int(0, 60) * 86400000 - int(0, 86399) * 1000).toISOString();
  const { error: fe } = await sb.from('founders').insert({
    id,
    full_name: name,
    age: int(17, 29),
    university: school,
    field_of_study: field,
    location: `${area}, Singapore`,
    bio: bio({ name, school, field, area, focus, arch }),
    focus_areas: focus,
    past_experience: pick(PAST),
    open_to_backers: chance(0.9),
    seeking_grant_match: chance(0.4),
    created_at: createdAt,
  });
  if (fe) { console.log(`founder fail ${email}: ${fe.message}`); return false; }

  if (arch) {
    const { error: je } = await sb.from('projects').insert({
      founder_id: id,
      title: arch.title,
      tagline: arch.tagline,
      description: arch.desc,
      format: arch.format,
      stage: pick(STAGES),
      focus_areas: arch.focus,
      status: 'active',
      created_at: createdAt,
    });
    if (je) console.log(`project fail ${email}: ${je.message}`);
  }
  return true;
}

async function main() {
  if (process.argv.includes('--cleanup')) return cleanup();

  // Refuse to double-seed.
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const already = (list?.users ?? []).filter((u) => u.email?.endsWith('@' + DEMO_DOMAIN)).length;
  if (already > 0) {
    console.log(`${already} demo users already exist — run --cleanup first to reseed.`);
    return;
  }

  const archPool = [...PROJECTS];
  let ok = 0;
  for (let i = 0; i < COUNT; i++) {
    if (await seedOne(i, archPool)) ok++;
    if ((i + 1) % 10 === 0) console.log(`…${i + 1}/${COUNT}`);
  }
  console.log(`\nseeded ${ok}/${COUNT} demo founders (${DEMO_DOMAIN})`);
  console.log('REMINDER: these show on the live Discover page — run with --cleanup after the demo.');
}

main().catch((e) => { console.error(e); process.exit(1); });
