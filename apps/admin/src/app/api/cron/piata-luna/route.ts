import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';

// «Piața» pe pereche (ION-171): calculul lunar al coloanei din Bilete aparat → Tipuri bilet. Rulează NOAPTEA, separat de
// tiki-refacere (baza NANO, ION-166): un pas = o lună încheiată «murdară» (piata_luni_murdare, marcată de tiki_refacere_pas
// în ambele ramuri — luna TIKI și zilele Numărării), sărită cât timp mai are zile în count_refresh_queue. Câțiva pași pe
// apel, în buget; ce rămâne se reia noaptea următoare. Workflow: .github/workflows/piata-luna.yml.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 200_000;
const MAX_PASI = 6;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const sb = getSupabase();
  const t0 = Date.now();
  const pasi: unknown[] = [];
  while (Date.now() - t0 < BUDGET_MS && pasi.length < MAX_PASI) {
    const r = await sb.rpc('piata_pas');
    if (r.error) return NextResponse.json({ error: r.error.message, pasi }, { status: 502 });
    const d = (r.data ?? {}) as { luna?: string | null; ocupat?: boolean; ramase?: number; sarite?: number };
    pasi.push(d);
    if (d.ocupat || !d.luna) break;
  }
  return NextResponse.json({ ok: true, pasi, ms: Date.now() - t0 });
}
