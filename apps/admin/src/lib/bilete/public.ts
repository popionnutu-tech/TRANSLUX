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
  status: BileteComanda['status'];
  trip_date: string;
  from_name: string;
  to_name: string;
  departure_at: string;
  seats: number;
  price_per_seat: number;
  total: number;
  passenger_name: string;
  lang: 'ro' | 'ru';
  paid_at: string | null;
  cancelled_at: string | null;
  ruta: { id: number; nume_ro: string; nume_ru: string } | null;
  bilete: BiletPublic[];
}

const COD_RE = /^[0-9a-f]{32}$/i;

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
  const { data: c } = await db.from('bilete_comenzi').select('cod, status, trip_date, from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, lang, paid_at, cancelled_at, crm_route_id, going_north, id').eq('cod', cod).maybeSingle();
  if (!c) return null;
  const comanda = c as BileteComanda;
  const [{ data: bilete }, { data: ruta }] = await Promise.all([
    db.from('bilete').select('nr, cod_qr, status, urcat_at').eq('comanda_id', comanda.id).order('nr'),
    db.from('crm_routes').select('id, dest_from_ro, dest_from_ru, dest_to_ro, dest_to_ru').eq('id', comanda.crm_route_id).maybeSingle(),
  ]);
  const bileteCuQr = await Promise.all(((bilete || []) as Omit<BiletPublic, 'qr_svg'>[]).map(async (b) => ({
    ...b,
    qr_svg: await QRCode.toString(b.cod_qr, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }),
  })));
  return {
    cod: comanda.cod,
    status: comanda.status,
    trip_date: comanda.trip_date,
    from_name: comanda.from_name,
    to_name: comanda.to_name,
    departure_at: comanda.departure_at,
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
