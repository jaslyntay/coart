// Vercel serverless wrapper around the Fastify backend.
//
// The [...slug] catch-all matches every /api/* request and receives the
// original request URL, so Fastify's full-path routes (/api/v1/...,
// /api/healthz) match unchanged. The app is built once per warm lambda
// and reused across invocations.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { build } from '../backend/src/app.js';

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
