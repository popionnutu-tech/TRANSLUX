import 'server-only';
import { cheieNume, normalizeazaTelefonPasager } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { smsConfigurat, trimiteSms } from '@/lib/sms/trimite';
import { numePotrivit, textConfirmare, textGaseste, type BiletSms } from './sms-reguli';

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

export type RezultatSmsBilet = 'trimis' | 'nimic' | 'neconfigurat' | 'esuat';

/** Confirmarea unei comenzi plătite (turul; returul din pachet intră în același SMS). */
export async function trimiteSmsConfirmare(comandaId: string): Promise<RezultatSmsBilet> {
  if (!smsConfigurat()) return 'neconfigurat';
  const db = getSupabase();
  const { data, error } = await db.from('bilete_comenzi').select(COLOANE).eq('id', comandaId).maybeSingle();
  if (error) throw new Error(`bilete_comenzi (sms): ${error.message}`);
  const c = data as RandComanda | null;
  if (!c || c.status !== 'platita' || c.in_pachet || c.test) return 'nimic';
  // Revendicarea: un singur rând «confirmare» pe comandă (index unic) — al doilea apel nu trimite a doua oară.
  const { data: rand, error: eI } = await db.from('bilete_sms').insert({ comanda_id: c.id, tip: 'confirmare', telefon: c.phone }).select('id').maybeSingle();
  if (eI) { if (eI.code === '23505') return 'nimic'; throw new Error(`bilete_sms: ${eI.message}`); }
  const { data: rt } = await db.from('bilete_comenzi').select(COLOANE).eq('comanda_tur_id', c.id).eq('in_pachet', true).eq('status', 'platita').maybeSingle();
  const text = textConfirmare(await biletSms(c), rt ? await biletSms(rt as RandComanda) : null, SITE());
  const r = await trimiteSms(c.phone, text);
  await db.from('bilete_sms').update(r.ok
    ? { stare: 'trimis', trimis_la: new Date().toISOString(), furnizor_id: r.id }
    : { stare: 'eroare', eroare: r.eroare.slice(0, 300) }).eq('id', (rand as { id: string }).id);
  if (!r.ok) console.error('[bilete/sms] confirmare', c.id, r.eroare);
  return r.ok ? 'trimis' : 'esuat';
}

/** Pentru callback-ul maib: comanda sesiunii. */
export async function trimiteSmsPentruCheckout(checkoutId: string): Promise<RezultatSmsBilet> {
  if (!smsConfigurat()) return 'neconfigurat';
  const { data } = await getSupabase().from('bilete_comenzi').select('id').eq('checkout_id', checkoutId).maybeSingle();
  return data?.id ? trimiteSmsConfirmare(data.id) : 'nimic';
}

/** Plasa din împăcare: comenzile plătite în ultimele 2 ore, fără confirmare încă. */
export async function smsRestante(limita = 20): Promise<string[]> {
  if (!smsConfigurat()) return [];
  const db = getSupabase();
  const { data } = await db.from('bilete_comenzi').select('id').eq('status', 'platita').eq('in_pachet', false).eq('test', false)
    .gt('paid_at', new Date(Date.now() - 2 * 3_600_000).toISOString()).lt('paid_at', new Date(Date.now() - 2 * 60_000).toISOString())
    .order('paid_at').limit(100);
  const ids = ((data || []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return [];
  const { data: avute } = await db.from('bilete_sms').select('comanda_id').eq('tip', 'confirmare').in('comanda_id', ids);
  const cu = new Set(((avute || []) as { comanda_id: string }[]).map((x) => x.comanda_id));
  return ids.filter((id) => !cu.has(id)).slice(0, limita);
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
