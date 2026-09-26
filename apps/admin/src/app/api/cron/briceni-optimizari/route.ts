import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { posterBriceni } from '@/lib/lde/briceni-optimizari-image';

// Posterul «cât se putea economisi» la Trox + suburbanele Briceni (ION-73). Ion, 25.09.2026: posterul se face, dar
// întâi îl vede el; din 26.09 pleacă lunea la 08:00 din lear-saptamanal.sh cu ?send=1. Contractul rămâne invers față de
// rutele surori (sebn/mejgorod-optimizari):
//   implicit → întoarce imaginea PNG, nu trimite nimic, nu scrie nicio cheie;
//   ?send=1  → trimite în grupa livrărilor de uzină (o dată pe săptămână; ?force=1 retrimite).
// Altă săptămână: ?saptamina=YYYY-MM-DD. Analiza o scrie luni VPS-ul (briceni/cod/saptamanal.sh).
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/briceni-optimizari -o poster.png
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function saptamina(cerut: string | null) {
  const d = new Date(`${cerut && DATE_RE.test(cerut) ? cerut : chisinauTodayIso()}T12:00:00Z`);
  if (!cerut) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const dum = new Date(d.getTime() + 6 * 86400000);
  return { luni: d.toISOString().slice(0, 10), duminica: dum.toISOString().slice(0, 10) };
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = new URL(req.url).searchParams;
  const s = saptamina(q.get('saptamina'));
  const trimite = q.get('send') === '1';
  try {
    const r = await posterBriceni({ saptamina: s.luni, pana_la: s.duminica, trimite, force: q.get('force') === '1' });
    if (!trimite && r.png) {
      return new NextResponse(new Uint8Array(r.png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ saptamina: s.luni, trimis: r.trimis, motiv: r.motiv, livrare: r.livrare });
  } catch (e) {
    console.error('[briceni-optimizari]', e);
    return NextResponse.json({ error: 'Posterul Trox + suburban Briceni a eșuat' }, { status: 500 });
  }
}
