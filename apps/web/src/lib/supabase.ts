import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Supabase clienți pentru site-ul public translux.md.
 *
 * IMPORTANT: folosește SUPABASE_ANON_KEY (nu service_key). Asta înseamnă:
 *  - Doar tabelele cu politici RLS anon explicite sunt vizibile
 *    (crm_routes, crm_stop_fares, localities, offers, route_km_pairs,
 *     tariff_periods, daily_assignments)
 *  - Pentru drivers/vehicles se folosesc VIEW-urile public_drivers_view și
 *    public_vehicles_view (doar id, full_name, phone, plate_number).
 *  - Insert-uri permise doar pe search_log, page_views, call_clicks.
 *  - Tot ce-i sensibil (admin_accounts, salary, reports, analytics, etc.)
 *    e fizic inaccesibil din publicul site.
 *
 * Pentru funcționalitatea admin → apps/admin (proiect Vercel separat).
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_ANON_KEY!;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    client = createClient(url, key, {
      global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) },
    });
  }
  return client;
}
