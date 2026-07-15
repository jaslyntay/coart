// Vercel serverless wrapper around the Fastify backend.
//
// Bare (non-Next.js) api/ routing has no catch-all: [...slug].ts matches
// only ONE path segment (the param is literally named "...slug"). So the
// api/ directory holds one re-export of this handler per path depth
// (api/[s1].ts … api/[s1]/[s2]/[s3]/[s4].ts). Each match preserves the
// original request URL, so Fastify's full-path routes (/api/v1/...,
// /api/healthz) match unchanged; Vercel only appends s1..s4 as query
// params, which Fastify ignores for routing. The app is built once per
// warm lambda and reused across invocations.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { build } from './app.js';

let appReady: Promise<Awaited<ReturnType<typeof build>>> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appReady) {
    appReady = build().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  const app = await appReady;
  app.server.emit('request', req, res);
}
