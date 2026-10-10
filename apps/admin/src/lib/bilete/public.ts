import 'server-only';
import { localitatiPentruPublic, type Bilet, type BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { sincronizeazaStare } from '@/lib/maib/sincronizare';
import { citesteConfigBilete } from './comenzi';
import { citestePromoConfig } from './promo-server';
import { asambleazaComanda, COLOANE_BILET, COLOANE_COMANDA, type BiletRand, type ComandaRand, type OprireSosireRand, type RutaRand } from './bilet-asamblare';
import { echipajeZile } from './echipaj';
import { echipajPentruBilet, type EchipajBilet } from './echipaj-reguli';

// Ce vede pasagerul (pagina biletului de pe site, prin API cu codul din link ca secret) și ce vede site-ul
// (configurația vânzării). Fără alți pasageri, fără ip_hash, fără telegram_id.

export interface BiletPublic {
  nr: number;
  /** ION-239: locul din autobuz (1 față, 2–16 rânduri, 17–20 spate); null = fără loc dat / bilet anulat. */
  loc_nr: number | null;
  cod_qr: string;
  status: Bilet['status'];
  urcat_at: string | null;
  /** SVG inline al codului QR (conține DOAR cod_qr). */
  qr_svg: string;
}

export interface ComandaPublica {
  cod: string;
  /** ION-235 (cerințele maib): numărul comenzii arătat clientului = primele 8 caractere ale id-ului, majuscule. */
  numar: string;
  status: BileteComanda['status'];
  trip_date: string;
  from_name: string;
  to_name: string;
  departure_at: string;
  /** ION-236: ora sosirii din grafic la oprirea de coborâre, «HH:MM» (Chișinău); null dacă lipsește din nomenclator. */
  sosire: string | null;
  seats: number;
  price_per_seat: number;
  total: number;
  passenger_name: string;
  lang: 'ro' | 'ru';
  paid_at: string | null;
  cancelled_at: string | null;
  ruta: { id: number; nume_ro: string; nume_ru: string } | null;
  /** ION-198: unde urcă pasagerul (copia de la comandă). */
  punct_urcare: { nume_ro: string; nume_ru: string; lat: number; lon: number } | null;
  /** Comandă de probă (migr. 532): biletul arată «BILET DE PROBĂ — NU E VALABIL LA URCARE». */
  proba: boolean;
  /** Echipajul cursei (migr. 538): după bifa dispecerului placa + prenumele (+ telefonul în fereastra plecare ± 3 h). */
  echipaj: EchipajBilet | null;
  bilete: BiletPublic[];
  /** 546: reducerea aplicată (eticheta «RETUR −20%» / «STUDENT −20% · arată carnetul» + prețul întreg tăiat). */
  reducere?: { tip: 'retur' | 'student'; pret_intreg: number } | null;
  /** 546: codul care dă −20% la retur — doar pe turul plătit al perechii Bălți ⇄ Chișinău. */
  cod_retur?: string | null;
  /** 548: tur-retur plătit o dată — celălalt bilet al pachetului (codul paginii lui și sensul). */
  pachet?: { cod: string; sens: 'retur' | 'tur'; trip_date: string; departure_at: string; from_name: string; to_name: string } | null;
}

const COD_RE = /^[0-9a-f]{32}$/i;

export class BazaIndisponibilaError extends Error {
  constructor(mesaj: string) { super(mesaj); this.name = 'BazaIndisponibilaError'; }
}

/**
 * Plafon pentru traficul neautentificat pe biletul public (Codex X13): pe IP, în bază (serverless n-are memorie
 * comună). Dacă plafonul însuși nu poate fi verificat, lăsăm cererea să treacă — un bilet trebuie să se poată arăta.
 */
export async function plafonPublic(ip: string | null, max = 60): Promise<boolean> {
  // Fără IP (nu se întâmplă pe Vercel, care pune mereu x-forwarded-for) nu punem pe toți într-o găleată comună (Y3).
  if (!ip) return true;
  const cheie = `pub:${ip}`;
  const { data, error } = await getSupabase().rpc('bilete_plafon', { p_cheie: cheie, p_fereastra_s: 60, p_max: max });
  if (error) { console.warn('[bilete] plafon public:', error.message); return true; }
  return data !== false;
}

/**
 * Pagina pe care se întoarce pasagerul după plată: dacă comanda e încă «noua» și are sesiune, citim starea de la
 * maib ACUM (callback-ul poate întârzia sau lipsi) — sincronizarea emite și biletele. Un drum la maib, doar
 * cât comanda e deschisă; apoi pagina citește din bază.
 */
export async function sincronizeazaComandaDupaCod(cod: string): Promise<void> {
  if (!COD_RE.test(cod)) return;
  const { data } = await getSupabase().from('bilete_comenzi').select('status, checkout_id').eq('cod', cod).maybeSingle();
  if (!data || !data.checkout_id || !(data.status === 'noua' || data.status === 'eroare_creare')) return;
  const r = await sincronizeazaStare(data.checkout_id);
  if (!r.ok) console.warn('[bilete] sincronizare la întoarcere:', r.eroare);
}

export async function biletPublic(cod: string): Promise<ComandaPublica | null> {
  if (!COD_RE.test(cod)) return null;
  const db = getSupabase();
  const { data: c, error: cErr } = await db.from('bilete_comenzi').select(COLOANE_COMANDA).eq('cod', cod).maybeSingle();
  if (cErr) throw new BazaIndisponibilaError(cErr.message); // «nu există» ≠ «baza nu răspunde» (Codex X11)
  if (!c) return null;
  const comanda = c as unknown as ComandaRand;
  const [rB, rR, rS, echipaje] = await Promise.all([
    db.from('bilete').select(COLOANE_BILET).eq('comanda_id', comanda.id).order('nr'),
    db.from('crm_routes').select('id, dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru').eq('id', comanda.crm_route_id).maybeSingle(),
    // ION-236: ora sosirii din grafic la oprirea de coborâre, pe sensul comenzii (biletul arată plecare → sosire)
    db.from('crm_stop_fares').select('hour_from_chisinau, hour_from_nord').eq('crm_route_id', comanda.crm_route_id).eq('stop_order', comanda.to_stop_order ?? -1).maybeSingle(),
    echipajPentruComenzi([comanda]),
  ]);
  if (rB.error) throw new BazaIndisponibilaError(rB.error.message);
  if (rR.error) throw new BazaIndisponibilaError(rR.error.message);
  // ION-276: aceeași asamblare ca lista clientului din mini app (bilet-asamblare.ts).
  const pub = await asambleazaComanda(comanda, (rB.data ?? []) as BiletRand[], (rR.data as RutaRand | null) ?? null, (rS.data as OprireSosireRand | null) ?? null, echipaje.get(comanda.id) ?? null);
  return { ...pub, pachet: await celalaltDinPachet(comanda.id) };
}

/** 548: biletul pereche din tur-retur (returul turului, sau turul returului), doar plătit. */
async function celalaltDinPachet(id: string): Promise<ComandaPublica['pachet']> {
  const db = getSupabase();
  const { data: eu } = await db.from('bilete_comenzi').select('in_pachet, comanda_tur_id').eq('id', id).maybeSingle();
  const e = eu as { in_pachet?: boolean; comanda_tur_id?: string | null } | null;
  const q = db.from('bilete_comenzi').select('cod, trip_date, departure_at, from_name, to_name, status');
  const { data } = e?.in_pachet && e.comanda_tur_id
    ? await q.eq('id', e.comanda_tur_id).maybeSingle()
    : await q.eq('comanda_tur_id', id).eq('in_pachet', true).in('status', ['platita', 'platita_fara_bilet']).limit(1).maybeSingle();
  const r = data as { cod: string; trip_date: string; departure_at: string; from_name: string; to_name: string; status: string } | null;
  if (!r || !['platita', 'platita_fara_bilet'].includes(r.status)) return null;
  return { cod: r.cod, sens: e?.in_pachet ? 'tur' : 'retur', trip_date: r.trip_date, departure_at: r.departure_at, from_name: r.from_name, to_name: r.to_name };
}

/** Capacitatea autobuzului (ION-239, migr. 501): 1 față + 5 × 3 + 4 spate. */
export const CAPACITATE_AUTOBUZ = 20;

export interface LocuriPublice {
  capacitate: number;
  /** Toate locurile luate pe cursă: bilete vii + rezervările comenzilor deschise (sub 30 min). */
  ocupate: number[];
  /** Partea din `ocupate` care e doar rezervare temporară (se poate elibera). */
  rezervate: number[];
  /** Când expiră cea mai apropiată rezervare (ISO) — formularul reîncarcă harta atunci; null = nicio rezervare. */
  expira_la: string | null;
}

/**
 * Harta locurilor pentru formularul de pe site (ION-239): locurile ocupate pe cursă, din bilete_locuri_ocupate
 * (biletele valid/urcat cu loc + rezervările comenzilor «noua»/«eroare_creare» mai tinere de 30 min).
 */
export async function locuriOcupate(tripDate: string, crmRouteId: number, goingNorth: boolean): Promise<LocuriPublice> {
  const { data, error } = await getSupabase().rpc('bilete_locuri_ocupate', { p_trip_date: tripDate, p_crm_route_id: crmRouteId, p_going_north: goingNorth });
  if (error) throw new BazaIndisponibilaError(error.message);
  const randuri = (data || []) as Array<{ loc: number; fel: 'bilet' | 'rezervare'; expira_la: string | null }>;
  const bilete = new Set(randuri.filter((r) => r.fel === 'bilet').map((r) => Number(r.loc)));
  const rezervate = new Set(randuri.filter((r) => r.fel === 'rezervare' && !bilete.has(Number(r.loc))).map((r) => Number(r.loc)));
  const expirari = randuri.filter((r) => r.fel === 'rezervare' && r.expira_la).map((r) => new Date(r.expira_la as string).getTime()).filter(Number.isFinite);
  return {
    capacitate: CAPACITATE_AUTOBUZ,
    ocupate: [...new Set([...bilete, ...rezervate])].sort((a, b) => a - b),
    rezervate: [...rezervate].sort((a, b) => a - b),
    expira_la: expirari.length ? new Date(Math.min(...expirari)).toISOString() : null,
  };
}

export interface ConfigPublica {
  activ: boolean;
  inchidere_tur_min: number;
  inchidere_retur_min: number;
  /** Rutele cu cel puțin o direcție deschisă. */
  rute: Array<{ id: number; tur: boolean; retur: boolean }>;
  /**
   * ION-264: localitățile vânzării (urcare SAU coborâre în listă); null = toate. Plafoanele pe localitate nu se
   * publică — le verifică doar panoul, la comandă.
   */
  localitati: string[] | null;
  /** Capătul celălalt al perechii (Ion, 09.10: ["Chișinău"]); null = fără restricție (urcare SAU coborâre). */
  destinatii: string[] | null;
  /** Prima zi de cursă care se vinde online (09.10: «2026-10-12»); null = orice zi. */
  curse_de_la: string | null;
  /** 546: prima zi de cursă pe localitate, normalizată (Ion 10.10: Bălți de pe 13.10): {"balti":"2026-10-13"}. */
  localitati_de_la: Record<string, string>;
  /** 546: promoțiile Bălți ⇄ Chișinău (retur și student). */
  promo: { activ: boolean; pct: number; retur_zile: number; retur_min: number };
}

export async function configPublica(): Promise<ConfigPublica> {
  const [cfg, promo, { data: rute }] = await Promise.all([
    citesteConfigBilete(),
    citestePromoConfig(),
    getSupabase().from('crm_routes').select('id, bilete_online_tur, bilete_online_retur').eq('active', true)
      .or('bilete_online_tur.eq.true,bilete_online_retur.eq.true'),
  ]);
  return {
    // Plafoanele stricate închid vânzarea publică în panou → site-ul nu arată butonul deloc.
    activ: cfg.activ && cfg.plafoaneLocalitati !== null,
    inchidere_tur_min: cfg.inchidereTurMin,
    inchidere_retur_min: cfg.inchidereReturMin,
    rute: (rute || []).map((r: { id: number; bilete_online_tur: boolean; bilete_online_retur: boolean }) => ({ id: r.id, tur: Boolean(r.bilete_online_tur), retur: Boolean(r.bilete_online_retur) })),
    localitati: localitatiPentruPublic(cfg.localitati),
    destinatii: localitatiPentruPublic(cfg.destinatii),
    curse_de_la: cfg.curseDeLa,
    localitati_de_la: Object.fromEntries(promo.localitatiDeLa),
    promo: { activ: promo.activ, pct: promo.pct, retur_zile: promo.returZile, retur_min: promo.returMin },
  };
}

/**
 * Echipajul de pe bilet (migr. 538), sau null: doar comenzile plătite, până la plecare + 6 h. Baza căzută → null
 * (biletul se arată oricum; rândul echipajului lipsește).
 */
export async function echipajPentruComenzi<T extends ComandaRand>(comenzi: T[], nowMs = Date.now()): Promise<Map<string, EchipajBilet>> {
  const out = new Map<string, EchipajBilet>();
  const vii = comenzi.filter((c) => (c.status === 'platita' || c.status === 'platita_fara_bilet') && Date.parse(c.departure_at) + 6 * 3_600_000 > nowMs);
  if (!vii.length) return out;
  try {
    const e = await echipajeZile(getSupabase(), vii.map((c) => c.trip_date));
    for (const c of vii) {
      const x = e(c);
      if (x) out.set(c.id, echipajPentruBilet(x, c.departure_at, nowMs));
    }
  } catch (err) {
    console.warn('[bilete] echipaj indisponibil:', err instanceof Error ? err.message : err);
  }
  return out;
}
