import 'server-only';
import { cheieNume, normalizeazaTelefonPasager } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { smsConfigurat, trimiteSms } from '@/lib/sms/trimite';
import {
  confirmareDeReluat, numePotrivit, SMS_FEREASTRA_MS, SMS_INCERCARI_MAX, SMS_PAUZA_RELUARE_MS, SMS_TERMEN_REVENDICARE_MS,
  textConfirmare, textGaseste, trimiteConfirmareSms, type BiletSms, type RandSmsConfirmare, type Revendicare,
} from './sms-reguli';

// SMS-urile biletelor (552; Ion, 10.10.2026: «să vină mesaj la client cu bronarea și cum poate el pe site să-și găsească
// biletul; un buton «Găsește biletul meu»»). Confirmarea: o dată pe comandă (indexul unic din bilete_sms), după callback-ul
// băncii și, ca plasă, din împăcare. «Găsește»: linkurile pleacă DOAR pe telefonul cumpărătorului, nimic pe ecran
// (linkul biletului e cheia lui); același răspuns cu sau fără bilete, plafoane în bază.

const SITE = () => process.env.SITE_URL || 'https://translux.md';

interface RandComanda { id: string; cod: string; lang: string | null; from_name: string; to_name: string; departure_at: string; phone: string; status: string; in_pachet: boolean; comanda_tur_id: string | null; test: boolean; going_north: boolean }

async function biletSms(c: RandComanda): Promise<BiletSms> {
  const { data } = await getSupabase().from('bilete').select('loc_nr').eq('comanda_id', c.id).in('status', ['valid', 'urcat']).order('nr');
  // Ion, 10.10.2026: «de la nord la Chișinău să nu fie numerotarea locurilor în bilete, doar din Chișinău».
  const locuri = c.going_north ? ((data || []) as { loc_nr: number | null }[]).map((b) => b.loc_nr).filter((x): x is number => typeof x === 'number') : [];
  return { lang: c.lang === 'ru' ? 'ru' : 'ro', from: c.from_name, to: c.to_name, departure_at: c.departure_at, cod: c.cod, locuri };
}

const COLOANE = 'id, cod, lang, from_name, to_name, departure_at, phone, status, in_pachet, comanda_tur_id, test, going_north';

export type RezultatSmsBilet = 'trimis' | 'nimic' | 'neconfigurat' | 'esuat' | 'necunoscut';

/** Confirmarea unei comenzi plătite (turul; returul din pachet intră în același SMS). */
export async function trimiteSmsConfirmare(comandaId: string): Promise<RezultatSmsBilet> {
  if (!smsConfigurat()) return 'neconfigurat';
  const db = getSupabase();
  const { data, error } = await db.from('bilete_comenzi').select(COLOANE).eq('id', comandaId).maybeSingle();
  if (error) throw new Error(`bilete_comenzi (sms): ${error.message}`);
  const c = data as RandComanda | null;
  if (!c || c.status !== 'platita' || c.in_pachet || c.test) return 'nimic';
  // N5 (563): revendicare cu termen + jeton în bază (un singur rând «confirmare» pe comandă), începerea marcată înaintea
  // cererii, rezultatul separat: refuzat (se reia din plasă, max 3, în 2 h) / necunoscut (nu se retrimite orbește).
  return trimiteConfirmareSms({
    async revendica(): Promise<Revendicare> {
      const { data: v, error: e } = await db.rpc('bilete_sms_confirmare_revendica', {
        p_comanda: c.id, p_telefon: c.phone, p_termen_sec: SMS_TERMEN_REVENDICARE_MS / 1000, p_max: SMS_INCERCARI_MAX, p_pauza_sec: SMS_PAUZA_RELUARE_MS / 1000,
      });
      if (e) throw new Error(`bilete_sms_confirmare_revendica: ${e.message}`);
      return v as Revendicare;
    },
    async text() {
      const { data: rt } = await db.from('bilete_comenzi').select(COLOANE).eq('comanda_tur_id', c.id).eq('in_pachet', true).eq('status', 'platita').maybeSingle();
      return textConfirmare(await biletSms(c), rt ? await biletSms(rt as RandComanda) : null, SITE());
    },
    async incepe(id, token) {
      const { data: v, error: e } = await db.rpc('bilete_sms_confirmare_incepe', { p_id: id, p_token: token });
      if (e) throw new Error(`bilete_sms_confirmare_incepe: ${e.message}`);
      return v === true;
    },
    trimite: (text) => trimiteSms(c.phone, text),
    async rezultat(id, token, stare, furnizorId, eroare) {
      const { error: e } = await db.rpc('bilete_sms_confirmare_rezultat', { p_id: id, p_token: token, p_stare: stare, p_furnizor: furnizorId, p_eroare: eroare });
      if (e) console.error('[bilete/sms] rezultat', c.id, stare, e.message);
    },
    jurnal: (m) => console.error(m, c.id),
  });
}

