/**
 * «Raport pe rute»: încasările factice ale fiecărei rute pe o perioadă, după data foii.
 *
 * Ion, 10.10.2026: «am nevoie raport încasări factic per perioadă (Data foiei de parcurs) per
 * rută». Sursa e `get_grafic_report` — aceeași ca «Pe rute (sumar)», deci aceleași reguli de
 * foaie, corecții, ștergeri și anti-dublare; aici doar se adună rândurile rută×zi pe rută.
 * Planul și deciziile: docs/plans/2026-10-10-raport-incasari-pe-rute.md.
 *
 * Funcții pure, fără 'use server': se testează direct (raport-rute.test.ts).
 */
import type { Anomaly, AnomalyCategory, GraficRouteRow, OrphanManual } from './incasareActions';
import { incTotal, incTotalBreakdown } from './incasare-total';

export const MAX_ZILE_RAPORT = 92;

/** Sub atâta din curse cu bani, ruta primește steag (Ion 10.10: «să iasă în evidență»). */
export const PRAG_STEAG = 0.5;
/** Steagul cere un minim de curse: o rută cu 1–2 curse în perioadă nu spune nimic. */
export const MIN_CURSE_STEAG = 3;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isoValid(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Zile între două date ISO, capetele incluse. Prin UTC: fără deriva orei de vară. */
export function zileInclusiv(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export function valideazaPerioada(from: string, to: string): string | null {
  if (!isoValid(from) || !isoValid(to)) return 'Dată invalidă';
  if (from > to) return '«De la» e după «până la»';
  const n = zileInclusiv(from, to);
  if (n > MAX_ZILE_RAPORT) {
    return `Perioada are ${n} zile; maximum ${MAX_ZILE_RAPORT} într-o încărcare — alege mai scurtă`;
  }
  return null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Luna dată de `iso` (YYYY-MM-DD): prima și ultima zi. */
export function lunaDin(iso: string): { from: string; to: string } {
  const [y, m] = iso.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from: first, to: addDaysIso(next, -1) };
}

/**
 * Perioada cu care se deschide fila: de la 1 ale lunii până ieri (ziua de azi abia începe și
 * foile ei nu sunt încă predate). Pe 1 ale lunii «până ieri» ar fi înaintea lui «de la», deci
 * se dă luna trecută întreagă — exact ziua în care se face raportul lunii încheiate.
 */
export function perioadaImplicita(azi: string): { from: string; to: string } {
  const ieri = addDaysIso(azi, -1);
  if (azi.endsWith('-01')) return lunaDin(ieri);
  return { from: `${azi.slice(0, 7)}-01`, to: ieri };
}

export function lunaTrecuta(azi: string): { from: string; to: string } {
  return lunaDin(addDaysIso(`${azi.slice(0, 7)}-01`, -1));
}

// ─── Agregarea ───

export interface Rubrici {
  numerar: number;
  diagrama: number;
  ligotniki0: number;
  ligotnikiGara: number;
  dt: number;
  cheltuieli: number;
  /** Total foaie = suma celor șase (ca INC în «Pe rute (sumar)»). */
  total: number;
}

export interface RutaAgregata extends Rubrici {
  crm_route_id: number;
  route_name: string;
  time_nord: string | null;
  route_type: 'interurban' | 'suburban';
  /** Curse neanulate. */
  curse: number;
  cuIncasare: number;
  faraIncasare: number;
  anulate: number;
  /** Σ numărare pe toate cursele. */
  numarare: number;
  /** Σ numărare doar pe cursele fără încasare: cât s-a numărat și n-a ajuns în casă. */
  numaratFaraIncasare: number;
  /** Σ (Total − Numărare) doar pe cursele care au și bani, și numărare. */
  diferenta: number;
  /** Total / Cu încasare; null când nicio cursă n-are bani. */
  mediePeCursa: number | null;
  /** Cu încasare sub PRAG_STEAG din curse (cu cel puțin MIN_CURSE_STEAG curse). */
  steag: boolean;
}

export interface Subtotal extends Rubrici {
  curse: number;
  cuIncasare: number;
  faraIncasare: number;
  numarare: number;
  numaratFaraIncasare: number;
  diferenta: number;
  rute: number;
}

export type CategorieFaraRuta =
  AnomalyCategory | 'manual_fara_ruta' | 'manual_fara_identificare' | 'manual_cursa_gresita';

export interface BanFaraRuta {
  categorie: CategorieFaraRuta;
  foaie_nr: string | null;
  /** Ziua după care banii intră în perioadă: ziua plății (terminal) sau, la manual, ziua cursei
   *  (altfel data foii, altfel ziua introducerii). */
  ziua: string;
  ziua_foaie: string | null;
  driver_name: string | null;
  route_name: string | null;
  /** La `manual_cursa_gresita`: cursa căreia îi aparține de fapt foaia. */
  cursa_corecta: string | null;
  total: number;
}

export interface DeVerificat {
  motiv: 'dublura_terminal' | 'cursa_cu_terminal';
  foaie_nr: string | null;
  ziua: string;
  data_foaie: string | null;
  driver_name: string | null;
  route_name: string | null;
  terminal_pe_foaie: number | null;
  numarare_cursa: number | null;
  total: number;
}

export interface RaportPeRute {
  from: string;
  to: string;
  rute: RutaAgregata[];
  subtotaluri: { interurban: Subtotal; suburban: Subtotal };
  totalRute: Subtotal;
  faraRuta: { randuri: BanFaraRuta[]; total: number };
  deVerificat: { randuri: DeVerificat[]; total: number };
  /** Total pe rute + Bani fără rută. «De verificat» rămâne în afară (poate fi dublură). */
  totalGeneral: number;
  /** Total general + De verificat: cifra dacă toate rândurile «de verificat» sunt bani reali.
   *  Ambele se arată, pentru că din date nu se poate ști (10.10: ambele cazuri vii erau reale). */
  totalGeneralCuDeVerificat: number;
}

function rubriciGoale(): Rubrici {
  return { numerar: 0, diagrama: 0, ligotniki0: 0, ligotnikiGara: 0, dt: 0, cheltuieli: 0, total: 0 };
}

function subtotalGol(): Subtotal {
  return {
    ...rubriciGoale(), curse: 0, cuIncasare: 0, faraIncasare: 0,
    numarare: 0, numaratFaraIncasare: 0, diferenta: 0, rute: 0,
  };
}

// Banii vin cu două zecimale; adunați pe sute de rânduri, float-ul lasă resturi de 1e-10.
const r2 = (v: number) => Math.round(v * 100) / 100;

function adunaInSubtotal(s: Subtotal, r: RutaAgregata) {
  s.numerar += r.numerar; s.diagrama += r.diagrama; s.ligotniki0 += r.ligotniki0;
  s.ligotnikiGara += r.ligotnikiGara; s.dt += r.dt; s.cheltuieli += r.cheltuieli; s.total += r.total;
  s.curse += r.curse; s.cuIncasare += r.cuIncasare; s.faraIncasare += r.faraIncasare;
  s.numarare += r.numarare; s.numaratFaraIncasare += r.numaratFaraIncasare;
  s.diferenta += r.diferenta; s.rute += 1;
}

function rotunjesteSubtotal(s: Subtotal): Subtotal {
  return {
    ...s,
    numerar: r2(s.numerar), diagrama: r2(s.diagrama), ligotniki0: r2(s.ligotniki0),
    ligotnikiGara: r2(s.ligotnikiGara), dt: r2(s.dt), cheltuieli: r2(s.cheltuieli),
    total: r2(s.total), numarare: r2(s.numarare), numaratFaraIncasare: r2(s.numaratFaraIncasare),
    diferenta: r2(s.diferenta),
  };
}

/**
 * Adună rândurile rută×zi ale RPC-ului pe rută.
 *
 * - Banii se adună pe TOATE rândurile rutei, inclusiv cele anulate (ca «Pe rute (sumar)»);
 *   «Curse» le numără doar pe cele neanulate.
 * - Cu/Fără încasare se judecă pe Total foaie, nu pe statutul RPC (acela e pe numerar +
 *   diagramă): așa Cu + Fără = Curse, mereu.
 * - `routeTypes` vine din `crm_routes.route_type`; o rută necunoscută trece la interurban.
 */
export function agregaPeRute(
  from: string,
  to: string,
  rows: GraficRouteRow[],
  routeTypes: Map<number, string>,
  orphanInc: Anomaly[],
  orphanManual: OrphanManual[],
): RaportPeRute {
  const byRoute = new Map<number, RutaAgregata>();

  for (const row of rows) {
    let a = byRoute.get(row.crm_route_id);
    if (!a) {
      a = {
        ...rubriciGoale(),
        crm_route_id: row.crm_route_id,
        route_name: row.route_name || `Ruta ${row.crm_route_id}`,
        time_nord: row.time_nord,
        route_type: routeTypes.get(row.crm_route_id) === 'suburban' ? 'suburban' : 'interurban',
        curse: 0, cuIncasare: 0, faraIncasare: 0, anulate: 0,
        numarare: 0, numaratFaraIncasare: 0, diferenta: 0,
        mediePeCursa: null, steag: false,
      };
      byRoute.set(row.crm_route_id, a);
    }
    const total = incTotal(row);
    const numarare = Number(row.numarare_lei || 0);

    a.numerar += Number(row.incasare_numerar || 0);
    a.diagrama += Number(row.incasare_diagrama || 0);
    a.ligotniki0 += Number(row.ligotniki0_suma || 0);
    a.ligotnikiGara += Number(row.ligotniki_vokzal_suma || 0);
    a.dt += Number(row.dt_suma || 0);
    a.cheltuieli += Number(row.dop_rashodi || 0);
    a.total += total;
    a.numarare += numarare;

    if (row.cancelled) { a.anulate += 1; continue; }
    a.curse += 1;
    if (total > 0) {
      a.cuIncasare += 1;
      if (numarare > 0) a.diferenta += total - numarare;
    } else {
      a.faraIncasare += 1;
      a.numaratFaraIncasare += numarare;
    }
  }

  const rute = [...byRoute.values()].map(a => ({
    ...a,
    numerar: r2(a.numerar), diagrama: r2(a.diagrama), ligotniki0: r2(a.ligotniki0),
    ligotnikiGara: r2(a.ligotnikiGara), dt: r2(a.dt), cheltuieli: r2(a.cheltuieli),
    total: r2(a.total), numarare: r2(a.numarare),
    numaratFaraIncasare: r2(a.numaratFaraIncasare), diferenta: r2(a.diferenta),
    mediePeCursa: a.cuIncasare > 0 ? r2(a.total / a.cuIncasare) : null,
    steag: a.curse >= MIN_CURSE_STEAG && a.cuIncasare < PRAG_STEAG * a.curse,
  }));

  // Ordinea implicită: interurban înaintea suburbanului, în grup după Total descrescător.
  rute.sort((x, y) => {
    if (x.route_type !== y.route_type) return x.route_type === 'interurban' ? -1 : 1;
    if (y.total !== x.total) return y.total - x.total;
    return x.crm_route_id - y.crm_route_id;
  });

  const inter = subtotalGol();
  const sub = subtotalGol();
  const tot = subtotalGol();
  for (const r of rute) {
    adunaInSubtotal(r.route_type === 'suburban' ? sub : inter, r);
    adunaInSubtotal(tot, r);
  }

  const faraRuta: BanFaraRuta[] = [];
  const deVerificat: DeVerificat[] = [];

  for (const o of orphanInc) {
    faraRuta.push({
      categorie: o.category,
      foaie_nr: o.receipt_nr,
      ziua: o.ziua,
      ziua_foaie: o.ziua_foaie ?? null,
      driver_name: null,
      route_name: null,
      cursa_corecta: null,
      total: r2(incTotalBreakdown(o.breakdown)),
    });
  }
  for (const m of orphanManual) {
    if (m.reason === 'dublura_terminal' || m.reason === 'cursa_cu_terminal') {
      deVerificat.push({
        motiv: m.reason,
        foaie_nr: m.foaie_nr,
        ziua: m.ziua,
        data_foaie: m.data_foaie,
        driver_name: m.driver_name,
        route_name: m.route_name,
        terminal_pe_foaie: m.terminal_pe_foaie_lei ?? null,
        numarare_cursa: m.numarare_cursa_lei ?? null,
        total: r2(Number(m.total_lei || 0)),
      });
    } else {
      faraRuta.push({
        categorie: m.reason === 'fara_identificare' ? 'manual_fara_identificare'
          : m.reason === 'cursa_gresita' ? 'manual_cursa_gresita' : 'manual_fara_ruta',
        foaie_nr: m.foaie_nr,
        ziua: m.ziua_apartenenta ?? m.data_foaie ?? m.ziua,
        ziua_foaie: m.data_foaie,
        driver_name: m.driver_name,
        route_name: m.route_name,
        cursa_corecta: m.foaie_cursa
          ? [m.foaie_cursa.ruta, m.foaie_cursa.sofer, m.foaie_cursa.ziua].filter(Boolean).join(' · ')
          : null,
        total: r2(Number(m.total_lei || 0)),
      });
    }
  }

  const totalFaraRuta = r2(faraRuta.reduce((s, b) => s + b.total, 0));
  const totalDeVerificat = r2(deVerificat.reduce((s, b) => s + b.total, 0));
  const totalRute = rotunjesteSubtotal(tot);

  return {
    from, to,
    rute,
    subtotaluri: { interurban: rotunjesteSubtotal(inter), suburban: rotunjesteSubtotal(sub) },
    totalRute,
    faraRuta: { randuri: faraRuta, total: totalFaraRuta },
    deVerificat: { randuri: deVerificat, total: totalDeVerificat },
    totalGeneral: r2(totalRute.total + totalFaraRuta),
    totalGeneralCuDeVerificat: r2(totalRute.total + totalFaraRuta + totalDeVerificat),
  };
}
