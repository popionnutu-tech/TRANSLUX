import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { generarePoster, perioadaCadentei, trimitePosterLivrare, PRAG_LIVRARE_KM_ZI, uzineValidate } from '@/lib/lde/livrare-poster';
import { chisinauTodayIso } from '@/lib/chisinau-time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Posterul de livrare (подача), la două săptămâni (Ion, 19.09.2026).
 *
 * Fără program propriu în vercel.json (planul Hobby: două cronuri, ambele luate) —
 * cadența o pornește copy-assignments, luni. Ruta există pentru trimiterea de mână:
 * `?from=2026-09-01&to=2026-09-18` alege perioada; `?force=1` retrimite una plecată;
 * `?preview=1` întoarce PNG-ul fără să trimită nimic.
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = req.nextUrl.searchParams;
  const zi = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  let from = zi(q.get('from')), to = zi(q.get('to'));
  if (!from || !to) {
    const p = perioadaCadentei(chisinauTodayIso());
    if (!p) return NextResponse.json({ status: 'skipped', reason: 'nu e zi de cadență; dă ?from=&to=' });
    from = p.from; to = p.to;
  }
  // `?uzine=all` sau listă «SEBN_ORHEI,LEAR_UNGHENI»; fără parametru — uzinele marcate ca
  // validate în bază (migr. 386), nu o constantă din cod
  const uz = q.get('uzine');
  const uzine: string[] | 'all' = uz === 'all' ? 'all' : uz ? uz.split(',').map((s) => s.trim()).filter(Boolean) : await uzineValidate();
  try {
    if (q.get('preview') === '1') {
      const { png, rows } = await generarePoster(from, to, PRAG_LIVRARE_KM_ZI, uzine);
      return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'X-Rows': String(rows.length) } });
    }
    const r = await trimitePosterLivrare({ from, to, force: q.get('force') === '1', uzine });
    return NextResponse.json(r, { status: r.status === 'error' ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('livrare-poster cron error:', message);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