/** Pentru callback-ul maib: comanda sesiunii. */
export async function trimiteSmsPentruCheckout(checkoutId: string): Promise<RezultatSmsBilet> {
  if (!smsConfigurat()) return 'neconfigurat';
  const { data } = await getSupabase().from('bilete_comenzi').select('id').eq('checkout_id', checkoutId).maybeSingle();
  return data?.id ? trimiteSmsConfirmare(data.id) : 'nimic';
}

/** Plasa din împăcare: comenzile plătite în ultimele 2 ore fără confirmare, sau cu una de reluat (N5: refuz sub plafon,
 *  revendicare expirată). Baza decide atomic la revendicare; aici doar se aleg candidații. */
export async function smsRestante(limita = 20): Promise<string[]> {
  if (!smsConfigurat()) return [];
  const db = getSupabase();
  const acum = Date.now();
  const { data } = await db.from('bilete_comenzi').select('id').eq('status', 'platita').eq('in_pachet', false).eq('test', false)
    .gt('paid_at', new Date(acum - SMS_FEREASTRA_MS).toISOString()).lt('paid_at', new Date(acum - 2 * 60_000).toISOString())
    .order('paid_at').limit(100);
  const ids = ((data || []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return [];
  const { data: avute } = await db.from('bilete_sms').select('comanda_id, stare, incercari, revendicat_la, trimitere_la, created_at')
    .eq('tip', 'confirmare').in('comanda_id', ids);
  const randuri = new Map(((avute || []) as (RandSmsConfirmare & { comanda_id: string })[]).map((x) => [x.comanda_id, x]));
  return ids.filter((id) => { const r = randuri.get(id); return !r || confirmareDeReluat(r, acum); }).slice(0, limita);
}

export type RezultatGaseste =
  | { ok: true; bilete?: BiletSms[] }
  | { ok: false; motiv: 'neconfigurat' | 'telefon' | 'plafon' | 'nume' };

/** Fără SMS: biletele viitoare ale numărului, pe ecran, doar dacă numele se potrivește (altfel listă goală, ca «nimic»). */
async function gasestePeEcran(telefon: string, ipHash: string, nume: string): Promise<RezultatGaseste> {
  if (!cheieNume(nume).split(' ').some((w) => w.length >= 2)) return { ok: false, motiv: 'nume' };
  const db = getSupabase();
  const { data: start, error: e0 } = await db.rpc('bilete_sms_gaseste_incepe', { p_telefon: telefon, p_ip: ipHash });
  if (e0) throw new Error(`bilete_sms_gaseste_incepe: ${e0.message}`);
  const s = start as { ok: boolean; id?: string };
  if (!s.ok || !s.id) return { ok: false, motiv: 'plafon' };
  const { data, error } = await db.from('bilete_comenzi').select(`${COLOANE}, passenger_name`).eq('phone', telefon).eq('status', 'platita').eq('test', false)
    .gt('departure_at', new Date(Date.now() - 3 * 3_600_000).toISOString()).order('departure_at').limit(6);
  if (error) throw new Error(`bilete_comenzi (găsește): ${error.message}`);
  const rows = ((data || []) as (RandComanda & { passenger_name: string })[]).filter((c) => numePotrivit(nume, c.passenger_name));
  // Jurnalul: «fara_bilete» când nimic nu se potrivește; altfel «trimis» cu furnizorul «ecran» (n-a plecat niciun SMS).
  await db.from('bilete_sms').update(rows.length
    ? { stare: 'trimis', trimis_la: new Date().toISOString(), furnizor_id: 'ecran', text: `${rows.length} bilete pe ecran (fără SMS)` }
    : { stare: 'fara_bilete' }).eq('id', s.id);
  return { ok: true, bilete: await Promise.all(rows.map(biletSms)) };
}

/** Asistentul de pe site (Ion, 10.10.2026: «asistentul dă biletul în baza la nume și număr», «fără link bilet»): omul
 *  se identifică cu telefonul + numele de pe bilet și primește biletele în chat, cu sau fără SMS; aceleași plafoane. */
export async function gasesteBileteInChat(telefonBrut: string, ipHash: string, nume: string): Promise<RezultatGaseste> {
  const telefon = normalizeazaTelefonPasager(telefonBrut);
  if (!telefon) return { ok: false, motiv: 'telefon' };
  return gasestePeEcran(telefon, ipHash, nume);
}

/** «Găsește biletul meu»: linkurile biletelor viitoare, prin SMS, doar pe acel număr. */
export async function gasesteBilete(telefonBrut: string, ipHash: string, lang: 'ro' | 'ru', nume = ''): Promise<RezultatGaseste> {
  const telefon = normalizeazaTelefonPasager(telefonBrut);
  if (!telefon) return { ok: false, motiv: 'telefon' };
  // Ion, 10.10.2026: «găsește bilet să lucreze pe număr de telefon până nu e gata SMS-ul» — cu telefon + nume (ales de
  // Ion), ca un număr ghicit să nu dea biletul (QR-ul) altcuiva. Plafoanele SMS-ului (3/oră pe număr, 10 pe IP) rămân.
  if (!smsConfigurat()) return gasestePeEcran(telefon, ipHash, nume);
  const db = getSupabase();
  const { data: start, error: e0 } = await db.rpc('bilete_sms_gaseste_incepe', { p_telefon: telefon, p_ip: ipHash });
  if (e0) throw new Error(`bilete_sms_gaseste_incepe: ${e0.message}`);
  const s = start as { ok: boolean; id?: string };
  if (!s.ok || !s.id) return { ok: false, motiv: 'plafon' };
  const { data, error } = await db.from('bilete_comenzi').select(COLOANE).eq('phone', telefon).eq('status', 'platita').eq('test', false)
    .gt('departure_at', new Date(Date.now() - 3 * 3_600_000).toISOString()).order('departure_at').limit(3);
  if (error) throw new Error(`bilete_comenzi (găsește): ${error.message}`);
  const rows = (data || []) as RandComanda[];
  if (!rows.length) { await db.from('bilete_sms').update({ stare: 'fara_bilete' }).eq('id', s.id); return { ok: true }; }
  const bilete = await Promise.all(rows.map(biletSms));
  // Limba SMS-ului: a paginii de unde a cerut omul; linkurile păstrează limba fiecărui bilet.
  const r = await trimiteSms(telefon, textGaseste(lang, bilete, SITE()));
  await db.from('bilete_sms').update(r.ok
    ? { stare: 'trimis', trimis_la: new Date().toISOString(), furnizor_id: r.id, text: `${bilete.length} bilete` }
    : { stare: 'eroare', eroare: r.eroare.slice(0, 300) }).eq('id', s.id);
  return { ok: true };
}
