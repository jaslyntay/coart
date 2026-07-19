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
  // GET /api/v1/auth/me — who am I and what role do I have?
  // role === null means signed in but not yet onboarded.
  app.get('/me', { preHandler: requireUser }, async (req) => {
    return { id: req.user!.id, email: req.user!.email ?? null, role: req.user!.role };
  });

  // DELETE /api/v1/auth/profile — reset role so the user can re-onboard.
  // For a mistaken role choice: removes the role-specific rows (cascading
  // founder data), keeps the auth user so they can sign in and pick again.
  app.delete('/profile', { preHandler: requireUser }, async (req, reply) => {
    const userId = req.user!.id;
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (!profile) return { ok: true };

    if (profile.role === 'founder') {
      const { error } = await admin.from('founders').delete().eq('id', userId);
      if (error) return reply.code(500).send({ error: error.message });
    } else {
      const { data: member } = await admin
        .from('backer_members')
        .select('organization_id')
        .eq('user_id', userId)
        .maybeSingle();
      await admin.from('backer_members').delete().eq('user_id', userId);
      if (member) {
        // Remove the org too, but only if it has no other members and no grants.
        const [{ count: members }, { count: grants }] = await Promise.all([
          admin.from('backer_members').select('id', { count: 'exact', head: true }).eq('organization_id', member.organization_id),
          admin.from('grants').select('id', { count: 'exact', head: true }).eq('organization_id', member.organization_id),
        ]);
        if (!members && !grants) {
          await admin.from('organizations').delete().eq('id', member.organization_id);
        }
      }
    }
    const { error: pErr } = await admin.from('profiles').delete().eq('id', userId);
    if (pErr) return reply.code(500).send({ error: pErr.message });
    return { ok: true };
  });

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
