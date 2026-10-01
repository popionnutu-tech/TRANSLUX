import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';

// Refacerea vederilor Bilete aparat (ION-159): golește cozile tiki_refresh_queue (lunile curselor, după import și
// corecturi) și count_refresh_queue (zilele Numărării modificate, puse de triggere). Fiecare pas e o funcție SQL cu
// lacăt pe tranzacție (tiki_refacere_pas, migr. 452): o lună durează ~70 s pe instanța noastră, deci câteva luni pe apel;
// ce rămâne se reia la următorul apel (workflow-ul tiki-mobilet îl cheamă după import, și la 08:00).

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 200_000;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const sb = getSupabase();
  const t0 = Date.now();
  const pasi: unknown[] = [];
  while (Date.now() - t0 < BUDGET_MS) {
    const r = await sb.rpc('tiki_refacere_pas');
    if (r.error) return NextResponse.json({ error: r.error.message, pasi }, { status: 502 });
    const d = (r.data ?? {}) as { luna?: string; numarare_zile?: number; ocupat?: boolean; ramase?: number };
    pasi.push(d);
    if (d.ocupat || (!d.luna && !d.numarare_zile)) break;
  }
  return NextResponse.json({ ok: true, pasi, ms: Date.now() - t0 });
}
