// Builds the Fastify app (routes + CORS), without binding a port.
//
// Two consumers:
// - src/index.ts   → local dev server (`npm run dev`), calls listen()
// - /api/index.ts  → Vercel serverless function at the repo root, which
//   forwards each invocation to app.server via emit('request')

import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

import { config } from './config.js';
import { foundersRoutes } from './routes/founders.js';
import { projectsRoutes } from './routes/projects.js';
import { grantsRoutes } from './routes/grants.js';
import { applicationsRoutes } from './routes/applications.js';
import { organizationsRoutes } from './routes/organizations.js';
import { aiRoutes } from './routes/ai.js';
import { authRoutes } from './routes/auth.js';
import { notificationsRoutes } from './routes/notifications.js';

export async function build() {
  const app = Fastify({
    // Avatar/logo uploads arrive as base64 JSON (client downscales to
    // ≤512px first); Vercel caps request bodies at ~4.5MB.
    bodyLimit: 4 * 1024 * 1024,
    logger: config.isProd
      ? true
      : {
          transport: { target: 'pino-pretty', options: { colorize: true } },
        },
  });

  await app.register(sensible);

  // Our own domains are always allowed regardless of the CORS_ORIGINS env
  // var — a missing env entry must never take the production site down.
  const ALWAYS_ALLOWED = [
    'https://coartsg.com',
    'https://www.coartsg.com',
    'https://coart.vercel.app',
    'http://localhost:8000',
  ];
  const allowedOrigins = new Set([...config.corsOrigins, ...ALWAYS_ALLOWED]);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow tools like curl (no origin header) in dev
      if (!origin) return cb(null, true);
      // Unknown origins get no CORS headers (browser blocks them) — but we
      // never throw, since that turns every request into a 500.
      cb(null, allowedOrigins.has(origin));
    },
    credentials: true,
  });

  app.get('/healthz', async () => ({ ok: true, env: config.nodeEnv }));
  // Alias under /api so it's reachable on Vercel, where only /api/* hits
  // the serverless function (everything else is static files).
  app.get('/api/healthz', async () => ({ ok: true, env: config.nodeEnv }));

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(foundersRoutes, { prefix: '/api/v1/founders' });
  await app.register(projectsRoutes, { prefix: '/api/v1/projects' });
  await app.register(grantsRoutes, { prefix: '/api/v1/grants' });
  await app.register(applicationsRoutes, { prefix: '/api/v1/applications' });
  await app.register(organizationsRoutes, { prefix: '/api/v1/organizations' });
  await app.register(aiRoutes, { prefix: '/api/v1/ai' });
  await app.register(notificationsRoutes, { prefix: '/api/v1/notifications' });

  return app;
}
