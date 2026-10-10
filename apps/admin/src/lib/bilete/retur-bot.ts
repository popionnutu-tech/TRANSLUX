import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { ComandaError } from './comenzi';
import { anuleazaSiReturneaza, garantieLansareActiva } from './refund';
import { trimiteEmailAnulare } from './email';
import { CIFRE_INCERCARI_MAX, eligibilitateRetur, stareRetur, type StareRetur } from './retur-bot-reguli';
import { sumaRestituire } from './refund-reguli';

// Ion, 10.10.2026: «fac test, permite să returnez; pe viitor nu este niciun dispecer, nu bloca utilizatorii»;
// «niciodată nu trebuie decide dispecerul». Tur-returul (și turul cu un retur −20% legat) se returnează ÎNTREG din bot,
// până la plecarea turului: turul după grila lui, returul cu aceeași fracție (noimi); butonul de pe bilet-retur duce la
// tur. Cele 4 cifre greșite dau o pauză de 15 minute (554), nu blocarea și dispecerul.

/** Partea returului legat (pachet sau −20% cumpărat după tur) pentru oferta turului: aceeași fracție a grilei. */
const parteRetur = (totalRetur: number, noimi: number) => (noimi >= 9 ? Math.round(totalRetur * 100) / 100 : sumaRestituire(totalRetur, noimi));

/** Returul plătit legat de tur (în pachet sau cumpărat cu codul de retur), dacă există. */
async function returLegat(turId: string, stari: string[] = ['platita', 'platita_fara_bilet']): Promise<{ id: string; total: number } | null> {
  // L4 (revizia 10.10): un retur «platita_fara_bilet» cu banii deja în drum înapoi nu e retur legat (ca în 560).
  const { data } = await getSupabase().from('bilete_comenzi').select('id, total').eq('comanda_tur_id', turId).in('status', stari)
    .or('bani_inapoi.eq.false,status.in.(anulata,returnata)')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ? { id: (data as { id: string }).id, total: Number((data as { total: number }).total) } : null;
}

// Returnarea biletului din botul Telegram (ION-244). Botul cheamă rutele /api/bilete/retur/* cu BILETE_BOT_API_KEY;
// aici e toată logica: suma vine din grilă (cod), oferta se ține în bază cu expirare, confirmarea o consumă atomic și
// pornește executorul comun (ION-194) cu suma ofertei. AI-ul din bot nu ajunge aici decât prin aceleași butoane.
// Contractul: docs/plans/2026-10-05-retur-bot-ai.md, «Contractul API panou ↔ bot».

const COD_RE = /^[0-9a-f]{32}$/;

export interface BiletBot {
  cod: string; status: string; lang: string | null; from_name: string; to_name: string; departure_at: string; seats: number; total: number;
}

function idTelegram(v: unknown): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Comenzile legate de cont, plătite, cu plecarea în viitor. */
export async function bileteleMele(telegramIdRaw: unknown): Promise<BiletBot[]> {
  const telegramId = idTelegram(telegramIdRaw);
  if (!telegramId) return [];
  const { data, error } = await getSupabase().from('bilete_comenzi')
    .select('cod, status, lang, from_name, to_name, departure_at, seats, total')
    .eq('telegram_id', telegramId).in('status', ['platita', 'platita_fara_bilet'])
    .eq('bani_inapoi', false) // L4: banii care se întorc deja automat nu sunt un bilet de returnat
    .gt('departure_at', new Date().toISOString()).order('departure_at').limit(10);
  if (error) throw new Error(`bilete_comenzi: ${error.message}`);
  return (data || []).map((c) => ({ ...c, total: Number(c.total) })) as BiletBot[];
}

export type RaspunsOferta =
  | { ok: true; tip: 'oferta'; oferta_id: string; suma: number; total: number; noimi: number; expira_la: string; departure_at: string; from_name: string; to_name: string; lang: string }
  | { ok: true; tip: 'cere_cifre' }
  | { ok: true; tip: 'fara_bani'; motiv: 'sub_4h' | 'plecat' | 'urcat' }
  | { ok: true; tip: 'dispecer'; motiv: 'sub_10' | 'blocat' }
  | { ok: false; cod: 'cifre_gresite'; ramase: number }
  | { ok: false; cod: 'nelegat' | 'stare' | 'inexistent' | 'indisponibil' | 'bani_inapoi' };

