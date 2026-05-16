// Applications — the core flow that connects founders to grants.
//
// Flow:
// 1. POST /applications → create a draft for (project_id, grant_id)
// 2. PATCH /applications/:id/answers → upsert answers as the founder writes
// 3. POST /applications/:id/submit → submit for an internal grant
// 4. POST /applications/:id/submit-external → record external submission (email/copy/portal)
// 5. PATCH /applications/:id/status → backer updates status (in_review/shortlisted/etc)

import type { FastifyInstance } from 'fastify';
import { requireUser, requireFounder, requireBacker } from '../auth.js';
import { admin, userClient } from '../db.js';
import {
  createApplicationSchema,
  upsertAnswersSchema,
  submitExternalSchema,
  updateApplicationStatusSchema,
} from '../schemas/index.js';

export async function applicationsRoutes(app: FastifyInstance) {
  // GET /api/v1/applications/me
  app.get('/me', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const sb = userClient(req.user!.jwt);
    const { data, error } = await sb
      .from('applications')
      .select('*, project:projects(id, title), grant:grants(id, title, organization_id)')
      .eq('founder_id', req.user!.id)
      .order('updated_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return { applications: data ?? [] };
  });

  // POST /api/v1/applications — start a draft
  app.post('/', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const parsed = createApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { project_id, grant_id } = parsed.data;
    const sb = userClient(req.user!.jwt);

    // Check existing draft to avoid duplicates
    const { data: existing } = await sb
      .from('applications')
      .select('*')
      .eq('founder_id', req.user!.id)
      .eq('project_id', project_id)
      .eq('grant_id', grant_id)
      .eq('status', 'draft')
      .maybeSingle();
    if (existing) return existing;

    const { data, error } = await sb
      .from('applications')
      .insert({
        founder_id: req.user!.id,
        project_id,
        grant_id,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // GET /api/v1/applications/:id — with answers
  app.get('/:id', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sb = userClient(req.user!.jwt);

    const { data: appli, error } = await sb
      .from('applications')
      .select(
        '*, project:projects(*), grant:grants(*, questions:grant_questions(*))',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!appli) return reply.code(404).send({ error: 'Application not found' });

    const { data: answers } = await sb
      .from('application_answers')
      .select('*')
      .eq('application_id', id);

    return { ...appli, answers: answers ?? [] };
  });

  // PATCH /api/v1/applications/:id/answers — upsert
  app.patch('/:id/answers', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = upsertAnswersSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const sb = userClient(req.user!.jwt);
    const rows = parsed.data.answers.map((a) => ({
      application_id: id,
      ...a,
    }));

    const { error } = await sb
      .from('application_answers')
      .upsert(rows, { onConflict: 'application_id,question_key' });
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true, count: rows.length };
  });

  // POST /api/v1/applications/:id/submit — internal grant
  app.post('/:id/submit', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sb = userClient(req.user!.jwt);

    // Verify this is for an internal grant
    const { data: appli } = await sb
      .from('applications')
      .select('*, grant:grants(is_external)')
      .eq('id', id)
      .maybeSingle();
    if (!appli) return reply.code(404).send({ error: 'Application not found' });
    if ((appli as any).grant?.is_external) {
      return reply.code(400).send({ error: 'Use /submit-external for external grants' });
    }

    const { data, error } = await sb
      .from('applications')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    // TODO: bump grants.application_count via a DB trigger (cleaner than
    // doing it inline — racy under load).

    return data;
  });

  // POST /api/v1/applications/:id/submit-external — external grant
  app.post(
    '/:id/submit-external',
    { preHandler: [requireUser, requireFounder] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = submitExternalSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
      }

      const sb = userClient(req.user!.jwt);
      const { data, error } = await sb
        .from('applications')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          external_confirmation: true,
          external_confirmed_at: new Date().toISOString(),
          external_confirmation_method: parsed.data.method,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return reply.code(500).send({ error: error.message });

      // TODO: if method === 'email_sent', actually send the email here via Resend.
      // For MVP we just record the confirmation.

      return data;
    },
  );

  // PATCH /api/v1/applications/:id/status — backer updates
  app.patch(
    '/:id/status',
    { preHandler: [requireUser, requireBacker] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = updateApplicationStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
      }

      // Verify the application is for this backer's org
      const { data: member } = await admin
        .from('backer_members')
        .select('organization_id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (!member) return reply.code(403).send({ error: 'No organisation' });

      const { data: appli } = await admin
        .from('applications')
        .select('*, grant:grants(organization_id, id)')
        .eq('id', id)
        .maybeSingle();
      if (!appli) return reply.code(404).send({ error: 'Application not found' });
      const grantOrgId = (appli as any).grant?.organization_id;
      if (grantOrgId !== member.organization_id) {
        return reply.code(403).send({ error: 'Not your grant' });
      }

      const { data, error } = await admin
        .from('applications')
        .update({ status: parsed.data.status })
        .eq('id', id)
        .select('*')
        .single();
      if (error) return reply.code(500).send({ error: error.message });

      // If backed, also create a backings row
      if (parsed.data.status === 'backed') {
        await admin.from('backings').insert({
          organization_id: member.organization_id,
          project_id: appli.project_id,
          application_id: id,
          grant_id: appli.grant_id,
        });
      }

      return data;
    },
  );

  // POST /api/v1/applications/:id/shortlist — shortcut to add to shortlist
  app.post(
    '/:id/shortlist',
    { preHandler: [requireUser, requireBacker] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { data: member } = await admin
        .from('backer_members')
        .select('organization_id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (!member) return reply.code(403).send({ error: 'No organisation' });

      const { error } = await admin.from('shortlist_entries').insert({
        organization_id: member.organization_id,
        application_id: id,
      });
      if (error && !error.message.includes('duplicate')) {
        return reply.code(500).send({ error: error.message });
      }
      await admin.from('applications').update({ status: 'shortlisted' }).eq('id', id);
      return { ok: true };
    },
  );
}
