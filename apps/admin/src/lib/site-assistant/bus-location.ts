// «Unde e autobuzul meu» pe translux.md (ION-39). Regulile lui Ion, 23.09:
//   «doar la mașina care e pe cursă»
//   «doar rutele interurbane conform grafic și doar în orele de lucru ale rutei»
//   «fără viteză, ca punct în moment»
//
// Cursa vine din aceeași căutare ca pe site (searchTrips = rutele interurbane din
// crm_routes), mașina din graficul zilei (daily_assignments, prin searchTrips), punctul
// din bus_live_positions (migr. 391, scris de cronul de pe VPS). Orele cursei sunt ale
// cursei ÎNTREGI, de la primul la ultimul punct din crm_stop_fares — omul care așteaptă
// la Orhei vede autobuzul încă de la plecarea din Chișinău, dar nu și înainte.

import { getSupabase } from '@/lib/supabase';
import { searchTrips, type TripResult } from '@/lib/trips-search';
import { localitiesToRo, unknownLocalityResponse } from '@/lib/voice-locality';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { crewOf, type Crew } from './cards';
import { formatPhone } from './voice-to-text';

/** După sfârșitul din grafic cursa mai e «pe drum» atât: autobuzele întârzie. */
export const END_SLACK_MIN = 20;
/** Un punct mai vechi nu mai e «acum». */
export const MAX_AGE_MIN = 5;

const normPlate = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** «6:55» → 415. «0:00» și gol = oprire fără oră pe sensul ăsta. */
export function hhmmToMin(s: string | null | undefined): number | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v === 0 ? null : v;
}

export const minToHhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Fereastra cursei din orele opririlor, în ordinea în care le parcurge autobuzul.
 * Sensul spre nord (din Chișinău) merge de la stop_order mare la mic — vezi
 * searchTrips: goingNorth = from.stop_order > to.stop_order.
 */
export function tripWindow(
  stops: { stop_order: number; hour: string | null }[], goingNorth: boolean,
): { start: number; end: number } | null {
  const ordered = [...stops]
    .sort((a, b) => (goingNorth ? b.stop_order - a.stop_order : a.stop_order - b.stop_order))
    .map((s) => hhmmToMin(s.hour))
    .filter((m): m is number => m !== null);
  if (ordered.length < 2) return null;
  const start = ordered[0];
  let end = ordered[ordered.length - 1];
  if (end < start) end += 1440; // cursa trece de miezul nopții
  return { start, end };
}

export function nowMinChisinau(d = new Date()): number {
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return (h % 24) * 60 + m;
}

/** E cursa pe drum acum? Ține cont de cursele care trec de miezul nopții. */
export function isOnRoad(w: { start: number; end: number }, now: number): boolean {
  const end = w.end + END_SLACK_MIN;
  return (now >= w.start && now <= end) || (end >= 1440 && now + 1440 <= end);
}

async function windowsFor(trips: TripResult[]): Promise<Map<string, { start: number; end: number }>> {
  const ids = [...new Set(trips.map((t) => t.route_id).filter((x) => x != null))];
  const out = new Map<string, { start: number; end: number }>();
  if (ids.length === 0) return out;
  const { data, error } = await getSupabase()
    .from('crm_stop_fares')
    .select('crm_route_id, stop_order, hour_from_chisinau, hour_from_nord')
    .in('crm_route_id', ids);
  if (error || !data) return out;
  for (const t of trips) {
    if (t.route_id == null) continue;
    const key = `${t.route_id}:${t.going_north ? 'n' : 's'}`;
    if (out.has(key)) continue;
    const stops = data
      .filter((s) => String(s.crm_route_id) === String(t.route_id))
      .map((s) => ({ stop_order: s.stop_order as number, hour: (t.going_north ? s.hour_from_chisinau : s.hour_from_nord) as string | null }));
    const w = tripWindow(stops, !!t.going_north);
    if (w) out.set(key, w);
  }
  return out;
}

const winKey = (t: TripResult) => `${t.route_id}:${t.going_north ? 'n' : 's'}`;

