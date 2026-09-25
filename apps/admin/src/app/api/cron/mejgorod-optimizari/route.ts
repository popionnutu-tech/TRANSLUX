import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { trimitePosterMejgorod } from '@/lib/lde/mejgorod-optimizari-image';

// Posterul «cât se putea economisi» pe rutele interurbane (Mejgorod, ION-55), în grupa livrărilor de uzină,
// luni 08:00, lângă LEAR și SEBN (Ion, 25.09: «pune și analiza de optimizări în raport livrări»). N-are cron
// Vercel: îl cheamă lear-saptamanal.sh pe VPS după mejgorod/cod/saptamanal.sh, care scrie analiza săptămânii.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/mejgorod-optimizari
// Verificare fără trimitere: ?dry=1 · altă săptămână: ?saptamina=YYYY-MM-DD · retrimitere: ?force=1
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
  try {
    const r = await trimitePosterMejgorod({ saptamina: s.luni, pana_la: s.duminica, force: q.get('force') === '1', dry: q.get('dry') === '1' });
    return NextResponse.json({ saptamina: s.luni, ...r });
  } catch (e) {
    console.error('[mejgorod-optimizari]', e);
    return NextResponse.json({ error: 'Posterul rutelor interurbane a eșuat' }, { status: 500 });
  }
}
