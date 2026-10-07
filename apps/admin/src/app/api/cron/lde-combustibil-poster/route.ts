import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { genereazaGrup, golesteCacheFlota, recupereazaPoster, GRUP_IDS, BUCATI } from '@/lib/lde/combustibil-poster';
import { LUNA_RE } from '@/lib/lde/norma-luna';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Posterul lunar de combustibil pe grupuri de direcții (ION-138, Ion 29.09.2026).
 *
 * Ion, 07.10.2026: «aici trebuie să meargă doar după confirmarea mea posterul în grupă» — posterul unei luni pleacă
 * doar după «Confirm normele lunii» pe panoul normelor (/lde/agreare/norme), care îl și trimite. Crontab-ul VPS de pe
 * 25 la 08:00 (lde-geo-worker/run-nightly.sh) doar RECUPEREAZĂ: lunile confirmate din ultimele 3 cu bucăți netrimise
 * sau refuzate de Telegram (cele cu rezultat nesigur le hotărăște Ion pe panou).
 *   `?luna=2026-09` — doar luna aceea (fără confirmare → `asteapta_confirmarea`);
 *   `?force=1` cu `?luna` — retrimite toate bucățile (explicit, poate dubla în grupă);
 *   `?preview=1&grup=lear` — întoarce PNG-ul fără să trimită.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = req.nextUrl.searchParams;
  const lunaQ = q.get('luna');
  const luna = lunaQ && LUNA_RE.test(lunaQ) ? lunaQ : null;
  try {
    if (q.get('preview') === '1') {
      const grupuri = (q.get('grup') ?? '').split(',').map((s) => s.trim()).filter((s) => GRUP_IDS.includes(s));
      if (grupuri.length !== 1 || !luna) return NextResponse.json({ error: `preview cere ?luna=AAAA-LL și un singur grup: ${GRUP_IDS.join(', ')}` }, { status: 400 });
      golesteCacheFlota();
      const { png, randuri } = await genereazaGrup(grupuri[0], luna);
      return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'X-Rows': String(randuri) } });
    }
    if (luna) {
      const r = await recupereazaPoster(luna, q.get('force') === '1' ? { explicit: BUCATI } : {});
      return NextResponse.json(r, { status: r.status === 'eroare' ? 500 : 200 });
    }
    const { data, error } = await getSupabase().from('lde_norma_luna_confirmare').select('luna')
      .is('poster_trimis_la', null).order('luna', { ascending: false }).limit(3);
    if (error) throw new Error(error.message);
    const rezultate = [];
    for (const r of data ?? []) rezultate.push(await recupereazaPoster(String(r.luna).slice(0, 7)));
    return NextResponse.json({ rezultate }, { status: rezultate.some((r) => r.status === 'eroare') ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('lde-combustibil-poster cron error:', message);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