async function alerta(comandaId: string | null, telegramId: number, detalii: string): Promise<boolean> {
  const { error } = await getSupabase().from('bilete_alerte').insert({ comanda_id: comandaId, telegram_id: telegramId, tip: 'retur_cerere', detalii: detalii.slice(0, 1000) });
  if (error) { console.error('[retur-bot] alerta:', error.message); return false; }
  return true;
}

export async function cereOferta(telegramIdRaw: unknown, codRaw: unknown, cifreRaw?: unknown): Promise<RaspunsOferta> {
  const telegramId = idTelegram(telegramIdRaw);
  const cod = String(codRaw ?? '').trim().toLowerCase();
  if (!telegramId || !COD_RE.test(cod)) return { ok: false, cod: 'inexistent' };
  const db = getSupabase();
  const COL = 'id, status, telegram_id, telegram_verificat_pentru, retur_cifre_gresite, phone, total, departure_at, from_name, to_name, lang, in_pachet, comanda_tur_id, bani_inapoi';
  const { data: c0, error } = await db.from('bilete_comenzi').select(COL).eq('cod', cod).maybeSingle();
  if (error) throw new Error(`bilete_comenzi: ${error.message}`);
  if (!c0) return { ok: false, cod: 'inexistent' };
  // Butonul de pe biletul-retur din tur-retur: pachetul se anulează din tur, deci oferta e a turului.
  let c = c0 as typeof c0 & { in_pachet: boolean; comanda_tur_id: string | null; bani_inapoi: boolean };
  if (c.in_pachet && c.comanda_tur_id) {
    const { data: t } = await db.from('bilete_comenzi').select(COL).eq('id', c.comanda_tur_id).maybeSingle();
    if (!t) return { ok: false, cod: 'inexistent' };
    c = t as typeof c;
  }
  if (Number(c.telegram_id) !== telegramId) return { ok: false, cod: 'nelegat' };
  // L4 (revizia 10.10): plata fără bilet cu banii deja în drum înapoi — nu se oferă anulare; botul spune că banii se întorc.
  if (c.status === 'platita_fara_bilet' && c.bani_inapoi) return { ok: false, cod: 'bani_inapoi' };
  if (!(c.status === 'platita' || c.status === 'platita_fara_bilet')) return { ok: false, cod: 'stare' };

  // Cele 4 cifre: o dată pe CONT (17′); 5 greșeli → blocat + dispecerul. Verificarea și contorul stau în bază,
  // cu comanda blocată (migr. 503): cererile paralele nu ocolesc plafonul.
  if (Number(c.telegram_verificat_pentru) !== telegramId) {
    if (cifreRaw == null || String(cifreRaw).trim() === '') return { ok: true, tip: 'cere_cifre' };
    const { data: r, error: eC } = await db.rpc('bilete_retur_cifre', { p_comanda: c.id, p_telegram: telegramId, p_cifre: String(cifreRaw).slice(0, 20), p_max: CIFRE_INCERCARI_MAX });
    if (eC) {
      if (/OFERTA_NELEGAT/.test(eC.message)) return { ok: false, cod: 'nelegat' };
      throw new Error(`bilete_retur_cifre: ${eC.message}`);
    }
    const v = r as { ok: boolean; ramase: number; blocat: boolean };
    if (!v.ok) {
      // 554: după 5 greșeli — pauză de 15 minute (botul spune «încearcă din nou peste 15 minute»), fără dispecer.
      if (v.blocat) return { ok: true, tip: 'dispecer', motiv: 'blocat' };
      return { ok: false, cod: 'cifre_gresite', ramase: v.ramase };
    }
  }

  // C6 (10.10): aceeași eligibilitate ca pagina biletului și asistentul (eligibilitateRetur): bilet urcat → nimic; tur cu
  // retur legat → doar până la plecarea turului; apoi grila sau garanția de lansare (biletul nefolosit primește tot și sub
  // 4 h, până la plecare + 24 h — funcția ofertei din bază o acceptă din 562).
  const leg = await returLegat(c.id);
  const urcate = async (id: string) => (await db.from('bilete').select('id', { count: 'exact', head: true }).eq('comanda_id', id).eq('status', 'urcat')).count ?? 0;
  const [urcateTur, urcateRetur, garantie] = await Promise.all([urcate(c.id), leg ? urcate(leg.id) : Promise.resolve(0), garantieLansareActiva()]);
  const calc = eligibilitateRetur({ departureAt: c.departure_at, total: Number(c.total), urcateTur, leg: leg ? { total: leg.total, urcate: urcateRetur } : null, nowMs: Date.now(), garantie });
  if (calc.tip === 'fara_bani') return { ok: true, tip: 'fara_bani', motiv: calc.motiv };
  if (calc.tip === 'dispecer') return { ok: true, tip: 'dispecer', motiv: 'sub_10' }; // bilet sub 10 lei: nu se vinde online
  const { data: o, error: eO } = await db.rpc('bilete_retur_oferta_noua', {
    p_comanda: c.id, p_telegram: telegramId, p_noimi: calc.noimi, p_suma: calc.suma, p_total: Number(c.total),
    p_expira: new Date(calc.expiraMs).toISOString(),
  });
  if (eO) {
    if (/OFERTA_NELEGAT/.test(eO.message)) return { ok: false, cod: 'nelegat' };
    if (/OFERTA_STARE/.test(eO.message)) return { ok: false, cod: 'stare' };
    if (/OFERTA_NEVERIFICAT/.test(eO.message)) return { ok: true, tip: 'cere_cifre' };
    if (/OFERTA_EXPIRARE_GRESITA/.test(eO.message)) return { ok: true, tip: 'fara_bani', motiv: 'sub_4h' };
    throw new Error(`bilete_retur_oferta_noua: ${eO.message}`);
  }
  const of = o as { id: string; expira_la: string };
  // Oferta din bază ține suma turului; clientul vede tot ce primește înapoi (turul + returul legat).
  const plusRetur = leg ? parteRetur(leg.total, calc.noimi) : 0;
  return {
    ok: true, tip: 'oferta', oferta_id: of.id, suma: Math.round((calc.suma + plusRetur) * 100) / 100, total: Number(c.total) + (leg?.total ?? 0), noimi: calc.noimi, expira_la: of.expira_la,
    departure_at: c.departure_at, from_name: c.from_name, to_name: c.to_name, lang: c.lang === 'ru' ? 'ru' : 'ro',
  };
}

