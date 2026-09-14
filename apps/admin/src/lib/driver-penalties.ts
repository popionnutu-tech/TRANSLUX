/**
 * Penalități pentru aspectul șoferilor (Ion, 14.09.2026, mesajul pentru grupă):
 *   «Без униформы — 30 лей/день · Неопрятный вид — 20 лей/день · Вместе — 50 лей/день ·
 *    7 таких дней за месяц → в следующем месяце штраф +50%, и так нарастает каждый месяц.
 *    До конца сентября штрафы только показываем; с 1 октября суммы начинают удерживаться.»
 *
 * Sursa e poza șoferului din aplicația de peron (driver_appearance_checks):
 * verdictul modelului e final (Ion, 08.09) — aici nu decide nimeni nimic, doar se
 * adună. Uniforma = tricoul vișiniu TRANSLUX sau cămașa albă/bleu (config bot,
 * Ion 14.09: «Майки вишневые Translux тоже считается»).
 *
 * Reguli de numărare, fixate aici ca să nu se discute în grupă:
 *  - o ZI, nu o poză: dacă șoferul are mai multe poze în aceeași zi (s-a schimbat
 *    și operatorul l-a pozat din nou), contează ULTIMA poză acceptată — omul care
 *    s-a corectat în aceeași zi nu plătește; cel pozat de trei ori tot fără cămașă, da;
 *  - poza cu verdict lipsă (EROARE la model) nu contează nici într-un fel;
 *  - «7 zile» = zile cu cel puțin o abatere (fără uniformă SAU neîngrijit) în luna
 *    calendaristică;
 *  - multiplicatorul lunii = 1 + 0,5 × numărul de luni CONSECUTIVE dinaintea ei,
 *    fiecare cu ≥ 7 zile de abateri; seria se rupe la prima lună sub 7. Lunile
 *    dinainte de APPLY_FROM (septembrie = doar arătăm) nu intră în serie.
 *
 * Fișier pur (fără DB, fără Telegram) — totul e testabil.
 */

export const PENALTY = {
  NO_UNIFORM_LEI: 30,
  UNGROOMED_LEI: 20,
  /** zile cu abateri într-o lună de la care luna următoare se scumpește */
  ESCALATION_DAYS: 7,
  ESCALATION_STEP: 0.5,
  /** de la această dată sumele se rețin; înainte doar se arată */
  APPLY_FROM: '2026-10-01',
} as const;

export interface AppearanceCheckRow {
  driver_id: string | null;
  /** YYYY-MM-DD */
  check_date: string;
  uniform_ok: boolean | null;
  groomed_ok: boolean | null;
  created_at: string;
}

export interface DriverRef {
  id: string;
  full_name: string;
}

export interface DayVerdict {
  date: string;
  uniformOk: boolean;
  groomedOk: boolean;
}

/** Ultima poză acceptată din zi, per șofer; pozele fără verdict nu intră. */
export function dayVerdicts(checks: AppearanceCheckRow[]): Map<string, DayVerdict[]> {
  const last = new Map<string, Map<string, { at: string; v: DayVerdict }>>();
  for (const c of checks) {
    if (!c.driver_id || c.uniform_ok === null || c.groomed_ok === null) continue;
    let byDay = last.get(c.driver_id);
    if (!byDay) { byDay = new Map(); last.set(c.driver_id, byDay); }
    const prev = byDay.get(c.check_date);
    if (!prev || c.created_at > prev.at) {
      byDay.set(c.check_date, { at: c.created_at, v: { date: c.check_date, uniformOk: c.uniform_ok, groomedOk: c.groomed_ok } });
    }
  }
  const out = new Map<string, DayVerdict[]>();
  for (const [driverId, byDay] of last) {
    out.set(driverId, [...byDay.values()].map(x => x.v).sort((a, b) => a.date.localeCompare(b.date)));
  }
  return out;
}

export function isViolation(v: DayVerdict): boolean {
  return !v.uniformOk || !v.groomedOk;
}

/** Suma de bază a zilei, fără multiplicator: 0 / 20 / 30 / 50. */
export function dayBaseLei(v: DayVerdict): number {
  return (v.uniformOk ? 0 : PENALTY.NO_UNIFORM_LEI) + (v.groomedOk ? 0 : PENALTY.UNGROOMED_LEI);
}

/* ── Calendar (date ISO, fără fus orar: check_date e o zi calendaristică) ── */

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Luni a săptămânii în care cade ziua. */
export function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = duminică
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

/** Săptămâna precedentă (luni) față de ziua dată — ce trimitem luni dimineața/seara. */
export function previousWeekStart(todayIso: string): string {
  return addDays(weekStartOf(todayIso), -7);
}

export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(monthStartIso: string, n: number): string {
  const [y, m] = monthStartIso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
}

/** «07.09» / «07.09.2026» */
export function ddmm(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-');
  return withYear ? `${d}.${m}.${y}` : `${d}.${m}`;
}

/* ── Multiplicatorul lunii ── */

