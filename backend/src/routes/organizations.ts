// Organization profile + save founders + contact requests.

import type { FastifyInstance } from 'fastify';
import { requireUser, requireBacker } from '../auth.js';
import { admin } from '../db.js';
import { contactRequestSchema } from '../schemas/index.js';
import { notify } from '../notify.js';
import { uploadImage } from '../storage.js';

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
      'contact_name',
      'contact_email',
      'contact_phone',
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

  // POST /api/v1/organizations/me/logo — { image_base64, content_type }
  app.post('/me/logo', { preHandler: [requireUser, requireBacker] }, async (req, reply) => {
    const { data: member } = await admin
      .from('backer_members')
      .select('organization_id')
      .eq('user_id', req.user!.id)
      .maybeSingle();
    if (!member) return reply.code(404).send({ error: 'No organisation' });
    const { image_base64, content_type } = (req.body ?? {}) as {
      image_base64?: string;
      content_type?: string;
    };
    if (!image_base64 || !content_type) {
      return reply.code(400).send({ error: 'image_base64 and content_type required' });
    }
    try {
      const url = await uploadImage(member.organization_id, image_base64, content_type);
      const { data, error } = await admin
        .from('organizations')
        .update({ logo_url: url })
        .eq('id', member.organization_id)
        .select('*')
        .single();
      if (error) return reply.code(500).send({ error: error.message });
      return data;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
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

      const { data: org } = await admin
        .from('organizations')
        .select('name')
        .eq('id', member.organization_id)
        .single();
      const isInvite = (parsed.data.message ?? '').startsWith('Invitation');
      await notify(
        founderId,
        isInvite ? 'grant_invite' : 'contact_request',
        isInvite
          ? (org?.name ?? 'An organisation') + ' invited you to apply for a grant'
          : 'Contact request from ' + (org?.name ?? 'an organisation'),
        parsed.data.message || (parsed.data.preferred_time ? 'Preferred time: ' + parsed.data.preferred_time : undefined),
      );

      // NOTE: secondary feature per Jaslyn's WhatsApp — we record but do not
      // yet send an email or schedule a meeting. Will be picked up post-MVP.
      return data;
    },
  );
}
