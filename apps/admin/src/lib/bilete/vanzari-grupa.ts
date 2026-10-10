import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { sendTelegramTextSigur } from '@/lib/telegram-notify';
import { mesajVanzare, type ComandaVanduta } from './vanzare-mesaj';

// Fiecare bilet vândut în tabul «Bilete online» al grupei (migr. 565; Ion, 10.10.2026: «să îmi vie în grupă ai Translux
// bilete toate biletele cumpărate»). Aceeași grupă și același tab ca alertele (app_config bilete_alerte_chat/_tab).
// Revendicarea e atomică (UPDATE … WHERE grupa_anuntat_la IS NULL): callback-ul și împăcarea nu trimit de două ori.
// Mesajul nerefuzat de Telegram → revendicarea se anulează și împăcarea (10 min) reîncearcă. Fără grupă configurată
// nu pleacă nimic — vânzările nu merg în privatul lui Ion (privatul nu e jurnal).

const COLOANE = 'id, checkout_id, from_name, to_name, departure_at, seats, total, passenger_name, phone, reducere_tip, reducere_pct, telegram_id, locuri_alese, punct_urcare_nume_ro';
/** Plățile mai vechi nu se mai anunță (o grupă căzută zile întregi nu varsă apoi tot istoricul). */
const FEREASTRA_MS = 2 * 24 * 3600_000;

type Rand = ComandaVanduta & { id: string; checkout_id: string };

async function grupa(): Promise<{ chat: string; tab: number | null } | null> {
  const { data } = await getSupabase().from('app_config').select('key, value').in('key', ['bilete_alerte_chat', 'bilete_alerte_tab']);
  const m = new Map((data || []).map((r: { key: string; value: string }) => [r.key, String(r.value ?? '').trim()]));
  const chat = m.get('bilete_alerte_chat');
  if (!chat || !/^-?\d+$/.test(chat)) return null;
  const tab = Number(m.get('bilete_alerte_tab'));
  return { chat, tab: Number.isInteger(tab) && tab > 0 ? tab : null };
}

async function trimite(checkoutId: string, unde: { chat: string; tab: number | null }): Promise<boolean> {
  const db = getSupabase();
  const { data, error } = await db.from('bilete_comenzi').update({ grupa_anuntat_la: new Date().toISOString() })
    .eq('checkout_id', checkoutId).eq('status', 'platita').eq('test', false).is('grupa_anuntat_la', null)
    .gte('paid_at', new Date(Date.now() - FEREASTRA_MS).toISOString())
    .select(COLOANE);
  if (error || !data?.length) return false;
  const randuri = (data as Rand[]).sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const r = await sendTelegramTextSigur(unde.chat, mesajVanzare(randuri), unde.tab);
  if (r.messageId) return true;
  await db.from('bilete_comenzi').update({ grupa_anuntat_la: null }).in('id', randuri.map((x) => x.id));
  console.warn('[bilete/vanzari-grupa]', checkoutId.slice(0, 8), 'mesajul n-a plecat; se reia la împăcare');
  return false;
}

/** După emiterea biletelor unei plăți. Nu aruncă. */
export async function anuntaVanzarea(checkoutId: string): Promise<boolean> {
  try {
    const unde = await grupa();
    return unde ? await trimite(checkoutId, unde) : false;
  } catch (e) {
    console.error('[bilete/vanzari-grupa]', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Plasa de siguranță din împăcare: vânzările rămase neanunțate (callback pierdut, emitere manuală, grupă căzută). */
export async function anuntaVanzarileRamase(limita = 10): Promise<number> {
  const unde = await grupa();
  if (!unde) return 0;
  const { data } = await getSupabase().from('bilete_comenzi').select('checkout_id')
    .eq('status', 'platita').eq('test', false).is('grupa_anuntat_la', null).not('checkout_id', 'is', null)
    .gte('paid_at', new Date(Date.now() - FEREASTRA_MS).toISOString()).order('paid_at').limit(limita);
  let trimise = 0;
  for (const id of [...new Set((data || []).map((r: { checkout_id: string }) => r.checkout_id))]) {
    if (await trimite(id, unde)) trimise += 1;
  }
  return trimise;
}
