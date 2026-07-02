// Auth middleware.
//
// Reads the Authorization header, verifies the Supabase JWT, and attaches
// `request.user` so downstream handlers know who's calling.
//
// Two helpers:
// - `requireUser` — fails with 401 if no/invalid token
// - `optionalUser` — attaches if present, allows anonymous

import type { FastifyRequest, FastifyReply } from 'fastify';
import { admin } from './db.js';
import { config } from './config.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string | undefined;
      jwt: string;
      role: 'founder' | 'backer' | null;
    };
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

async function attachUser(req: FastifyRequest, jwt: string): Promise<boolean> {
  // Verify via Supabase admin (server-side)
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return false;

  // Look up the user's coart role
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  req.user = {
    id: data.user.id,
    email: data.user.email,
    jwt,
    role: (profile?.role as 'founder' | 'backer' | null) ?? null,
  };
  return true;
}

// DEV-ONLY. Remove or gate more strictly before production.
// In development, a request carrying `X-Dev-User: <uuid>` skips JWT
// verification entirely and acts as that founder. The service-role key is
// used as the "jwt" so userClient() queries bypass RLS.
function attachDevUser(req: FastifyRequest): boolean {
  if (config.nodeEnv !== 'development') return false;
  const devUserId = req.headers['x-dev-user'];
  if (typeof devUserId !== 'string' || devUserId === '') return false;
  req.user = {
    id: devUserId,
    email: undefined,
    jwt: config.supabase.serviceRoleKey,
    role: 'founder',
  };
  return true;
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (attachDevUser(req)) return;
  const token = extractToken(req);
  if (!token) return reply.code(401).send({ error: 'Missing Authorization header' });
  const ok = await attachUser(req, token);
  if (!ok) return reply.code(401).send({ error: 'Invalid or expired token' });
}

export async function optionalUser(req: FastifyRequest, _reply: FastifyReply) {
  const token = extractToken(req);
  if (!token) return;
  await attachUser(req, token);
  // No error if invalid — just leaves req.user undefined.
}

// Async so Fastify's hook runner awaits it — a sync hook without `done`
// never resolves and hangs the request.
export async function requireFounder(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Not authenticated' });
  if (req.user.role !== 'founder')
    return reply.code(403).send({ error: 'Founder role required' });
}

export async function requireBacker(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Not authenticated' });
  if (req.user.role !== 'backer')
    return reply.code(403).send({ error: 'Backer role required' });
}
