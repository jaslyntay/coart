// Founder CRUD + dashboard stats.
//
// All routes require auth except the public founder detail.

import type { FastifyInstance } from 'fastify';
import { requireUser, requireFounder, requireBacker } from '../auth.js';
import { admin, userClient } from '../db.js';
import { updateFounderSchema } from '../schemas/index.js';

const FOUNDER_FIELDS_REQUIRED = [
  'full_name',
  'age',
  'university',
  'field_of_study',
  'location',
  'bio',
  'focus_areas',
  'profile_photo_url',
  'linkedin_url',
  'past_experience',
] as const;

function calcCompletion(f: Record<string, unknown>): number {
  let filled = 0;
  for (const k of FOUNDER_FIELDS_REQUIRED) {
    const v = f[k];
    if (Array.isArray(v) ? v.length > 0 : Boolean(v)) filled++;
  }
  return Math.round((filled / FOUNDER_FIELDS_REQUIRED.length) * 100);
}

export async function foundersRoutes(app: FastifyInstance) {
  // GET /api/v1/founders/me
  app.get('/me', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const sb = userClient(req.user!.jwt);
    const { data, error } = await sb.from('founders').select('*').eq('id', req.user!.id).maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data) return reply.code(404).send({ error: 'Founder profile not found' });
    return { ...data, profile_completion_pct: calcCompletion(data) };
  });

  // PATCH /api/v1/founders/me
  app.patch('/me', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const parsed = updateFounderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const sb = userClient(req.user!.jwt);
    const { data, error } = await sb
      .from('founders')
      .update(parsed.data)
      .eq('id', req.user!.id)
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return { ...data, profile_completion_pct: calcCompletion(data) };
  });

  // GET /api/v1/founders/me/stats — dashboard numbers
  app.get('/me/stats', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const founderId = req.user!.id;

    const [{ count: activeProjects }, { count: openGrants }, { count: viewsThisMonth }] =
      await Promise.all([
        admin
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('founder_id', founderId)
          .eq('status', 'active'),
        admin
          .from('grants')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
        admin
          .from('profile_views')
          .select('id', { count: 'exact', head: true })
          .eq('founder_id', founderId)
          .gte('viewed_at', new Date(new Date().setDate(1)).toISOString()),
      ]);

    return {
      active_projects: activeProjects ?? 0,
      profile_views_this_month: viewsThisMonth ?? 0,
      open_grants_count: openGrants ?? 0,
    };
  });

  // GET /api/v1/founders — discover (backer only)
  app.get('/', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const q = req.query as {
      focus_areas?: string;
      stage?: string;
      q?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(q.limit ?? '24', 10), 100);
    const offset = parseInt(q.offset ?? '0', 10);

    let query = admin
      .from('founders')
      .select('*', { count: 'exact' })
      .eq('open_to_backers', true)
      .range(offset, offset + limit - 1);

    if (q.focus_areas) {
      query = query.overlaps('focus_areas', q.focus_areas.split(','));
    }
    if (q.q) {
      query = query.or(`full_name.ilike.%${q.q}%,bio.ilike.%${q.q}%`);
    }

    const { data, count, error } = await query;
    if (error) return reply.code(500).send({ error: error.message });
    return { founders: data ?? [], total: count ?? 0 };
  });

  // GET /api/v1/founders/:id — public founder detail
  app.get('/:id', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await admin.from('founders').select('*').eq('id', id).maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data || !data.open_to_backers)
      return reply.code(404).send({ error: 'Founder not found or not public' });

    // Log a view (debounce 1/day per viewer handled elsewhere — left as TODO)
    if (req.user!.role === 'backer') {
      const { data: member } = await admin
        .from('backer_members')
        .select('organization_id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (member) {
        await admin.from('profile_views').insert({
          founder_id: id,
          viewer_organization_id: member.organization_id,
        });
      }
    }

    return data;
  });
}
