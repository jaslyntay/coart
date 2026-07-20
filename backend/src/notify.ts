// Notifications: an in-app row (notifications table) plus, when Resend is
// configured, an email to the recipient's login address. The in-app row is
// written first so email failures never lose the event, and both paths are
// best-effort — they never fail the triggering request.

import { admin } from './db.js';
import { config } from './config.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

async function sendEmail(userId: string, title: string, body?: string) {
  if (!config.resend.enabled) return;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const to = data?.user?.email;
    if (!to || to.endsWith('.test')) return; // skip test fixtures
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `coart <${config.resend.fromEmail}>`,
        to,
        subject: title,
        html:
          `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;">` +
          `<p style="font-family:monospace;font-size:14px;color:#0B2545;margin-bottom:20px;">coart<span style="color:#1F6FEB;">●</span></p>` +
          `<h2 style="color:#0B2545;font-size:19px;margin:0 0 10px;">${escapeHtml(title)}</h2>` +
          (body ? `<p style="color:#3E5C7E;line-height:1.6;margin:0 0 22px;">${escapeHtml(body)}</p>` : '') +
          `<p><a href="${config.siteUrl}" style="background:#1F6FEB;color:#ffffff;padding:11px 20px;text-decoration:none;border-radius:5px;display:inline-block;font-size:14px;">Open coart</a></p>` +
          `<p style="color:#8AA2BD;font-size:12px;margin-top:26px;">You're receiving this because you have a coart account.</p>` +
          `</div>`,
      }),
    });
    if (!res.ok) console.error('resend send failed:', res.status, await res.text());
  } catch (e) {
    console.error('resend send failed:', (e as Error).message);
  }
}

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
  if (error) console.error('notify failed:', error.message);
  await sendEmail(userId, title, body);
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
