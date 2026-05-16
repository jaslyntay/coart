// Supabase clients.
//
// Two clients:
// 1. `admin` — uses the service role key, bypasses RLS. Use this for trusted
//    server-side operations (looking up internal state, system writes).
// 2. `userClient(token)` — creates a Supabase client scoped to the user's
//    JWT. RLS policies enforce who can see what. Use this for everything
//    the user is doing on their own behalf.
//
// Pattern: in a route handler, get the user's JWT from the Authorization
// header, build `userClient(token)`, and use it for all queries. Only fall
// back to `admin` when you specifically need to read across users.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const admin: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

export function userClient(jwt: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });
}
