// POST /api/v1/auth/profile
//
// Called once after a user signs up via Supabase Auth on the frontend.
// Creates their profiles row + founders/organizations + backer_members.
// This is the only auth-related endpoint we own; Supabase handles signin/refresh.

import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { admin } from '../db.js';
import { createProfileSchema } from '../schemas/index.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/profile', { preHandler: requireUser }, async (req, reply) => {
    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const { role, founder, organization } = parsed.data;

    // 1. Insert profiles row
    const { error: profileErr } = await admin
      .from('profiles')
      .insert({ id: userId, role })
      .single();
    if (profileErr) {
      return reply.code(400).send({ error: 'Profile already exists or insert failed', details: profileErr.message });
    }

    // 2. Insert role-specific row
    if (role === 'founder') {
      if (!founder) return reply.code(400).send({ error: 'founder details required' });
      const { error } = await admin.from('founders').insert({ id: userId, ...founder });
      if (error) return reply.code(400).send({ error: error.message });
    } else {
      // backer — create org if new, attach via backer_members
      if (!organization) return reply.code(400).send({ error: 'organization details required' });
      const { data: org, error: orgErr } = await admin
        .from('organizations')
        .insert({ ...organization, is_external: false })
        .select('id')
        .single();
      if (orgErr || !org) return reply.code(400).send({ error: orgErr?.message ?? 'org insert failed' });

      const { error: memberErr } = await admin
        .from('backer_members')
        .insert({ user_id: userId, organization_id: org.id, role: 'admin' });
      if (memberErr) return reply.code(400).send({ error: memberErr.message });
    }

    return { ok: true };
  });
}