type Resolved = { ok: true; fromRo: string; toRo: string } | { ok: false; result: Record<string, unknown> };

async function resolve(from: string, to: string): Promise<Resolved> {
  if (!from || !to) {
    return { ok: false, result: { need_more: true, result_ro: 'Întreabă clientul pe ce direcție merge: de unde și până unde.', result_ru: 'Спроси клиента направление: откуда и куда.' } };
  }
  const { values: [fromRo, toRo], unknown, suggestions } = await localitiesToRo([from, to]);
  if (unknown.length) return { ok: false, result: unknownLocalityResponse(unknown, suggestions) };
  return { ok: true, fromRo: fromRo as string, toRo: toRo as string };
}

export interface OnRoadTrip extends Crew { departure: string; minutes_ago: number }

/** Cursele de AZI de pe direcția asta care sunt acum pe drum, după grafic. */
export async function tripsOnRoad(from: string, to: string): Promise<{ result: Record<string, unknown>; trips: OnRoadTrip[]; fromRo?: string; toRo?: string }> {
  const r = await resolve(from, to);
  if (!r.ok) return { result: r.result, trips: [] };
  const trips = await searchTrips(r.fromRo, r.toRo, chisinauTodayIso(), { keepDeparted: true, skipLog: true });
  const wins = await windowsFor(trips);
  const now = nowMinChisinau();
  const on = trips
    .filter((t) => t.vehicle_plate && wins.has(winKey(t)) && isOnRoad(wins.get(winKey(t))!, now))
    .map((t) => {
      const dep = hhmmToMin(t.time) ?? now;
      // Negativ = autobuzul e deja pe drum, dar încă n-a ajuns în localitatea clientului.
      let ago = now - dep;
      if (ago > 720) ago -= 1440;
      if (ago < -720) ago += 1440;
      return { departure: t.time.padStart(5, '0'), minutes_ago: ago, ...crewOf(t) };
    })
    .sort((a, b) => a.departure.localeCompare(b.departure));
  if (on.length === 0) {
    return {
      trips: [], fromRo: r.fromRo, toRo: r.toRo,
      result: {
        count: 0,
        line_ro: `Acum nu e nicio cursă pe drum pe ${r.fromRo} → ${r.toRo}. Poziția autobuzului se vede doar cât cursa e pe drum, după grafic.`,
        line_ru: `Сейчас на направлении ${r.fromRo} → ${r.toRo} нет рейсов в пути. Где автобус, видно только пока рейс в пути, по графику.`,
      },
    };
  }
  return {
    trips: on, fromRo: r.fromRo, toRo: r.toRo,
    result: {
      count: on.length,
      departures: on.map((t) => t.departure),
      result_ro: on.length === 1
        ? 'O singură cursă e pe drum acum; chemă direct unde_e_autobuzul cu ora ei.'
        : 'Spune-i clientului câte curse sunt pe drum și roagă-l să aleagă a lui din lista afișată sub mesaj (nu le enumera tu).',
      result_ru: on.length === 1
        ? 'Сейчас в пути один рейс; сразу вызови unde_e_autobuzul с его временем.'
        : 'Скажи клиенту, сколько рейсов в пути, и попроси выбрать свой из списка под сообщением (не перечисляй сам).',
    },
  };
}

/** Frazele cu șoferul cursei, gata de redat — doar când graficul are om și număr. */
export function driverLines(c: Crew, hhmm: string): Record<string, string> {
  const phone = c.phone ? formatPhone(c.phone) : null;
  if (!phone) return { driver_line_ro: `Numărul șoferului cursei de ${hhmm} nu e în grafic.`, driver_line_ru: `Номера водителя рейса ${hhmm} нет в графике.` };
  const who = [c.driver, c.plate].filter(Boolean).join(', ');
  return {
    driver_line_ro: `Șoferul cursei de ${hhmm}${who ? ` (${who})` : ''}: ${phone}.`,
    driver_line_ru: `Водитель рейса ${hhmm}${who ? ` (${who})` : ''}: ${phone}.`,
  };
}

export interface BusPoint extends Crew { lat: number; lon: number; near: string | null; at: string; departure: string; from: string; to: string }

