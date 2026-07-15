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

export async function build() {
  const app = Fastify({
    logger: config.isProd
      ? true
      : {
          transport: { target: 'pino-pretty', options: { colorize: true } },
        },
  });

  await app.register(sensible);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow tools like curl (no origin header) in dev
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed`), false);
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

  return app;
}
