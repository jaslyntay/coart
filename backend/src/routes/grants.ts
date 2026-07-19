// Grants — list, detail, post a grant (backer only), save/unsave (founder).

import type { FastifyInstance } from 'fastify';
import { requireUser, requireFounder, requireBacker, optionalUser } from '../auth.js';
import { admin, userClient } from '../db.js';
import { createGrantSchema } from '../schemas/index.js';

export async function grantsRoutes(app: FastifyInstance) {
  // GET /api/v1/grants — list with filters
  app.get('/', { preHandler: optionalUser }, async (req, reply) => {
    const q = req.query as {
      focus_areas?: string;
      type?: string; // org type
      difficulty?: string;
      open_now?: string;
      q?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(q.limit ?? '24', 10), 100);
    const offset = parseInt(q.offset ?? '0', 10);

    let query = admin
      .from('grants')
      .select('*, organization:organizations(id, name, type, location, is_external)', {
        count: 'exact',
      })
      .eq('status', 'active')
      .range(offset, offset + limit - 1);

    if (q.focus_areas) {
      query = query.overlaps('focus_areas', q.focus_areas.split(','));
    }
    if (q.difficulty) {
      query = query.eq('difficulty', q.difficulty);
    }
    if (q.open_now === 'true') {
      const today = new Date().toISOString().slice(0, 10);
      query = query.or(`is_rolling.eq.true,application_closes_at.gte.${today}`);
    }
    if (q.q) {
      query = query.ilike('title', `%${q.q}%`);
    }

    const { data, count, error } = await query;
    if (error) return reply.code(500).send({ error: error.message });
    return { grants: data ?? [], total: count ?? 0 };
  });

  // GET /api/v1/grants/:id — detail + questions
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [{ data: grant, error: grantErr }, { data: questions, error: qErr }] = await Promise.all([
      admin
        .from('grants')
        .select('*, organization:organizations(*)')
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('grant_questions')
        .select('*')
        .eq('grant_id', id)
        .order('order_index', { ascending: true }),
    ]);
    if (grantErr) return reply.code(500).send({ error: grantErr.message });
    if (qErr) return reply.code(500).send({ error: qErr.message });
    if (!grant) return reply.code(404).send({ error: 'Grant not found' });

    return { ...grant, questions: questions ?? [] };
  });

  // POST /api/v1/grants — post a grant (backer only)
  app.post('/', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const parsed = createGrantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    // Look up the backer's org
    const { data: member } = await admin
      .from('backer_members')
      .select('organization_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();
    if (!member) return reply.code(400).send({ error: 'No organisation associated' });

    const { questions, ...grantFields } = parsed.data;

    const { data: grant, error } = await admin
      .from('grants')
      .insert({
        ...grantFields,
        organization_id: member.organization_id,
        status: 'active',
      })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    if (questions && questions.length > 0) {
      const rows = questions.map((q, i) => ({
        ...q,
        grant_id: grant.id,
        order_index: q.order_index ?? i,
      }));
      const { error: qErr } = await admin.from('grant_questions').insert(rows);
      if (qErr) return reply.code(500).send({ error: qErr.message });
    }

    return grant;
  });

  // PATCH /api/v1/grants/:id — backer closes (or reopens) their own grant
  app.patch('/:id', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = (req.body ?? {}) as { status?: string };
    if (!status || !['active', 'closed'].includes(status)) {
      return reply.code(400).send({ error: "status must be 'active' or 'closed'" });
    }
    const { data: member } = await admin
      .from('backer_members')
      .select('organization_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();
    if (!member) return reply.code(403).send({ error: 'No organisation' });
    const { data: grant } = await admin.from('grants').select('organization_id').eq('id', id).maybeSingle();
    if (!grant || grant.organization_id !== member.organization_id) {
      return reply.code(403).send({ error: 'Not your grant' });
    }
    const { data, error } = await admin.from('grants').update({ status }).eq('id', id).select('*').single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // POST /api/v1/grants/:id/save — founder saves grant
  app.post('/:id/save', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sb = userClient(req.user!.jwt);
    const { error } = await sb
      .from('founder_saved_grants')
      .insert({ founder_id: req.user!.id, grant_id: id });
    if (error && !error.message.includes('duplicate')) {
      return reply.code(500).send({ error: error.message });
    }
    return { ok: true };
  });

  app.delete('/:id/save', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sb = userClient(req.user!.jwt);
    const { error } = await sb
      .from('founder_saved_grants')
      .delete()
      .eq('founder_id', req.user!.id)
      .eq('grant_id', id);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // GET /api/v1/grants/:id/applications — backer views applicants
  app.get(
    '/:id/applications',
    { preHandler: [requireUser, requireBacker] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      // Verify the grant belongs to this backer's org
      const { data: member } = await admin
        .from('backer_members')
        .select('organization_id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (!member) return reply.code(403).send({ error: 'No organisation' });

      const { data: grant } = await admin
        .from('grants')
        .select('organization_id')
        .eq('id', id)
        .maybeSingle();
      if (!grant || grant.organization_id !== member.organization_id) {
        return reply.code(403).send({ error: 'Not your grant' });
      }

      // Answers are included: the org owns this grant (verified above), so
      // backers may read what founders wrote in applications to it.
      const [{ data, error }, { data: questions }] = await Promise.all([
        admin
          .from('applications')
          .select(
            'id, status, submitted_at, founder:founders(id, full_name, university, field_of_study, focus_areas), project:projects(id, title, tagline, description, focus_areas), answers:application_answers(question_key, value, ai_drafted)',
          )
          .eq('grant_id', id)
          .order('submitted_at', { ascending: false }),
        admin
          .from('grant_questions')
          .select('question_key, label, order_index')
          .eq('grant_id', id)
          .order('order_index', { ascending: true }),
      ]);
      if (error) return reply.code(500).send({ error: error.message });
      return { applications: data ?? [], questions: questions ?? [] };
    },
  );
}
