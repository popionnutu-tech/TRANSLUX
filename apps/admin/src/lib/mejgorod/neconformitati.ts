// Neconformitățile zilei pe rutele interurbane (Mejgorod, ION-246). Ion, 05.10.2026:
// «șoferii mejgorod trebuie obligatoriu să iasă din Briceni, Edineț și Bălți de la opririle
// principale nu mai târziu de grafic. Și toți șoferii tur retur trec prin Sîngerei. Un mesaj
// zilnic neconformități să apară la Mejgorod în chat.» Și, întrebat de toleranță: «după grafic
// nu e o problemă, până la grafic este» — neconformitate e plecarea ÎNAINTE de ora din grafic,
// doar pe tur (spre Chișinău), unde oamenii urcă la gară.
//
// Regula Sîngerei (Ion, 07.10): mașina trece prin CENTRUL Sîngerei, nu pe centură — cu o excepție:
// «dacă șoferii care merg pe interurban la tur sau retur au oprire la Intersecția Vrănești — oprirea pe
// centura Sîngerei — să nu se considere că el a violat regula de trecere prin Sîngerei». Deci, pe fiecare
// sens: centru_m ≤ SINGEREI_MAX_M SAU oprire ≥ VRANESTI_MIN_S la Intersecția Vrănești (vranesti_s,
// migr. 527). Fără niciuna = abatere.
//
// Excepția rutei 14 (Ion, 08.10): «ruta 10:00 plecare din Chișinău să meargă pe centură la Bălți, nu prin
// Sîngerei», «fără abateri, dar doar de la Chișinău spre Bălți» — returul rutei 14 (Chișinău 10:10 → Criva)
// nu se judecă la Sîngerei; turul ei (Criva → Chișinău) trece prin Sîngerei ca toate.
//
// Lipcani obligatoriu (Ion, 09.10): «rutele 6:55 până la 13:30 obligatoriu pleacă până la Lipcani zilnic»,
// «personal am văzut cum șoferii refuză clienții la Lipcani la aceste ore» — returul (din Chișinău) al rutelor
// de mai jos trebuie să treacă prin Lipcani. stop-times.mjs scrie rândul Lipcani doar când urma trece la
// ≤ ~370 m de oprire, deci o cursă cu GPS fără rândul Lipcani s-a întors mai devreme (de regulă din Briceni).
//
// Sursa: route_stop_passes (migr. 393), scrisă noaptea de lde-geo-worker/stop-times.mjs. La gări
// passed_at e plecarea (ultimul punct la ≤150 m de peron), offset_min = minute față de grafic.
// Logica e pură; citirea și trimiterea stau în /api/cron/mejgorod-neconformitati.

import { escapeHtml } from '../telegram-notify';

export const GARI_PLECARE = ['Briceni', 'Edineț', 'Bălți'] as const;
export const SINGEREI = 'Sîngerei';
/** Trecerea la peste atât de oprirea REALĂ din centru nu e «prin Sîngerei» (Ion, 07.10: «prin centru, nu pe centură»). */
export const SINGEREI_MAX_M = 300;
/** Oprirea (s, sub 8 km/h) la Intersecția Vrănești, pe centura Sîngerei, care ține loc de centru (Ion, 07.10). */
export const VRANESTI_MIN_S = 10;
/** Rutele al căror RETUR (din Chișinău spre nord) merge pe centura Bălți, nu prin Sîngerei (Ion, 08.10). */
export const RETUR_PE_CENTURA: ReadonlySet<number> = new Set([14]);
/** Returul acestor rute (plecare din Chișinău 06:55–13:30 după grafic, cu Lipcani pe traseu) merge obligatoriu
 *  până la Lipcani (Ion, 09.10). Ordinea = ora plecării: 12 06:55, 11 07:30, 13 08:00, 10 08:40, 15 09:40,
 *  14 10:10, 16 10:40 (real ~10:30), 1 11:20, 20 12:30, 18 13:00, 22 13:30. Otaci, Ocnița, Corjeuți nu trec pe acolo. */
export const RETUR_PANA_LA_LIPCANI: ReadonlySet<number> = new Set([12, 11, 13, 10, 15, 14, 16, 1, 20, 18, 22]);
export const LIPCANI = 'Lipcani';
/** Ion, 07.10: «plecat înainte de grafic doar cu 5 min» — 1–4 minute mai devreme nu se raportează. */
export const PLECARE_DEVREME_MIN = 5;
/** Plecarea din gară se judecă doar când urma a trecut pe lângă peron (stop-times.mjs: plecarea = ultimul punct
 *  la ≤150 m). Mai departe, passed_at e doar punctul cel mai apropiat prin oraș, nu plecarea: 08.10 cursa 1 «03:00»
 *  la 685 m de gara Briceni și cursa 19 «08:19» la 998 m de gara Edineț — 11 din 21 de «devreme» în 10 zile. */
export const GARA_MAX_M = 150;

