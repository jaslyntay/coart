// Quarterly catalogue refresh — October 2026 sweep.
// Verified against official sources on 2026-10-29 (NYC, MCCY, NAC, NHB,
// SIF, NEA, MSE, DBS, raiSE, NParks, Majurity). Applies field corrections
// and closes grants whose programmes are discontinued or indefinitely
// paused (status='closed' hides them from founders; rows are kept).
// Run from backend/: npx tsx scripts/refresh-grants-oct-2026.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Patch = Record<string, unknown> & { note?: string };

// note (if set) is PREPENDED to application_instructions.
const PATCHES: Record<string, Patch> = {
  'NEA-3R-2025': {
    amount_display: 'Up to 80% of qualifying costs, capped at S$1,000,000',
    note: 'Open to organisations only (companies, non-profits, schools) — not individuals.',
  },
  'MSE-SGEF-SPROUT-2026': {
    application_opens_at: '2026-09-01',
    application_closes_at: '2026-12-31',
    note: 'Current cycle: 1 Sep – 31 Dec 2026. Applications now go through the apply.gov.sg grants portal (search "SG Eco Fund"; individuals log in with Singpass).',
  },
  'NYC-NYF-2025': {
    amount_display: 'Up to 80% of project cost (capped S$10,000–S$100,000 by track)',
    note: 'Individuals (SC/PR, aged 15–35) apply under the Youth Leadership Development or Research tracks, open year-round; the Youth Programmes track is for registered organisations during grant calls.',
  },
  'NYC-YCM-2026': {
    amount_display: 'Up to S$5,000 (themed tracks up to S$8,000)',
  },
  'NYC-MICRO-2026': {
    is_rolling: false,
    application_opens_at: '2026-11-01',
    application_closes_at: null,
    external_portal_url: 'https://www.nyc.gov.sg/youth-action-challenge',
    note: 'Applications reopen after 31 Oct 2026 through the OurSG Grants portal, tied to NYC’s Impact, IRL programme. Register interest on the NYC page meanwhile.',
  },
  'NPARKS-SECUF-2026': {
    external_portal_url: 'https://go.gov.sg/secuf-interestform',
  },
  'NAC-CG-2026': {
    external_portal_url: 'https://oursggrants.gov.sg/grants/cg/instruction',
    note: 'FY26 cycle closed 15 May 2026; runs once a year — next cycle dates not yet announced.',
  },
  'NAC-PNP-2026': {
    title: 'Presentation & Participation Grant (General)',
    amount_display: 'Up to S$100,000 per financial year (up to 70% of project costs for individuals)',
    note: 'From Apr 2026 the Production Grant and P&P (Extended Play) merged into this General grant and the cap rose to S$100,000. Three cycles a year; current deadline 15 Dec 2026 (next: 15 Apr 2027).',
  },
  'NHB-HGS-MINOR-2026': {
    note: 'Both 2026 windows have closed. Next application window: 4 Mar – 15 Apr 2027 (OurSG Grants portal). Funding coverage was raised to 80% of qualifying costs in 2026.',
  },
  'SIF-YSE-2025': {
    note: 'YSE Global is paused for a strategic review — no new application dates announced. Check the SIF page before planning around this grant.',
  },
  'DBSF-GRANT-2026': {
    note: '2026 cycle closed 13 Jul; results due Dec 2026 and the next cycle is not yet announced. Open to registered social enterprises/SMEs with a 2+ year track record — not individuals.',
  },
};

// Programmes that no longer exist or are closed indefinitely.
const CLOSE: Record<string, string> = {
  'NEA-EEF-2025': 'No NEA fund by this name exists (catalogue mislabel). Closest live schemes: NEA Call for Ideas Fund / Partnership Fund.',
  'NAC-AEF-2025': 'Not present in NAC’s restructured 2026 funding directory; treat as discontinued.',
  'TMT-SGSTRONG-2026': 'Groundup@Sg funding applications are closed; SG Strong evolved into a fellowship programme with no open grant process.',
};

async function main() {
  for (const [ref, patch] of Object.entries(PATCHES)) {
    const { note, ...fields } = patch;
    const { data: g } = await sb.from('grants').select('id, application_instructions').eq('reference_code', ref).maybeSingle();
    if (!g) { console.log(ref, ': NOT FOUND'); continue; }
    const update: Record<string, unknown> = { ...fields };
    if (note) {
      const existing = (g.application_instructions ?? '').replace(/^\[Verified Oct 2026\][^\n]*\n?/, '');
      update.application_instructions = `[Verified Oct 2026] ${note}\n${existing}`.trim();
    }
    const { error } = await sb.from('grants').update(update).eq('id', g.id);
    console.log(ref, ':', error ? error.message : 'updated ' + Object.keys(update).join(', '));
  }

  for (const [ref, reason] of Object.entries(CLOSE)) {
    const { data: g } = await sb.from('grants').select('id').eq('reference_code', ref).maybeSingle();
    if (!g) { console.log(ref, ': NOT FOUND'); continue; }
    const { count } = await sb.from('applications').select('id', { count: 'exact', head: true }).eq('grant_id', g.id);
    const { error } = await sb.from('grants').update({
      status: 'closed',
      application_instructions: `[Removed from catalogue Oct 2026] ${reason}`,
    }).eq('id', g.id);
    console.log(ref, ':', error ? error.message : `closed (${count ?? 0} applications existed)`);
  }

  const { data: active } = await sb.from('grants').select('reference_code, title, status').eq('status', 'active').order('reference_code');
  console.log('\nactive grants now:', (active ?? []).length);
  (active ?? []).forEach((g) => console.log(' -', g.reference_code ?? '(internal)', '·', g.title));
}

main().catch((e) => { console.error(e); process.exit(1); });
