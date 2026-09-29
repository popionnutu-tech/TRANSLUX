import { NextRequest, NextResponse } from 'next/server';
import { CAMIOANE_GROUP_CONFIG_KEY } from '@translux/db';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';
import { sendTelegram } from '@/lib/telegram-notify';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { mesajTraseu, type Verificare } from '@/lib/lde/camioane-traseu';

// ION-144 — la 08:00, abaterile de ieri ale cisternelor față de scheletul ideal, într-un singur mesaj
// în grupa camioanelor (legată cu /lega_camioane). Mașinile în regulă nu apar (Ion, 29.09).
// Rândurile le scrie VPS-ul (camioane/cod/verifica-zi.mjs), apoi cheamă ruta:
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/camioane-traseu
// Verificare fără trimitere: ?zi=AAAA-LL-ZZ&dry=1. A doua trimitere pe aceeași zi: doar cu &force=1.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ULTIMA = 'camioane_traseu_last';

function ieriChisinau(): string {
  const d = new Date(`${chisinauTodayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const cerut = url.searchParams.get('zi') ?? '';
  const zi = DATE_RE.test(cerut) ? cerut : ieriChisinau();
  const dry = url.searchParams.get('dry') === '1';
  const force = url.searchParams.get('force') === '1';
  const sb = getSupabase();

  const { data, error } = await sb.from('lde_truck_route_checks')
    .select('placa, tip, de, pana, km_gps, km_ideal, km_plus, lei_plus, abateri, ok')
    .eq('zi', zi).order('placa').limit(500);
  if (error) {
    console.error('[camioane-traseu]', error.message);
    return NextResponse.json({ error: 'Nu am putut citi verificările' }, { status: 500 });
  }
  const randuri = (data ?? []) as Verificare[];
  const bucati = mesajTraseu(zi, randuri);
  if (dry) return NextResponse.json({ zi, drumuri: randuri.length, abateri: randuri.filter((r) => !r.ok).length, mesaj: bucati });

  const cfg = await sb.from('app_config').select('key, value').in('key', [CAMIOANE_GROUP_CONFIG_KEY, ULTIMA]);
  const val = (k: string) => (cfg.data ?? []).find((r) => r.key === k)?.value?.trim() || null;
  const chat = val(CAMIOANE_GROUP_CONFIG_KEY);
  if (!chat) return NextResponse.json({ zi, trimis: false, motiv: 'grupa camioanelor nu e legată (/lega_camioane)' });
  if (!force && val(ULTIMA) === zi) return NextResponse.json({ zi, trimis: false, motiv: 'deja trimis pentru ziua asta' });

  let ok = true;
  for (const b of bucati) ok = (await sendTelegram(chat, b)) && ok;
  if (ok) await sb.from('app_config').upsert({ key: ULTIMA, value: zi, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return NextResponse.json({ zi, trimis: ok, bucati: bucati.length, abateri: randuri.filter((r) => !r.ok).length });
}
