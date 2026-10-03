import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { inFereastraDeNoapte } from '@/lib/fereastra-noapte';

// Refacerea vederilor Bilete aparat (ION-159, ION-166): golește cozile tiki_refresh_queue (lunile curselor, după import și
// corecturi) și count_refresh_queue (zilele Numărării). Fiecare apel al lui tiki_refacere_pas face UN pas mic (migr. 463–465:
// atribuire pe ~7 zile, etichetă, km, agregate, Numărare ≤ 15 s), măsurat ≤ 10 s; între pași o pauză de 2 s.
// Baza e pe instanța NANO, care a încremenit pe 01.10 după o zi de refaceri grele: refacerea rulează DOAR noaptea,
// 23:00–05:00 Chișinău; ziua doar cu ?force=1. Ce nu încape rămâne în coadă pentru apelul sau noaptea următoare.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 30 s, nu 45: un pas poate dura ~25 s (eticheta), iar 45 + 25 trecea de maxDuration 60 → 504 și oprirea nopții (03.10, ION-219).
const BUDGET_MS = 30_000;
const PAUZA_MS = 2_000;

interface Pas { pas?: string; planificat?: string; numarare_zile?: number; ocupat?: boolean; ms?: number }
interface Stare { luni_in_asteptare: string[]; zile_numarare: number }

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const force = req.nextUrl.searchParams.get('force') === '1';
  if (!force && !inFereastraDeNoapte(new Date())) {
    return NextResponse.json({ ok: true, oprit: 'zi', mesaj: 'refacerea rulează doar 23:00–05:00 Chișinău (sau cu ?force=1)' });
  }

  const sb = getSupabase();
  const t0 = Date.now();
  const pasi: Pas[] = [];
  while (Date.now() - t0 < BUDGET_MS) {
    if (!force && !inFereastraDeNoapte(new Date())) break;
    const r = await sb.rpc('tiki_refacere_pas');
    if (r.error) return NextResponse.json({ error: r.error.message, pasi }, { status: 502 });
    const d = (r.data ?? {}) as Pas;
    pasi.push(d);
    if (d.ocupat || (!d.pas && !d.planificat && !d.numarare_zile)) break;
    await new Promise(res => setTimeout(res, PAUZA_MS));
  }

  const s = await sb.rpc('get_tiki_refacere_stare');
  const stare = (s.data ?? null) as Stare | null;
  const gata = !!stare && stare.luni_in_asteptare.length === 0 && stare.zile_numarare === 0;
  return NextResponse.json({ ok: true, gata, stare, pasi, ms: Date.now() - t0 });
}