/** Zile cu abateri, pe luni calendaristice: «2026-10-01» → 9. */
export function violationDaysByMonth(verdicts: DayVerdict[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of verdicts) {
    if (!isViolation(v)) continue;
    const k = monthStartOf(v.date);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/**
 * Multiplicatorul pentru luna `monthStart`: 1 + 0,5 × luni consecutive dinainte,
 * fiecare cu ≥ 7 zile de abateri și nu mai devreme de APPLY_FROM.
 */
export function monthMultiplier(monthStart: string, verdicts: DayVerdict[], applyFrom: string = PENALTY.APPLY_FROM): number {
  const byMonth = violationDaysByMonth(verdicts);
  const firstMonth = monthStartOf(applyFrom);
  let streak = 0;
  let m = addMonths(monthStart, -1);
  while (m >= firstMonth && (byMonth.get(m) ?? 0) >= PENALTY.ESCALATION_DAYS) {
    streak += 1;
    m = addMonths(m, -1);
  }
  return 1 + streak * PENALTY.ESCALATION_STEP;
}

/* ── Raportul săptămânal ── */

export interface DriverWeekRow {
  driverId: string;
  name: string;
  /** zile cu poză acceptată în săptămână */
  photoDays: number;
  noUniformDays: number;
  ungroomedDays: number;
  /** lei pe săptămână, cu multiplicatorul lunii fiecărei zile */
  weekLei: number;
  /** lei de la începutul lunii în care se termină săptămâna, până la sfârșitul ei */
  monthLei: number;
  /** multiplicatorul lunii în care se termină săptămâna */
  multiplier: number;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  /** luna căreia îi aparține coloana «de la începutul lunii» */
  monthStart: string;
  /** true = sumele se rețin (săptămâna se termină la/după APPLY_FROM) */
  applied: boolean;
  rows: DriverWeekRow[];
  totals: { weekLei: number; driversWithViolations: number; driversWithPhotos: number };
}

function roundLei(x: number): number {
  return Math.round(x);
}

/**
 * Raportul pe săptămâna `weekStart` (luni). `checks` trebuie să acopere de la
 * min(APPLY_FROM, începutul lunii) până la duminica săptămânii — pentru
 * multiplicator și pentru coloana lunii. Fiecare șofer din `drivers` primește un
 * rând (Ion: «fiecare șofer să se găsească acolo»), și cel fără nicio poză.
 */
export function weeklyReport(drivers: DriverRef[], checks: AppearanceCheckRow[], weekStart: string): WeeklyReport {
  const weekEnd = addDays(weekStart, 6);
  const monthStart = monthStartOf(weekEnd);
  const applied = weekEnd >= PENALTY.APPLY_FROM;
  const verdicts = dayVerdicts(checks);

  const rows: DriverWeekRow[] = drivers.map(d => {
    const all = verdicts.get(d.id) ?? [];
    const week = all.filter(v => v.date >= weekStart && v.date <= weekEnd);
    const multiplier = monthMultiplier(monthStart, all);
    const leiOf = (v: DayVerdict) => dayBaseLei(v) * monthMultiplier(monthStartOf(v.date), all);
    const weekLei = roundLei(week.reduce((s, v) => s + leiOf(v), 0));
    const monthLei = roundLei(
      all.filter(v => v.date >= monthStart && v.date <= weekEnd).reduce((s, v) => s + leiOf(v), 0),
    );
    return {
      driverId: d.id,
      name: d.full_name,
      photoDays: week.length,
      noUniformDays: week.filter(v => !v.uniformOk).length,
      ungroomedDays: week.filter(v => !v.groomedOk).length,
      weekLei,
      monthLei,
      multiplier,
    };
  });

  // Cei cu sume mari sus, la egalitate mai multe zile, apoi alfabetic; cei fără
  // poze la coadă — tot pe imagine, dar nu în fața celor verificați.
  rows.sort((a, b) => {
    if ((a.photoDays === 0) !== (b.photoDays === 0)) return a.photoDays === 0 ? 1 : -1;
    if (b.weekLei !== a.weekLei) return b.weekLei - a.weekLei;
    if (b.photoDays !== a.photoDays) return b.photoDays - a.photoDays;
    return a.name.localeCompare(b.name, 'ro');
  });

  return {
    weekStart,
    weekEnd,
    monthStart,
    applied,
    rows,
    totals: {
      weekLei: rows.reduce((s, r) => s + r.weekLei, 0),
      driversWithViolations: rows.filter(r => r.weekLei > 0).length,
      driversWithPhotos: rows.filter(r => r.photoDays > 0).length,
    },
  };
}

/* ── Textul de sub imagine (grupa șoferilor scrie în rusă — Ion, 11.09) ── */

export function penaltyCaption(r: WeeklyReport): string {
  const period = `${ddmm(r.weekStart)}–${ddmm(r.weekEnd, true)}`;
  const head = `<b>Внешний вид водителей · ${period}</b>`;
  const stats = `${r.totals.driversWithPhotos} водителей с фото · ${r.totals.driversWithViolations} с нарушениями · ${r.totals.weekLei} лей за неделю`;
  const status = r.applied
    ? `Суммы за эту неделю учитываются при расчёте зарплаты (с ${ddmm(PENALTY.APPLY_FROM, true)}).`
    : `⚠️ На этой неделе штрафы ещё <b>не применяются</b> — считаться начнут с ${ddmm(PENALTY.APPLY_FROM, true)}.`;
  return `${head}\n${stats}\n\n${status}`;
}
