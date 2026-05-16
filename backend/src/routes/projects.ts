// Projects — founder owns these. Multiple per founder.

import type { FastifyInstance } from 'fastify';
import { requireUser, requireFounder } from '../auth.js';
import { admin, userClient } from '../db.js';
import { createProjectSchema, updateProjectSchema } from '../schemas/index.js';

export async function projectsRoutes(app: FastifyInstance) {
  // GET /api/v1/projects/me — current founder's projects
  app.get('/me', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const sb = userClient(req.user!.jwt);
    const { data, error } = await sb
      .from('projects')
      .select('*')
      .eq('founder_id', req.user!.id)
      .order('updated_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return { projects: data ?? [] };
  });

  // POST /api/v1/projects
  app.post('/', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const sb = userClient(req.user!.jwt);
    const { data, error } = await sb
      .from('projects')
      .insert({ ...parsed.data, founder_id: req.user!.id })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // PATCH /api/v1/projects/:id
  app.patch('/:id', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const sb = userClient(req.user!.jwt);
    const { data, error } = await sb
      .from('projects')
      .update(parsed.data)
      .eq('id', id)
      .eq('founder_id', req.user!.id)
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data) return reply.code(404).send({ error: 'Project not found' });
    return data;
  });

  // DELETE /api/v1/projects/:id — soft delete via status=archived
  app.delete('/:id', { preHandler: [requireUser, requireFounder] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const sb = userClient(req.user!.jwt);
    const { error } = await sb
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', id)
      .eq('founder_id', req.user!.id);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });

  // GET /api/v1/projects/:id — public project detail
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await admin.from('projects').select('*').eq('id', id).maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data || data.status !== 'active')
      return reply.code(404).send({ error: 'Project not found' });
    return data;
  });
}
