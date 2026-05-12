import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Supabase клиент для admin app: использует service_role key
 * (обходит все RLS политики). Это допустимо ТОЛЬКО в admin app —
 * публичный сайт apps/web должен использовать anon key.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_KEY!;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    client = createClient(url, key, {
      global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) },
    });
  }
  return client;
}