/** Punctul mașinii UNEI curse, numai dacă e pe drum acum după grafic. */
export async function busLocation(from: string, to: string, departure: string): Promise<{ result: Record<string, unknown>; point: BusPoint | null }> {
  const r = await resolve(from, to);
  if (!r.ok) return { result: r.result, point: null };
  const dep = hhmmToMin(departure);
  if (dep === null) {
    return { point: null, result: { need_more: true, result_ro: 'Întreabă clientul ora cursei lui (sau cheamă curse_pe_drum ca să aleagă din listă).', result_ru: 'Спроси время его рейса (или вызови curse_pe_drum, чтобы выбрал из списка).' } };
  }
  const hhmm = minToHhmm(dep);
  const trips = await searchTrips(r.fromRo, r.toRo, chisinauTodayIso(), { keepDeparted: true, skipLog: true });
  const trip = trips.find((t) => hhmmToMin(t.time) === dep);
  if (!trip) {
    return { point: null, result: { found: false, line_ro: `Azi nu există o cursă de ${hhmm} pe ${r.fromRo} → ${r.toRo}.`, line_ru: `Сегодня нет рейса в ${hhmm} по направлению ${r.fromRo} → ${r.toRo}.` } };
  }
  const wins = await windowsFor([trip]);
  const w = wins.get(winKey(trip));
  if (!w || !isOnRoad(w, nowMinChisinau())) {
    return {
      point: null,
      result: {
        off_hours: true,
        line_ro: `Cursa de ${hhmm} nu e pe drum acum. Poziția se vede doar în orele cursei, după grafic: ${w ? `${minToHhmm(w.start)}–${minToHhmm(w.end)}` : 'de la plecare până la sosire'}.`,
        line_ru: `Рейс в ${hhmm} сейчас не в пути. Позиция видна только в часы рейса по графику: ${w ? `${minToHhmm(w.start)}–${minToHhmm(w.end)}` : 'от отправления до прибытия'}.`,
      },
    };
  }
  const plate = normPlate(trip.vehicle_plate);
  const { data } = plate
    ? await getSupabase().from('bus_live_positions').select('lat, lon, at, near').eq('plate', plate).maybeSingle()
    : { data: null };
  const ageMin = data ? (Date.now() - Date.parse(data.at as string)) / 60_000 : Infinity;
  if (!data || ageMin > MAX_AGE_MIN) {
    return {
      point: null,
      result: {
        no_signal: true,
        line_ro: 'Nu am acum o poziție sigură de la autobuzul acestei curse. Încercați peste câteva minute.',
        line_ru: 'Сейчас нет надёжной позиции автобуза этого рейса. Попробуйте через несколько минут.',
      },
    };
  }
  const at = new Date(data.at as string).toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
  const point: BusPoint = { ...crewOf(trip), lat: data.lat as number, lon: data.lon as number, near: (data.near as string | null) ?? null, at, departure: hhmm, from: r.fromRo, to: r.toRo };
  return {
    point,
    result: {
      found: true,
      // Nimic despre viteză, direcție sau mașină: doar unde e, și de când e punctul.
      line_ro: point.near ? `Autobuzul cursei de ${hhmm} e acum lângă ${point.near} (poziția de la ${at}). Harta e sub mesaj.` : `Poziția autobuzului cursei de ${hhmm}, de la ${at}, e pe harta de sub mesaj.`,
      line_ru: point.near ? `Автобус рейса ${hhmm} сейчас возле ${point.near} (позиция на ${at}). Карта под сообщением.` : `Позиция автобуса рейса ${hhmm} на ${at} — на карте под сообщением.`,
      // Pentru întrebarea care vine aproape mereu după hartă: «numărul șoferului».
      // Captura lui Ion, 23.09: fără el în rezultat, modelul l-a trimis pe om la linia
      // +373 60 401 010 «ca să i se dea contactul» — deși numărul era chiar pe card.
      ...driverLines(point, hhmm),
    },
  };
}

