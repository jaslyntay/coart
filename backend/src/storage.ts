// Image uploads (avatars + org logos) via Supabase Storage.
//
// Uploads go through the backend with the service-role client, so no
// storage RLS policies are needed. The bucket is public-read; clients
// downscale images to ≤512px before sending (base64 JSON).

import { admin } from './db.js';

export const IMAGE_BUCKET = 'avatars';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function uploadImage(
  ownerId: string,
  base64: string,
  contentType: string,
): Promise<string> {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error('Only JPEG, PNG, or WebP images are allowed');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 50) throw new Error('Empty image');
  if (buf.length > 3 * 1024 * 1024) throw new Error('Image too large (max 3MB)');

  // Timestamped path → new URL every upload, so browsers never show a
  // stale cached avatar.
  const path = `${ownerId}/${Date.now()}.${ext}`;
  const { error } = await admin.storage
    .from(IMAGE_BUCKET)
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
