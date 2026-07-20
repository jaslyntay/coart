// In-app notifications. One row per recipient in the notifications table.
//
// Email delivery: when a domain + RESEND_API_KEY exist, extend notify() to
// also send via Resend (https://resend.com/docs/send-with-nodejs). The
// in-app row is always written first so email failures never lose the event.

import { admin } from './db.js';

export async function notify(
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
) {
  const { error } = await admin.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
  });
  // Notifications are best-effort — never fail the triggering request.
  if (error) console.error('notify failed:', error.message);
}

export async function notifyOrgMembers(
  organizationId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
) {
  const { data: members } = await admin
    .from('backer_members')
    .select('user_id')
    .eq('organization_id', organizationId);
  await Promise.all((members ?? []).map((m) => notify(m.user_id, type, title, body, link)));
}
