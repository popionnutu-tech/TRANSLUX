import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { trimitePosterSebn } from '@/lib/lde/sebn-optimizari-image';
import { alertAdmins } from '@/lib/telegram-notify';

// Posterul SEBN «cât se putea economisi» + întrebarea despre primele 3 mașini critice, luni 08:00 (ION-60).
// Ion, 25.09: «săptămânal la ora 8 luni raport; cronul vechi îl anulezi, lași doar acesta». N-are cron
// Vercel: îl cheamă lear-saptamanal.sh pe VPS imediat după sebn-liber.mjs, ca raportul să fie deja scris.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/sebn-optimizari
// Verificare fără trimitere: ?dry=1 · altă săptămână: ?saptamina=YYYY-MM-DD · retrimitere: ?force=1
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// săptămâna lui «ieri» (luni → duminică), ca în sebn-liber.mjs
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
    const dry = q.get('dry') === '1';
    const r = await trimitePosterSebn({ saptamina: s.luni, pana_la: s.duminica, force: q.get('force') === '1', dry });
    // Ion, 25.09 (ION-62): «dacă nu se trimit, îmi dai mie în bot» — un refuz real (nu dedup) ajunge la ADMIN pe loc
    if (!dry && !r.trimis && r.motiv && !/^deja trimis/.test(r.motiv)) {
      await alertAdmins(`⛔ SEBN: posterul pentru săptămâna din ${s.luni} n-a plecat — ${r.motiv}`);
    }
    return NextResponse.json({ saptamina: s.luni, ...r });
  } catch (e) {
    console.error('[sebn-optimizari]', e);
    return NextResponse.json({ error: 'Posterul SEBN a eșuat' }, { status: 500 });
  }
}