export interface Trecere {
  crm_route_id: number;
  going_north: boolean;
  stop_name: string;
  scheduled: string;
  passed_at: string;
  offset_min: number;
  distance_m: number;
  /** Distanța urmei brute de oprirea REALĂ (migr. 526); doar la Sîngerei, altfel null. */
  centru_m?: number | null;
  /** Cea mai lungă oprire (s) la Intersecția Vrănești (migr. 527); doar la Sîngerei, altfel null. */
  vranesti_s?: number | null;
  vehicle_id: string | null;
}

export interface Atribuire {
  crm_route_id: number | null;
  retur_route_id: number | null;
  driver_id: string | null;
  driver_id_retur: string | null;
  vehicle_id: string | null;
  vehicle_id_retur: string | null;
}

export interface Cursa {
  ruta: number;
  /** true = retur (din Chișinău spre nord) */
  retur: boolean;
  driver_id: string | null;
  vehicle_id: string | null;
}

export type Neconformitate =
  | { tip: 'devreme'; ruta: number; retur: false; gara: string; grafic: string; plecat: string; minute: number; driver_id: string | null; vehicle_id: string | null }
  | { tip: 'singerei'; ruta: number; retur: boolean; driver_id: string | null; vehicle_id: string | null }
  | { tip: 'lipcani'; ruta: number; retur: true; driver_id: string | null; vehicle_id: string | null };

/**
 * Cursele zilei cu șoferul și mașina pe fiecare sens — aceeași regulă ca assignmentMaps din
 * stop-times.mjs (deci aceeași mașină a cărei urmă a dat route_stop_passes): turul = rândul rutei;
 * returul = rândul care îl ia prin retur_route_id, altfel rândul rutei fără retur încrucișat.
 */
export function curseleZilei(asg: Atribuire[]): Cursa[] {
  const tur = new Map<number, Cursa>();
  const retur = new Map<number, Cursa>();
  for (const a of asg) {
    if (a.crm_route_id == null || tur.has(a.crm_route_id) || !a.vehicle_id) continue;
    tur.set(a.crm_route_id, { ruta: a.crm_route_id, retur: false, driver_id: a.driver_id, vehicle_id: a.vehicle_id });
  }
  const pune = (ruta: number, a: Atribuire) =>
    retur.set(ruta, { ruta, retur: true, driver_id: a.driver_id_retur ?? a.driver_id, vehicle_id: a.vehicle_id_retur ?? a.vehicle_id });
  for (const a of asg) if (a.retur_route_id != null) pune(a.retur_route_id, a);
  for (const a of asg) if (a.crm_route_id != null && a.retur_route_id == null && !retur.has(a.crm_route_id)) pune(a.crm_route_id, a);
  return [...tur.values(), ...retur.values()];
}

const cheie = (ruta: number, retur: boolean) => `${ruta}:${retur ? 'R' : 'T'}`;

/**
 * Neconformitățile + cursele din grafic fără nicio trecere GPS (nu se judecă — nu știm ce a făcut
 * mașina, dar nu le ascundem). O cursă cu GPS fără rândul Sîngerei (sau trecută la peste
 * SINGEREI_MAX_M) n-a trecut prin Sîngerei.
 */
export function gasesteNeconformitati(treceri: Trecere[], curse: Cursa[]): { lista: Neconformitate[]; faraGps: Cursa[] } {
  const pe = new Map<string, Trecere[]>();
  for (const t of treceri) {
    const k = cheie(t.crm_route_id, t.going_north);
    pe.set(k, [...(pe.get(k) ?? []), t]);
  }
  const lista: Neconformitate[] = [];
  const faraGps: Cursa[] = [];
  for (const c of curse) {
    const rows = pe.get(cheie(c.ruta, c.retur)) ?? [];
    if (!rows.length) { faraGps.push(c); continue; }
    if (!c.retur) {
      for (const g of GARI_PLECARE) {
        const r = rows.find((x) => x.stop_name === g);
        if (r && r.distance_m <= GARA_MAX_M && r.offset_min <= -PLECARE_DEVREME_MIN) {
          lista.push({ tip: 'devreme', ruta: c.ruta, retur: false, gara: g, grafic: r.scheduled, plecat: r.passed_at, minute: r.offset_min, driver_id: c.driver_id, vehicle_id: c.vehicle_id });
        }
      }
    }
    if (c.retur && RETUR_PANA_LA_LIPCANI.has(c.ruta) && !rows.some((x) => x.stop_name === LIPCANI)) {
      lista.push({ tip: 'lipcani', ruta: c.ruta, retur: true, driver_id: c.driver_id, vehicle_id: c.vehicle_id });
    }
    if (c.retur && RETUR_PE_CENTURA.has(c.ruta)) continue;
    const s = rows.find((x) => x.stop_name === SINGEREI);
    // Pe oprirea reală din centru (centru_m), nu pe cea mutată pe linia rutei: linia trece pe centură, deci
    // distance_m ieșea 10–30 m pentru orice autobuz de pe centură (~950 m de centru). Rândurile vechi, fără
    // centru_m, rămân judecate ca înainte.
    // Excepția: oprirea la Intersecția Vrănești, pe centură, la tur sau retur, ține loc de centru.
    const prinCentru = s != null && (s.centru_m ?? s.distance_m) <= SINGEREI_MAX_M;
    const oprireVranesti = s != null && (s.vranesti_s ?? 0) >= VRANESTI_MIN_S;
    if (!prinCentru && !oprireVranesti) lista.push({ tip: 'singerei', ruta: c.ruta, retur: c.retur, driver_id: c.driver_id, vehicle_id: c.vehicle_id });
  }
  lista.sort((a, b) => a.ruta - b.ruta || Number(a.retur) - Number(b.retur));
  faraGps.sort((a, b) => a.ruta - b.ruta || Number(a.retur) - Number(b.retur));
  return { lista, faraGps };
}