/** Câte plecări arată butonul «Acum» (Ion, 24.09: «doar următoarele 2 rutiere care trec prin punctul tău»). */
export const NOW_SHOWN = 2;
/** Cu atât înainte de începutul cursei se arată deja mașina ei (la autogară sau venind spre ea). */
export const COMING_MIN = 60;

export interface NextTrip extends Crew {
  departure: string; minutes_until: number; on_road: boolean; route_id: number | null;
  /** Cursa începe în cel mult COMING_MIN: mașina se arată pe hartă, dar punctul ei NU intră în ora
   *  estimată și nici în «a trecut deja» — poate fi încă pe cursa de dinainte, pe sens invers. */
  coming: boolean;
  /** Sensul cursei pe linia din route_shapes (tur = stop_order crescător, spre Chișinău = !going_north). */
  going_north: boolean;
}

/**
 * Butonul «Acum» de pe prima pagină (ION-43): următoarele plecări de AZI din localitatea
 * omului spre destinația lui. `on_road` = autobuzul cursei e deja pe drum după grafic
 * (aceeași poartă ca punctul din chat), deci punctul lui poate fi arătat. O cursă deja
 * plecată după grafic din localitatea omului rămâne DOAR cât e pe drum (on_road): autobuzul
 * poate întârzia și să nu fi ajuns încă la om; cel care a trecut deja îl scoate /acum (`passed`).
 */
export async function nextTrips(from: string, to: string): Promise<{ result: Record<string, unknown>; trips: NextTrip[]; fromRo?: string; toRo?: string }> {
  const r = await resolve(from, to);
  if (!r.ok) return { result: r.result, trips: [] };
  const all = await searchTrips(r.fromRo, r.toRo, chisinauTodayIso(), { keepDeparted: true, skipLog: true });
  const wins = await windowsFor(all);
  const now = nowMinChisinau();
  const onRoad = (t: TripResult) => { const w = wins.get(winKey(t)); return !!(t.vehicle_plate && w && isOnRoad(w, now)); };
  // Ion, 24.09, 07:08: «nu apar rutierele» — la 07:10 cursa de 07:30 din Chișinău nu era încă
  // «pe drum», iar mașina stătea la autogară, nevăzută.
  const coming = (t: TripResult) => {
    const w = wins.get(winKey(t));
    return !!(t.vehicle_plate && w && !isOnRoad(w, now) && (w.start - now + 1440) % 1440 <= COMING_MIN);
  };
  // Cursele plecate după grafic, dar încă pe drum, intră TOATE (poate întârzie și n-au
  // ajuns la om); plafonul NOW_SHOWN se pune doar pe cele care vin. Altfel, dimineața,
  // cele 4 locuri le luau cursele de 05:10–06:50 deja trecute prin Bălți, /acum le scotea
  // ca trecute, iar omul vedea «nu mai vine nicio cursă» (Ion, 24.09, 06:45). Lista finală
  // o taie /acum, după ce scoate cursele trecute.
  const next = [
    ...all.filter((t) => t.isDeparted && onRoad(t)),
    ...all.filter((t) => !t.isDeparted).slice(0, NOW_SHOWN),
  ];
  const trips = next.map((t) => {
    const dep = hhmmToMin(t.time) ?? now;
    let until = dep - now;
    if (until < -720) until += 1440;
    return {
      departure: t.time.padStart(5, '0'),
      minutes_until: until,
      on_road: onRoad(t),
      coming: coming(t),
      going_north: !!t.going_north,
      // Legătura cu linia rutei din route_shapes (migr. 392) — harta «Acum» o desenează.
      route_id: t.route_id != null ? Number(t.route_id) : null,
      ...crewOf(t),
    };
  });
  if (trips.length === 0) {
    return {
      trips, fromRo: r.fromRo, toRo: r.toRo,
      result: {
        line_ro: `Azi nu mai sunt curse ${r.fromRo} → ${r.toRo}. Apăsați «Mai târziu» și alegeți altă zi.`,
        line_ru: `Сегодня больше нет рейсов ${r.fromRo} → ${r.toRo}. Нажмите «Позже» и выберите другой день.`,
      },
    };
  }
  return { trips, fromRo: r.fromRo, toRo: r.toRo, result: {} };
}
