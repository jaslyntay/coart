// Organization profile + save founders + contact requests.

import type { FastifyInstance } from 'fastify';
import { requireUser, requireBacker } from '../auth.js';
import { admin } from '../db.js';
import { contactRequestSchema } from '../schemas/index.js';

export async function organizationsRoutes(app: FastifyInstance) {
  // GET /api/v1/organizations/me
  app.get('/me', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const { data: member } = await admin
      .from('backer_members')
      .select('organization_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();
    if (!member) return reply.code(404).send({ error: 'No organisation' });

    const { data, error } = await admin
      .from('organizations')
      .select('*')
      .eq('id', member.organization_id)
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // PATCH /api/v1/organizations/me
  app.patch('/me', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const { data: member } = await admin
      .from('backer_members')
      .select('organization_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();
    if (!member) return reply.code(404).send({ error: 'No organisation' });

    const body = req.body as Record<string, unknown>;
    const allowed = [
      'name',
      'type',
      'location',
      'description',
      'focus_areas',
      'external_url',
      'logo_url',
    ];
    const update: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) update[k] = body[k];

    const { data, error } = await admin
      .from('organizations')
      .update(update)
      .eq('id', member.organization_id)
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // GET /api/v1/organizations/me/backed — projects this org has backed
  app.get('/me/backed', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const { data: member } = await admin
      .from('backer_members')
      .select('organization_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();
    if (!member) return reply.code(404).send({ error: 'No organisation' });

    const { data, error } = await admin
      .from('backings')
      .select('id, backed_at, note, project:projects(id, title, tagline, status, founder:founders(id, full_name, university)), grant:grants(id, title)')
      .eq('organization_id', member.organization_id)
      .order('backed_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return { backings: data ?? [] };
  });

  // GET /api/v1/organizations/:id — public
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await admin
      .from('organizations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data) return reply.code(404).send({ error: 'Not found' });
    return data;
  });

  // POST /api/v1/founders/:id/contact-request — wire under /api/v1/organizations
  // because it's a backer action on a founder.
  app.post(
    '/contact/:founderId',
    { preHandler: [requireUser, requireBacker] },
    async (req, reply) => {
      const { founderId } = req.params as { founderId: string };
      const parsed = contactRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const { data: member } = await admin
        .from('backer_members')
        .select('organization_id')
        .eq('user_id', req.user!.id)
        .maybeSingle();
      if (!member) return reply.code(403).send({ error: 'No organisation' });

      const { data, error } = await admin
        .from('contact_requests')
        .insert({
          organization_id: member.organization_id,
          founder_id: founderId,
          ...parsed.data,
        })
        .select('*')
        .single();
      if (error) return reply.code(500).send({ error: error.message });

      // NOTE: secondary feature per Jaslyn's WhatsApp — we record but do not
      // yet send an email or schedule a meeting. Will be picked up post-MVP.
      return data;
    },
  );
}