export interface Nume {
  sofer: (id: string | null) => string | null;
  masina: (id: string | null) => string | null;
  /** ISO → «HH:MM» ora Chișinăului */
  ora: (iso: string) => string;
}

function cine(n: Nume, driver: string | null, vehicle: string | null): string {
  return [n.sofer(driver) ?? 'водитель неизвестен', n.masina(vehicle) ?? 'машина неизвестна'].map(escapeHtml).join(' · ');
}

const GARA_RU: Record<string, string> = { Briceni: 'Бричаны', 'Edineț': 'Единец', 'Bălți': 'Бельцы' };
const ZILE_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** «2026-10-06» → «06.10.2026, вторник» */
export function ziuaRu(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}, ${ZILE_RU[dow]}`;
}

/** Ion, 07.10: «mesajul zilnic lasă, doar jos adaugă că șoferii care au fost plini vor fi scoși din analitică».
 * Plinul se judecă după numărarea de pe camere (counting_entries), în analiza săptămânală pentru Ion (singerei-plin.ts). */
export const NOTA_PLIN_RU = 'Рейсы, на которых микроавтобус был заполнен, будут исключены из анализа (проверка по подсчёту пассажиров).';

/** Ion, 09.10: «șoferul care nu va respecta graficul nu va fi permis să meargă pe rută» — sub lista Lipcani. */
export const AVERTISMENT_LIPCANI_RU = '⚠️ Водитель, который не соблюдает график, не будет допущен к рейсу.';

/**
 * Mesajul HTML pentru grupa Mejgorod, în rusă (Ion, 07.10: «data sus, raportul în rusă»), cu data
 * pe primul rând. `ziua` = ziuaRu(...). Cursele fără GPS nu se mai listează (Ion, 07.10:
 * «neverificat fără GPS nu trebuie»); ele rămân doar în răspunsul JSON (faraGps).
 */
export function textMesaj(ziua: string, r: { lista: Neconformitate[]; faraGps: Cursa[] }, n: Nume): string {
  const devreme = r.lista.filter((x) => x.tip === 'devreme');
  const sing = r.lista.filter((x) => x.tip === 'singerei');
  const lip = r.lista.filter((x) => x.tip === 'lipcani');
  const out: string[] = [`📅 <b>${escapeHtml(ziua)}</b>`, '<b>Нарушения за день</b>'];
  if (!r.lista.length) out.push('', '✅ Нарушений нет.');
  if (devreme.length) {
    out.push('', `<b>⏱ Выехал раньше графика на ${PLECARE_DEVREME_MIN}+ мин (Бричаны, Единец, Бельцы) — ${devreme.length}</b>`);
    for (const x of devreme) {
      if (x.tip !== 'devreme') continue;
      out.push(`Рейс ${x.ruta} · ${cine(n, x.driver_id, x.vehicle_id)} — ${escapeHtml(GARA_RU[x.gara] ?? x.gara)}: по графику ${escapeHtml(x.grafic)}, выехал ${n.ora(x.plecat)} (${x.minute} мин)`);
    }
  }
  if (sing.length) {
    out.push('', `<b>🚫 Не заехал в центр Сынджерей и не остановился на перекрёстке Врэнешть — ${sing.length}</b>`);
    for (const x of sing) out.push(`Рейс ${x.ruta} ${x.retur ? 'из Кишинёва' : 'в Кишинёв'} · ${cine(n, x.driver_id, x.vehicle_id)}`);
  }
  if (lip.length) {
    out.push('', `<b>📍 Не доехал до Липкан (рейсы из Кишинёва 06:55–13:30 обязательно до Липкан) — ${lip.length}</b>`);
    for (const x of lip) out.push(`Рейс ${x.ruta} из Кишинёва · ${cine(n, x.driver_id, x.vehicle_id)}`);
    out.push(`<b>${AVERTISMENT_LIPCANI_RU}</b>`);
  }
  out.push('', `<i>${NOTA_PLIN_RU}</i>`);
  return out.join('\n');
}
