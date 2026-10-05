// Neconformitățile zilei pe rutele interurbane (Mejgorod, ION-246). Ion, 05.10.2026:
// «șoferii mejgorod trebuie obligatoriu să iasă din Briceni, Edineț și Bălți de la opririle
// principale nu mai târziu de grafic. Și toți șoferii tur retur trec prin Sîngerei. Un mesaj
// zilnic neconformități să apară la Mejgorod în chat.» Și, întrebat de toleranță: «după grafic
// nu e o problemă, până la grafic este» — neconformitate e plecarea ÎNAINTE de ora din grafic,
// doar pe tur (spre Chișinău), unde oamenii urcă la gară.
//
// Sursa: route_stop_passes (migr. 393), scrisă noaptea de lde-geo-worker/stop-times.mjs. La gări
// passed_at e plecarea (ultimul punct la ≤150 m de peron), offset_min = minute față de grafic.
// Logica e pură; citirea și trimiterea stau în /api/cron/mejgorod-neconformitati.

import { escapeHtml } from '../telegram-notify';

export const GARI_PLECARE = ['Briceni', 'Edineț', 'Bălți'] as const;
export const SINGEREI = 'Sîngerei';
/** Trecerea la peste atât de oprirea de pe linia rutei nu e «prin Sîngerei». */
export const SINGEREI_MAX_M = 300;

export interface Trecere {
  crm_route_id: number;
  going_north: boolean;
  stop_name: string;
  scheduled: string;
  passed_at: string;
  offset_min: number;
  distance_m: number;
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
  | { tip: 'singerei'; ruta: number; retur: boolean; driver_id: string | null; vehicle_id: string | null };

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
        if (r && r.offset_min < 0) {
          lista.push({ tip: 'devreme', ruta: c.ruta, retur: false, gara: g, grafic: r.scheduled, plecat: r.passed_at, minute: r.offset_min, driver_id: c.driver_id, vehicle_id: c.vehicle_id });
        }
      }
    }
    const s = rows.find((x) => x.stop_name === SINGEREI);
    if (!s || s.distance_m > SINGEREI_MAX_M) lista.push({ tip: 'singerei', ruta: c.ruta, retur: c.retur, driver_id: c.driver_id, vehicle_id: c.vehicle_id });
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
  return [n.sofer(driver) ?? 'șofer necunoscut', n.masina(vehicle) ?? 'mașină necunoscută'].map(escapeHtml).join(' · ');
}

/** Mesajul HTML pentru grupa Mejgorod. `ziua` = «duminică, 04.10.2026». */
export function textMesaj(ziua: string, r: { lista: Neconformitate[]; faraGps: Cursa[] }, n: Nume): string {
  const devreme = r.lista.filter((x) => x.tip === 'devreme');
  const sing = r.lista.filter((x) => x.tip === 'singerei');
  const out: string[] = [`<b>Neconformități ${escapeHtml(ziua)}</b>`];
  if (!r.lista.length) out.push('✅ Fără neconformități.');
  if (devreme.length) {
    out.push('', `<b>⏱ Plecat înainte de grafic (Briceni, Edineț, Bălți) — ${devreme.length}</b>`);
    for (const x of devreme) {
      if (x.tip !== 'devreme') continue;
      out.push(`Ruta ${x.ruta} · ${cine(n, x.driver_id, x.vehicle_id)} — ${escapeHtml(x.gara)}: grafic ${escapeHtml(x.grafic)}, plecat ${n.ora(x.plecat)} (${x.minute} min)`);
    }
  }
  if (sing.length) {
    out.push('', `<b>🚫 Nu a trecut prin Sîngerei — ${sing.length}</b>`);
    for (const x of sing) out.push(`Ruta ${x.ruta} ${x.retur ? 'retur' : 'tur'} · ${cine(n, x.driver_id, x.vehicle_id)}`);
  }
  if (r.faraGps.length) {
    out.push('', `<i>Neverificate (fără GPS sau cursa pe altă oră): ${r.faraGps.map((c) => `${c.ruta} ${c.retur ? 'retur' : 'tur'}`).join(', ')}</i>`);
  }
  return out.join('\n');
}
