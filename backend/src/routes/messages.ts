// Direct messages between founders and backer organisations.
//
// A thread is the (organization_id, founder_id) pair. Backers write on
// behalf of their org; any member of the org sees the thread.
//
// Who may start a thread:
//  - backer → any founder (same trust level as contact requests/invites)
//  - founder → an org, if the org has already messaged them OR they have
//    an application to one of the org's grants (prevents cold-spamming)

import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { admin } from '../db.js';
import { notify, notifyOrgMembers } from '../notify.js';

async function orgOf(userId: string): Promise<string | null> {
  const { data } = await admin
    .from('backer_members')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export async function messagesRoutes(app: FastifyInstance) {
  // GET /api/v1/messages/threads — conversation list for the signed-in user
  app.get('/threads', { preHandler: requireUser }, async (req, reply) => {
    const me = req.user!;
    let rows;
    if (me.role === 'backer') {
      const orgId = await orgOf(me.id);
      if (!orgId) return { threads: [] };
      ({ data: rows } = await admin
        .from('messages')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(500));
    } else {
      ({ data: rows } = await admin
        .from('messages')
        .select('*')
        .eq('founder_id', me.id)
        .order('created_at', { ascending: false })
        .limit(500));
    }
    const isBacker = me.role === 'backer';
    const byKey: Record<string, { last: any; unread: number }> = {};
    for (const m of rows ?? []) {
      const key = isBacker ? m.founder_id : m.organization_id;
      if (!byKey[key]) byKey[key] = { last: m, unread: 0 };
      const incoming = isBacker ? m.sender_role === 'founder' : m.sender_role === 'backer';
      if (incoming && !m.read) byKey[key].unread++;
    }
    const ids = Object.keys(byKey);
    let names: Record<string, { name: string; photo: string | null }> = {};
    if (ids.length) {
      if (isBacker) {
        const { data } = await admin.from('founders').select('id, full_name, profile_photo_url').in('id', ids);
        (data ?? []).forEach((f) => { names[f.id] = { name: f.full_name, photo: f.profile_photo_url }; });
      } else {
        const { data } = await admin.from('organizations').select('id, name, logo_url').in('id', ids);
        (data ?? []).forEach((o) => { names[o.id] = { name: o.name, photo: o.logo_url }; });
      }
    }
    const threads = ids.map((id) => {
      const t = byKey[id]!;
      return {
        counterparty_id: id,
        counterparty_name: names[id]?.name ?? 'Unknown',
        counterparty_photo: names[id]?.photo ?? null,
        last_body: t.last.body,
        last_at: t.last.created_at,
        unread: t.unread,
      };
    }).sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
    return { threads };
  });

  // GET /api/v1/messages/with/:id — full thread; marks incoming as read
  app.get('/with/:id', { preHandler: requireUser }, async (req, reply) => {
    const me = req.user!;
    const { id } = req.params as { id: string };
    let orgId: string, founderId: string, incomingRole: string;
    if (me.role === 'backer') {
      const own = await orgOf(me.id);
      if (!own) return reply.code(403).send({ error: 'No organisation' });
      orgId = own; founderId = id; incomingRole = 'founder';
    } else {
      orgId = id; founderId = me.id; incomingRole = 'backer';
    }
    const { data: messages, error } = await admin
      .from('messages')
      .select('*')
      .eq('organization_id', orgId)
      .eq('founder_id', founderId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) return reply.code(500).send({ error: error.message });
    await admin
      .from('messages')
      .update({ read: true })
      .eq('organization_id', orgId)
      .eq('founder_id', founderId)
      .eq('sender_role', incomingRole)
      .eq('read', false);
    return { messages: messages ?? [] };
  });

  // POST /api/v1/messages/to/:id { body } — send a message
  app.post('/to/:id', { preHandler: requireUser }, async (req, reply) => {
    const me = req.user!;
    const { id } = req.params as { id: string };
    const { body } = (req.body ?? {}) as { body?: string };
    if (!body || !body.trim() || body.length > 4000) {
      return reply.code(400).send({ error: 'Message body required (max 4000 chars)' });
    }

    let orgId: string, founderId: string;
    if (me.role === 'backer') {
      const own = await orgOf(me.id);
      if (!own) return reply.code(403).send({ error: 'No organisation' });
      orgId = own; founderId = id;
      const { data: f } = await admin.from('founders').select('id').eq('id', founderId).maybeSingle();
      if (!f) return reply.code(404).send({ error: 'Founder not found' });
    } else if (me.role === 'founder') {
      orgId = id; founderId = me.id;
      // Founders may reply to existing threads or message orgs they applied to.
      const { count: prior } = await admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('founder_id', founderId);
      if (!prior) {
        const { data: applied } = await admin
          .from('applications')
          .select('id, grant:grants!inner(organization_id)')
          .eq('founder_id', founderId)
          .eq('grant.organization_id', orgId)
          .limit(1);
        if (!applied?.length) {
          return reply.code(403).send({ error: 'You can message organisations after applying to one of their grants, or once they contact you.' });
        }
      }
    } else {
      return reply.code(403).send({ error: 'Not authenticated' });
    }

    const { data: msg, error } = await admin
      .from('messages')
      .insert({
        organization_id: orgId,
        founder_id: founderId,
        sender_role: me.role,
        body: body.trim(),
      })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });

    // Notify (in-app + email) the receiving side.
    if (me.role === 'backer') {
      const { data: org } = await admin.from('organizations').select('name').eq('id', orgId).single();
      await notify(founderId, 'message',
        'New message from ' + (org?.name ?? 'an organisation'),
        body.trim().slice(0, 200));
    } else {
      const { data: f } = await admin.from('founders').select('full_name').eq('id', founderId).single();
      await notifyOrgMembers(orgId, 'message',
        'New message from ' + (f?.full_name ?? 'a founder'),
        body.trim().slice(0, 200));
    }
    return msg;
  });
}
