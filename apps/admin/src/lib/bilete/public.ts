import 'server-only';
import QRCode from 'qrcode';
import type { Bilet, BileteComanda } from '@translux/db';
import { getSupabase } from '@/lib/supabase';
import { sincronizeazaStare } from '@/lib/maib/sincronizare';
import { citesteConfigBilete } from './comenzi';

// Ce vede pasagerul (pagina biletului de pe site, prin API cu codul din link ca secret) și ce vede site-ul
// (configurația vânzării). Fără alți pasageri, fără ip_hash, fără telegram_id.

export interface BiletPublic {
  nr: number;
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
  bilete: BiletPublic[];
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
  const { data: c, error: cErr } = await db.from('bilete_comenzi').select('cod, status, trip_date, from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, lang, paid_at, cancelled_at, crm_route_id, going_north, to_stop_order, id, punct_urcare_nume_ro, punct_urcare_nume_ru, punct_urcare_lat, punct_urcare_lon').eq('cod', cod).maybeSingle();
  if (cErr) throw new BazaIndisponibilaError(cErr.message); // «nu există» ≠ «baza nu răspunde» (Codex X11)
  if (!c) return null;
  const comanda = c as BileteComanda;
  const [rB, rR, rS] = await Promise.all([
    db.from('bilete').select('nr, cod_qr, status, urcat_at').eq('comanda_id', comanda.id).order('nr'),
    db.from('crm_routes').select('id, dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru').eq('id', comanda.crm_route_id).maybeSingle(),
    // ION-236: ora sosirii din grafic la oprirea de coborâre, pe sensul comenzii (biletul arată plecare → sosire)
    db.from('crm_stop_fares').select('hour_from_chisinau, hour_from_nord').eq('crm_route_id', comanda.crm_route_id).eq('stop_order', (comanda as { to_stop_order?: number }).to_stop_order ?? -1).maybeSingle(),
  ]);
  if (rB.error) throw new BazaIndisponibilaError(rB.error.message);
  if (rR.error) throw new BazaIndisponibilaError(rR.error.message);
  const oraSosire = rS.data ? (comanda.going_north ? rS.data.hour_from_chisinau : rS.data.hour_from_nord) : null;
  const sosire = typeof oraSosire === 'string' && /^\d{1,2}:\d{2}$/.test(oraSosire) ? oraSosire.padStart(5, '0') : null;
  const bilete = rB.data;
  const ruta = rR.data;
  const bileteCuQr = await Promise.all(((bilete || []) as Omit<BiletPublic, 'qr_svg'>[]).map(async (b) => ({
    ...b,
    qr_svg: await QRCode.toString(b.cod_qr, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }),
  })));
  return {
    cod: comanda.cod,
    numar: comanda.id.slice(0, 8).toUpperCase(),
    status: comanda.status,
    trip_date: comanda.trip_date,
    from_name: comanda.from_name,
    to_name: comanda.to_name,
    departure_at: comanda.departure_at,
    sosire,
    seats: comanda.seats,
    price_per_seat: Number(comanda.price_per_seat),
    total: Number(comanda.total),
    passenger_name: comanda.passenger_name,
    lang: comanda.lang,
    paid_at: comanda.paid_at,
    cancelled_at: comanda.cancelled_at,
    ruta: ruta ? {
      id: ruta.id,
      nume_ro: comanda.going_north ? ruta.dest_to_ro : ruta.dest_from_ro,
      nume_ru: comanda.going_north ? ruta.dest_to_ru : ruta.dest_from_ru,
    } : null,
    punct_urcare: comanda.punct_urcare_nume_ro && comanda.punct_urcare_lat != null && comanda.punct_urcare_lon != null ? {
      nume_ro: comanda.punct_urcare_nume_ro,
      nume_ru: comanda.punct_urcare_nume_ru || comanda.punct_urcare_nume_ro,
      lat: Number(comanda.punct_urcare_lat),
      lon: Number(comanda.punct_urcare_lon),
    } : null,
    bilete: bileteCuQr,
  };
}

export interface ConfigPublica {
  activ: boolean;
  inchidere_tur_min: number;
  inchidere_retur_min: number;
  /** Rutele cu cel puțin o direcție deschisă. */
  rute: Array<{ id: number; tur: boolean; retur: boolean }>;
}

export async function configPublica(): Promise<ConfigPublica> {
  const [cfg, { data: rute }] = await Promise.all([
    citesteConfigBilete(),
    getSupabase().from('crm_routes').select('id, bilete_online_tur, bilete_online_retur').eq('active', true)
      .or('bilete_online_tur.eq.true,bilete_online_retur.eq.true'),
  ]);
  return {
    activ: cfg.activ,
    inchidere_tur_min: cfg.inchidereTurMin,
    inchidere_retur_min: cfg.inchidereReturMin,
    rute: (rute || []).map((r: { id: number; bilete_online_tur: boolean; bilete_online_retur: boolean }) => ({ id: r.id, tur: Boolean(r.bilete_online_tur), retur: Boolean(r.bilete_online_retur) })),
  };
}