export interface RaspunsStare { ok: true; stare: StareRetur | 'expirata'; suma: number; motiv?: string }

/** Starea unei oferte, din sursa de adevăr (comanda + checkout-ul ei), cu tabelul 16′/16″. */
export async function stareOferta(telegramIdRaw: unknown, ofertaIdRaw: unknown): Promise<RaspunsStare | { ok: false; cod: 'inexistent' }> {
  const telegramId = idTelegram(telegramIdRaw);
  const ofertaId = String(ofertaIdRaw ?? '');
  if (!telegramId || !/^[0-9a-f-]{36}$/i.test(ofertaId)) return { ok: false, cod: 'inexistent' };
  const db = getSupabase();
  const { data: o } = await db.from('bilete_retur_oferte').select('id, comanda_id, telegram_id, suma, noimi, folosita_la, inchisa_la, expira_la, rezultat').eq('id', ofertaId).maybeSingle();
  if (!o || Number(o.telegram_id) !== telegramId) return { ok: false, cod: 'inexistent' };
  const { data: c } = await db.from('bilete_comenzi').select('status, checkout_id').eq('id', o.comanda_id).maybeSingle();
  if (!c) return { ok: false, cod: 'inexistent' };
  const { data: ck } = c.checkout_id
    ? await db.from('maib_checkouts').select('refund_id, refund_status').eq('checkout_id', c.checkout_id).maybeSingle()
    : { data: null };
  const s = stareRetur({ oferta: { folosita_la: o.folosita_la, rezultat: o.rezultat }, comanda: { status: c.status }, checkout: ck ?? null });
  const leg = await returLegat(o.comanda_id, ['platita', 'platita_fara_bilet', 'anulata', 'returnata']);
  const suma = Math.round((Number(o.suma) + (leg ? parteRetur(leg.total, Number(o.noimi ?? 9)) : 0)) * 100) / 100;
  if (s.stare === 'neatinsa' && (o.inchisa_la || Date.parse(o.expira_la) < Date.now())) return { ok: true, stare: 'expirata', suma };
  return { ok: true, stare: s.stare, suma, motiv: s.motiv };
}

