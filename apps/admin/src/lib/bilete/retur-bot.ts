import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { ComandaError } from './comenzi';
import { anuleazaSiReturneaza } from './refund';
import { trimiteEmailAnulare } from './email';
import { calculeazaOferta, cifreCorecte, CIFRE_INCERCARI_MAX, stareRetur, type StareRetur } from './retur-bot-reguli';

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
  | { ok: false; cod: 'nelegat' | 'stare' | 'inexistent' | 'indisponibil' };

async function alerta(comandaId: string | null, detalii: string): Promise<boolean> {
  const { error } = await getSupabase().from('bilete_alerte').insert({ comanda_id: comandaId, tip: 'retur_cerere', detalii: detalii.slice(0, 1000) });
  if (error) { console.error('[retur-bot] alerta:', error.message); return false; }
  return true;
}

export async function cereOferta(telegramIdRaw: unknown, codRaw: unknown, cifreRaw?: unknown): Promise<RaspunsOferta> {
  const telegramId = idTelegram(telegramIdRaw);
  const cod = String(codRaw ?? '').trim().toLowerCase();
  if (!telegramId || !COD_RE.test(cod)) return { ok: false, cod: 'inexistent' };
  const db = getSupabase();
  const { data: c, error } = await db.from('bilete_comenzi')
    .select('id, status, telegram_id, telegram_verificat_pentru, retur_cifre_gresite, phone, total, departure_at, from_name, to_name, lang')
    .eq('cod', cod).maybeSingle();
  if (error) throw new Error(`bilete_comenzi: ${error.message}`);
  if (!c) return { ok: false, cod: 'inexistent' };
  if (Number(c.telegram_id) !== telegramId) return { ok: false, cod: 'nelegat' };
  if (!(c.status === 'platita' || c.status === 'platita_fara_bilet')) return { ok: false, cod: 'stare' };

  // Biletul scanat la urcare nu se mai returnează (funcția din bază refuză oricum; spunem din timp).
  const { count: urcate } = await db.from('bilete').select('id', { count: 'exact', head: true }).eq('comanda_id', c.id).eq('status', 'urcat');
  if ((urcate ?? 0) > 0) return { ok: true, tip: 'fara_bani', motiv: 'urcat' };

  // Cele 4 cifre: o dată pe CONT (17′); 5 greșeli → blocat + dispecerul.
  if (Number(c.telegram_verificat_pentru) !== telegramId) {
    if ((c.retur_cifre_gresite ?? 0) >= CIFRE_INCERCARI_MAX) return { ok: true, tip: 'dispecer', motiv: 'blocat' };
    if (cifreRaw == null || String(cifreRaw).trim() === '') return { ok: true, tip: 'cere_cifre' };
    if (!cifreCorecte(c.phone, String(cifreRaw))) {
      const gresite = (c.retur_cifre_gresite ?? 0) + 1;
      await db.from('bilete_comenzi').update({ retur_cifre_gresite: gresite }).eq('id', c.id);
      if (gresite >= CIFRE_INCERCARI_MAX) {
        await alerta(c.id, `returnare din bot blocată: ${gresite} încercări greșite ale cifrelor telefonului (telegram ${telegramId})`);
        return { ok: true, tip: 'dispecer', motiv: 'blocat' };
      }
      return { ok: false, cod: 'cifre_gresite', ramase: CIFRE_INCERCARI_MAX - gresite };
    }
    await db.from('bilete_comenzi').update({ telegram_verificat_pentru: telegramId, retur_cifre_gresite: 0 }).eq('id', c.id).eq('telegram_id', telegramId);
  }

  const calc = calculeazaOferta(c.departure_at, Number(c.total), Date.now());
  if (calc.tip === 'fara_bani') return { ok: true, tip: 'fara_bani', motiv: calc.motiv };
  if (calc.tip === 'dispecer') {
    await alerta(c.id, `returnare din bot sub minimul băncii (10 MDL) — decide dispecerul (telegram ${telegramId})`);
    return { ok: true, tip: 'dispecer', motiv: 'sub_10' };
  }
  const { data: o, error: eO } = await db.rpc('bilete_retur_oferta_noua', {
    p_comanda: c.id, p_telegram: telegramId, p_noimi: calc.noimi, p_suma: calc.suma, p_total: Number(c.total),
    p_expira: new Date(calc.expiraMs).toISOString(),
  });
  if (eO) {
    if (/OFERTA_NELEGAT/.test(eO.message)) return { ok: false, cod: 'nelegat' };
    if (/OFERTA_STARE/.test(eO.message)) return { ok: false, cod: 'stare' };
    throw new Error(`bilete_retur_oferta_noua: ${eO.message}`);
  }
  const of = o as { id: string; expira_la: string };
  return {
    ok: true, tip: 'oferta', oferta_id: of.id, suma: calc.suma, total: Number(c.total), noimi: calc.noimi, expira_la: of.expira_la,
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
  const { data: o } = await db.from('bilete_retur_oferte').select('id, comanda_id, telegram_id, suma, folosita_la, inchisa_la, expira_la, rezultat').eq('id', ofertaId).maybeSingle();
  if (!o || Number(o.telegram_id) !== telegramId) return { ok: false, cod: 'inexistent' };
  const { data: c } = await db.from('bilete_comenzi').select('status, checkout_id').eq('id', o.comanda_id).maybeSingle();
  if (!c) return { ok: false, cod: 'inexistent' };
  const { data: ck } = c.checkout_id
    ? await db.from('maib_checkouts').select('refund_id, refund_status').eq('checkout_id', c.checkout_id).maybeSingle()
    : { data: null };
  const s = stareRetur({ oferta: { folosita_la: o.folosita_la, rezultat: o.rezultat }, comanda: { status: c.status }, checkout: ck ?? null });
  if (s.stare === 'neatinsa' && (o.inchisa_la || Date.parse(o.expira_la) < Date.now())) return { ok: true, stare: 'expirata', suma: Number(o.suma) };
  return { ok: true, stare: s.stare, suma: Number(o.suma), motiv: s.motiv };
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
  const of = o as { id: string; comanda_id: string; suma: number; validata_la: string };
  let rezultat = 'eroare';
  try {
    const r = await anuleazaSiReturneaza(of.comanda_id, {
      sursa: 'ai', motiv: `returnare cerută în botul Telegram (oferta ${of.id}, ${Number(of.suma)} lei după grilă)`,
      suma: Number(of.suma), acumMs: Date.parse(of.validata_la),
    });
    rezultat = r.refund === 'creat' ? 'creat' : r.refund === 'necunoscut' ? 'necunoscut' : 'fara_plata';
    if (r.refund !== 'fara_plata') await trimiteEmailAnulare(of.comanda_id, Number(of.suma)).catch(() => 'esuat');
  } catch (e) {
    rezultat = e instanceof ComandaError ? `refuz:${e.cod}` : 'eroare';
    if (!(e instanceof ComandaError)) console.error('[retur-bot] confirmare:', e instanceof Error ? e.message : e);
  } finally {
    await db.from('bilete_retur_oferte').update({ rezultat }).eq('id', of.id);
  }
  return stareOferta(telegramId, of.id);
}

export async function escaladeaza(telegramIdRaw: unknown, codRaw: unknown, textRaw: unknown, motivRaw: unknown): Promise<boolean> {
  const telegramId = idTelegram(telegramIdRaw);
  if (!telegramId) return false;
  // Plafon: cel mult 5 cereri în 10 minute pe cont (alertele ajung la oameni).
  const { count } = await getSupabase().from('bilete_alerte').select('id', { count: 'exact', head: true })
    .eq('tip', 'retur_cerere').ilike('detalii', `%telegram ${telegramId}%`).gt('moment', new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 5) return true; // deja primite; nu mai deranjăm dispecerul
  const motiv = motivRaw === 'vina_noastra' ? 'vina_noastra' : 'altceva';
  const text = String(textRaw ?? '').slice(0, 1000);
  const cod = String(codRaw ?? '').trim().toLowerCase();
  let comandaId: string | null = null;
  if (COD_RE.test(cod)) {
    const { data } = await getSupabase().from('bilete_comenzi').select('id').eq('cod', cod).eq('telegram_id', telegramId).maybeSingle();
    comandaId = data?.id ?? null;
  }
  return alerta(comandaId, `cerere din botul Telegram (${motiv === 'vina_noastra' ? 'clientul spune că e vina noastră' : 'altă cerere'}, telegram ${telegramId}): ${text}`);
}
