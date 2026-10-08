import QRCode from 'qrcode';
import type { BiletPublic, ComandaPublica } from './public';

// Asamblarea biletului așa cum îl vede pasagerul (ION-276, «Telegram ultrafast» P8): O SINGURĂ funcție, folosită și de
// pagina biletului (biletPublic, o comandă) și de lista clientului din mini app (pe lot) — ca cele două să nu ajungă să
// arate altceva la următoarea schimbare a biletului. Pură (fără bază), testată în bilet-asamblare.test.ts.

export interface ComandaRand {
  id: string; cod: string; status: ComandaPublica['status']; trip_date: string; from_name: string; to_name: string;
  departure_at: string; seats: number; price_per_seat: number | string; total: number | string; passenger_name: string;
  lang: 'ro' | 'ru'; paid_at: string | null; cancelled_at: string | null; crm_route_id: number; going_north: boolean;
  to_stop_order?: number | null;
  /** Comandă de probă (test_admin sau pagina de probă, migr. 532) → biletul poartă «BILET DE PROBĂ». */
  test?: boolean | null;
  punct_urcare_nume_ro?: string | null; punct_urcare_nume_ru?: string | null; punct_urcare_lat?: number | string | null; punct_urcare_lon?: number | string | null;
}
export interface BiletRand { nr: number; loc_nr?: number | null; cod_qr: string; status: BiletPublic['status']; urcat_at: string | null }
export interface RutaRand { id: number; dest_from_ro: string; dest_from_ru: string; dest_to_ro: string; dest_to_ru: string }
export interface OprireSosireRand { hour_from_chisinau: string | null; hour_from_nord: string | null }

/** Coloanele de citit din bilete_comenzi pentru asamblare (aceleași la o comandă și pe lot). */
export const COLOANE_COMANDA = 'cod, status, trip_date, from_name, to_name, departure_at, seats, price_per_seat, total, passenger_name, lang, paid_at, cancelled_at, crm_route_id, going_north, to_stop_order, id, punct_urcare_nume_ro, punct_urcare_nume_ru, punct_urcare_lat, punct_urcare_lon, test';
export const COLOANE_BILET = 'nr, loc_nr, cod_qr, status, urcat_at';

/** ION-236: ora sosirii din grafic la oprirea de coborâre, pe sensul comenzii; «7:05» → «07:05»; altfel null. */
export function oraSosire(c: Pick<ComandaRand, 'going_north'>, o: OprireSosireRand | null | undefined): string | null {
  const v = o ? (c.going_north ? o.hour_from_chisinau : o.hour_from_nord) : null;
  return typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : null;
}

export async function asambleazaComanda(c: ComandaRand, bilete: BiletRand[], ruta: RutaRand | null, oprireSosire: OprireSosireRand | null): Promise<ComandaPublica> {
  const ordonate = [...bilete].sort((a, b) => a.nr - b.nr);
  const bileteCuQr: BiletPublic[] = await Promise.all(ordonate.map(async (b) => ({
    nr: b.nr, loc_nr: b.loc_nr ?? null, cod_qr: b.cod_qr, status: b.status, urcat_at: b.urcat_at,
    qr_svg: await QRCode.toString(b.cod_qr, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }),
  })));
  return {
    cod: c.cod,
    numar: c.id.slice(0, 8).toUpperCase(),
    status: c.status,
    trip_date: c.trip_date,
    from_name: c.from_name,
    to_name: c.to_name,
    departure_at: c.departure_at,
    sosire: oraSosire(c, oprireSosire),
    seats: c.seats,
    price_per_seat: Number(c.price_per_seat),
    total: Number(c.total),
    passenger_name: c.passenger_name,
    lang: c.lang,
    paid_at: c.paid_at,
    cancelled_at: c.cancelled_at,
    ruta: ruta ? {
      id: ruta.id,
      nume_ro: c.going_north ? ruta.dest_to_ro : ruta.dest_from_ro,
      nume_ru: c.going_north ? ruta.dest_to_ru : ruta.dest_from_ru,
    } : null,
    punct_urcare: c.punct_urcare_nume_ro && c.punct_urcare_lat != null && c.punct_urcare_lon != null ? {
      nume_ro: c.punct_urcare_nume_ro,
      nume_ru: c.punct_urcare_nume_ru || c.punct_urcare_nume_ro,
      lat: Number(c.punct_urcare_lat),
      lon: Number(c.punct_urcare_lon),
    } : null,
    proba: c.test === true,
    bilete: bileteCuQr,
  };
}
