import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { chisinauTodayIso } from '@/lib/chisinau-time';

// Noaptea, după lde-alim-worker (VPS, 03:00): foile LDE se pot muta, șterge sau sosi după import, iar agrearea se poate
// schimba. Re-evaluează TOATE legările automate din fișierele Petrom/Intelect pe ultimele 60 de zile (manualele rămân),
// apoi proiecția în lde_fuel_alimentari și acoperirea foilor (plan 2026-10-08, runda Codex 2). Workflow:
// .github/workflows/combustibil-relege.yml.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const db = getSupabase();
  const pana = chisinauTodayIso();
  const de = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const t0 = Date.now();
  const r1 = await db.rpc('lde_fuel_releaga', { p_de: de, p_pana: pana });
  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 502 });
  const r2 = await db.rpc('lde_fuel_import_sincronizeaza', { p_de: de, p_pana: pana });
  if (r2.error) return NextResponse.json({ error: r2.error.message, relegate: r1.data }, { status: 502 });
  return NextResponse.json({ ok: true, de, pana, relegate: r1.data, sync: r2.data, ms: Date.now() - t0 });
}
