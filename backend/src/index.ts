// Fastify server entry point.
//
// Boots the HTTP server, registers CORS + route modules.
// Run with `npm run dev` (live reload via tsx watch).

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

async function build() {
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

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(foundersRoutes, { prefix: '/api/v1/founders' });
  await app.register(projectsRoutes, { prefix: '/api/v1/projects' });
  await app.register(grantsRoutes, { prefix: '/api/v1/grants' });
  await app.register(applicationsRoutes, { prefix: '/api/v1/applications' });
  await app.register(organizationsRoutes, { prefix: '/api/v1/organizations' });
  await app.register(aiRoutes, { prefix: '/api/v1/ai' });

  return app;
}

async function main() {
  const app = await build();
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