/** Consumă oferta și pornește returnarea cu suma ei. Orice ieșire după consumare își scrie rezultatul pe ofertă. */
export async function confirmaOferta(telegramIdRaw: unknown, ofertaIdRaw: unknown): Promise<RaspunsStare | { ok: false; cod: 'inexistent' }> {
  const telegramId = idTelegram(telegramIdRaw);
  const ofertaId = String(ofertaIdRaw ?? '');
  if (!telegramId || !/^[0-9a-f-]{36}$/i.test(ofertaId)) return { ok: false, cod: 'inexistent' };
  const db = getSupabase();
  const { data: o, error } = await db.rpc('bilete_retur_foloseste', { p_oferta: ofertaId, p_telegram: telegramId });
  if (error) {
    if (/OFERTA_(EXPIRATA|INCHISA)/.test(error.message)) {
      const { data: x } = await db.from('bilete_retur_oferte').select('suma').eq('id', ofertaId).maybeSingle();
      return { ok: true, stare: 'expirata', suma: Number(x?.suma ?? 0) };
    }
    if (/OFERTA_FOLOSITA/.test(error.message)) return stareOferta(telegramId, ofertaId); // a doua apăsare: starea reală
    if (/OFERTA_(INEXISTENTA|STRAINA)/.test(error.message)) return { ok: false, cod: 'inexistent' };
    throw new Error(`bilete_retur_foloseste: ${error.message}`);
  }
  const of = o as OfertaFolosita;
  await executaOferta(of);
  return stareOferta(telegramId, of.id);
}

interface OfertaFolosita { id: string; comanda_id: string; suma: number; noimi?: number | null; validata_la: string }

/**
 * Returnarea pentru o ofertă deja consumată: anularea + intenția de refund, apoi rezultatul pe ofertă (doar dacă nu are
 * deja unul). O cheamă confirmarea din bot și împăcarea, pentru oferta consumată de o funcție care a murit înainte de
 * anulare (Codex C1, 10.10: «recuperarea ofertelor consumate» — fără dispecer).
 */
export async function executaOferta(of: OfertaFolosita): Promise<string> {
  const db = getSupabase();
  let rezultat = 'eroare';
  // Returul legat (pachet sau −20% cumpărat după tur, chiar și după ofertă): se anulează împreună, cu aceeași fracție.
  const leg = await returLegat(of.comanda_id);
  const sumaRetur = leg ? parteRetur(leg.total, Number(of.noimi ?? 9)) : undefined;
  try {
    const r = await anuleazaSiReturneaza(of.comanda_id, {
      sursa: 'ai', motiv: `returnare cerută în botul Telegram (oferta ${of.id}, ${Number(of.suma)} lei după grilă${leg ? ` + returul legat ${sumaRetur} lei` : ''})`,
      suma: Number(of.suma), acumMs: Date.parse(of.validata_la), ...(leg ? { siReturul: true, sumaRetur } : {}),
    });
    rezultat = r.refund === 'creat' ? 'creat' : r.refund === 'necunoscut' ? 'necunoscut' : 'fara_plata';
    if (r.refund !== 'fara_plata') await trimiteEmailAnulare(of.comanda_id, r.suma ?? Number(of.suma)).catch(() => 'esuat');
  } catch (e) {
    rezultat = e instanceof ComandaError ? (e.cod === 'inchis' && /scanat/.test(e.message) ? 'refuz:urcat'
      : e.cod === 'maib' && /rămas anulată/.test(e.message) ? 'refuz:maib_anulata' : `refuz:${e.cod}`) : 'eroare';
    if (!(e instanceof ComandaError)) console.error('[retur-bot] confirmare:', e instanceof Error ? e.message : e);
  } finally {
    await db.from('bilete_retur_oferte').update({ rezultat }).eq('id', of.id).is('rezultat', null);
  }
  return rezultat;
}

export async function escaladeaza(telegramIdRaw: unknown, codRaw: unknown, textRaw: unknown, motivRaw: unknown): Promise<boolean> {
  const telegramId = idTelegram(telegramIdRaw);
  if (!telegramId) return false;
  // Plafon: cel mult 5 cereri în 10 minute pe cont (alertele ajung la oameni).
  const { count } = await getSupabase().from('bilete_alerte').select('id', { count: 'exact', head: true })
    .eq('tip', 'retur_cerere').eq('telegram_id', telegramId).gt('moment', new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 5) return true; // deja primite; nu mai deranjăm dispecerul
  const motiv = motivRaw === 'vina_noastra' ? 'vina_noastra' : 'altceva';
  const text = String(textRaw ?? '').slice(0, 1000);
  const cod = String(codRaw ?? '').trim().toLowerCase();
  let comandaId: string | null = null;
  if (COD_RE.test(cod)) {
    const { data } = await getSupabase().from('bilete_comenzi').select('id').eq('cod', cod).eq('telegram_id', telegramId).maybeSingle();
    comandaId = data?.id ?? null;
  }
  return alerta(comandaId, telegramId, `cerere din botul Telegram (${motiv === 'vina_noastra' ? 'clientul spune că e vina noastră' : 'altă cerere'}, telegram ${telegramId}): ${text}`);
}
