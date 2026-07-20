// One-time: create the public avatars bucket. Idempotent.
// Run from backend/: npx tsx scripts/setup-storage.ts

import { admin } from '../src/db.js';
import { IMAGE_BUCKET } from '../src/storage.js';

async function main() {
  const { error } = await admin.storage.createBucket(IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: '3MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  console.log(`bucket "${IMAGE_BUCKET}" ready${error ? ' (already existed)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
