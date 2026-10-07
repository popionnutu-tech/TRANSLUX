import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { alertAdmins } from '@/lib/telegram-notify';
import { saptaminaLunii } from '@/lib/lde/luni-paznic';
import { analizaSaptamana } from '@/lib/mejgorod/singerei-saptamana';

// Analiza săptămânală «trecere prin Sîngerei» pentru Ion (ION-251, Ion 07.10: «mie inițial»): fiecare cursă
// interurbană din săptămâna trecută care n-a trecut prin Sîngerei (nici centru, nici oprire la Intersecția
// Vrănești — aceeași judecată ca mesajul zilnic din grupă) + dacă salonul era plin după numărarea pe camere
// (exceptată) + rezumat pe șofer / mașină / rută. Pleacă DOAR în privatul lui Ion (alertAdmins: singurul ADMIN
// activ cu Telegram), pe română; nimic în grupe. N-are cron Vercel (Hobby are doar 2): crontab-ul VPS, luni:
//   0 9 * * 1 . /root/lde-worker/cron-secret.env && curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/mejgorod-singerei-saptamana
// Numărarea duminicii se termină de obicei luni după-amiază – marți dimineață: luni la 09:00 cursele de duminică
// ies «nenumărate»; ?force=1 marți le retrimite numărate.
// Verificare fără trimitere: ?dry=1 · altă săptămână: ?saptamina=YYYY-MM-DD (orice zi din ea) · retrimitere: ?force=1
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LAST_KEY = 'mejgorod_singerei_saptamana_last';

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = new URL(req.url).searchParams;
  const luni = saptaminaLunii(q.get('saptamina'));
  const dry = q.get('dry') === '1';
  const force = q.get('force') === '1';
  const sb = getSupabase();
  try {
    const { data: last } = await sb.from('app_config').select('value').eq('key', LAST_KEY).maybeSingle();
    if (!dry && !force && last?.value === luni) return NextResponse.json({ saptamina: luni, trimis: false, motiv: 'deja trimis pentru săptămâna asta' });

    const { rows: _rows, mesaje, ...rez } = await analizaSaptamana(luni);
    if (dry) return NextResponse.json({ ...rez, trimis: false, motiv: 'dry', mesaje });

    for (const m of mesaje) if (!(await alertAdmins(m))) throw new Error('Telegram a refuzat mesajul');
    await sb.from('app_config').upsert({ key: LAST_KEY, value: luni }, { onConflict: 'key' });
    return NextResponse.json({ ...rez, trimis: true, mesaje: mesaje.length });
  } catch (e) {
    console.error('[mejgorod-singerei-saptamana]', e);
    return NextResponse.json({ error: 'Analiza Sîngerei a eșuat' }, { status: 500 });
  }
}
