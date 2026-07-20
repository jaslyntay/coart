// In-app notifications for the signed-in user.

import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { admin } from '../db.js';

export async function notificationsRoutes(app: FastifyInstance) {
  // GET /api/v1/notifications — newest first
  app.get('/', { preHandler: requireUser }, async (req, reply) => {
    const { data, error } = await admin
      .from('notifications')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return reply.code(500).send({ error: error.message });
    const unread = (data ?? []).filter((n) => !n.read).length;
    return { notifications: data ?? [], unread };
  });

  // POST /api/v1/notifications/read-all
  app.post('/read-all', { preHandler: requireUser }, async (req, reply) => {
    const { error } = await admin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', req.user!.id)
      .eq('read', false);
    if (error) return reply.code(500).send({ error: error.message });
    return { ok: true };
  });
}
