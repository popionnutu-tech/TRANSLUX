import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { genereazaGrup, trimitePostereCombustibil, lunaTrecuta, GRUP_IDS } from '@/lib/lde/combustibil-poster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Posterul lunar de combustibil pe grupuri de direcții (ION-138, Ion 29.09.2026).
 *
 * Planul Hobby nu mai are cronuri Vercel libere — îl pornește crontab-ul VPS pe 25 ale lunii la 08:00
 * (lde-geo-worker/run-nightly.sh, antetul), pentru luna încheiată. `?luna=2026-09` alege luna;
 * `?grup=lear,sebn` doar câteva grupuri; `?force=1` retrimite; `?preview=1&grup=lear` întoarce PNG-ul fără să trimită.
 * Trimiterea cere confirmarea lui Ion pe lună (panoul normelor, /lde/agreare/norme); fără ea → `asteapta_confirmarea`.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = req.nextUrl.searchParams;
  const lunaQ = q.get('luna');
  const luna = lunaQ && /^\d{4}-(0[1-9]|1[0-2])$/.test(lunaQ) ? lunaQ : lunaTrecuta(chisinauTodayIso());
  const grupuri = (q.get('grup') ?? '').split(',').map((s) => s.trim()).filter((s) => GRUP_IDS.includes(s));
  try {
    if (q.get('preview') === '1') {
      if (grupuri.length !== 1) return NextResponse.json({ error: `preview cere un singur grup: ${GRUP_IDS.join(', ')}` }, { status: 400 });
      const { png, randuri } = await genereazaGrup(grupuri[0], luna);
      return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'X-Rows': String(randuri) } });
    }
    // Ion, 07.10.2026: «aici trebuie să meargă doar după confirmarea mea posterul în grupă» — luna fără confirmare
    // (lde_norma_luna_confirmare, migr. 528) nu pleacă, nici cu force=1
    const { data: conf, error: eConf } = await getSupabase().from('lde_norma_luna_confirmare').select('luna').eq('luna', `${luna}-01`).maybeSingle();
    if (eConf) throw new Error(eConf.message);
    if (!conf) return NextResponse.json({ luna, status: 'asteapta_confirmarea' });
    const r = await trimitePostereCombustibil({ luna, grupuri, force: q.get('force') === '1' });
    return NextResponse.json({ luna, rezultate: r }, { status: r.some((x) => x.status === 'error') ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('lde-combustibil-poster cron error:', message);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
