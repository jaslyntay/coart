// Local dev server entry point.
//
// Boots the HTTP server on config.port. Run with `npm run dev`
// (live reload via tsx watch). On Vercel the app is served by the
// /api/index.ts serverless wrapper instead — no listener there.

import { config } from './config.js';
import { build } from './app.js';

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
