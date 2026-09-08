import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.js';
import {
  MAX_PINGS_PER_REQUEST,
  formatHHMM,
  formatMinutes,
  formatPresenceLine,
  isInZone,
  lateStart,
  localToUtcMs,
  parsePresenceBody,
  presencePeriods,
  presenceWindow,
  selectNewPings,
  windowBounds,
} from './presence.js';

const TZ = 'Europe/Chisinau';
const DATE = '2026-09-08'; // vara: UTC+3
const at = (hhmm: string) => `${DATE}T${hhmm}:00+03:00`;
const ms = (hhmm: string) => Date.parse(at(hhmm));
const trips = (...times: string[]) => times.map((t) => ({ departure_time: `${t}:00` }));
const CHISINAU = { lat: 47.023611, lon: 28.86275, radiusM: 150 };

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return 'no error';
};

describe('presenceWindow', () => {
  it('prima cursă − 30 min, ultima + 30 min (Chișinău 06:55…20:00 → 06:25–20:30)', () => {
    expect(presenceWindow(trips('06:55', '12:30', '20:00'))).toEqual({ from: '06:25', to: '20:30' });
  });
  it('Bălți 05:20…20:20 → 04:50–20:50; ordinea curselor nu contează', () => {
    expect(presenceWindow(trips('20:20', '05:20', '13:00'))).toEqual({ from: '04:50', to: '20:50' });
  });
  it('fără curse → null; nu iese din zi', () => {
    expect(presenceWindow([])).toBeNull();
    expect(presenceWindow(trips('00:10', '23:50'))).toEqual({ from: '00:00', to: '23:59' });
  });
});

describe('ora locală ↔ UTC', () => {
  it('Chișinău vara e UTC+3, iarna UTC+2', () => {
    expect(localToUtcMs('2026-09-08', '06:25', TZ)).toBe(Date.parse('2026-09-08T03:25:00Z'));
    expect(localToUtcMs('2026-01-15', '06:25', TZ)).toBe(Date.parse('2026-01-15T04:25:00Z'));
  });
  it('formatHHMM întoarce ora locală', () => {
    expect(formatHHMM(Date.parse('2026-09-08T09:40:00Z'), TZ)).toBe('12:40');
    expect(formatHHMM(Date.parse('2026-01-15T04:25:00Z'), TZ)).toBe('06:25');
  });
  it('windowBounds e dus-întors cu formatHHMM', () => {
    const b = windowBounds(DATE, { from: '06:25', to: '20:30' }, TZ);
    expect(formatHHMM(b.fromMs, TZ)).toBe('06:25');
    expect(formatHHMM(b.toMs, TZ)).toBe('20:30');
    expect(b.toMs - b.fromMs).toBe((14 * 60 + 5) * 60_000);
  });
});

describe('presencePeriods', () => {
  const bounds = windowBounds(DATE, { from: '06:25', to: '20:30' }, TZ);
  const every2min = (from: string, to: string, inZone: boolean) => {
    const out: Array<{ at: string; in_zone: boolean }> = [];
    for (let t = ms(from); t <= ms(to); t += 2 * 60_000) out.push({ at: new Date(t).toISOString(), in_zone: inZone });
    return out;
  };

  it('fără ping-uri → o perioadă FARA_SEMNAL cât fereastra', () => {
    const periods = presencePeriods([], bounds, ms('21:00'), TZ);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ kind: 'FARA_SEMNAL', from: '06:25', to: '20:30', minutes: 14 * 60 + 5 });
  });

  it('12:40–13:05 în afara razei, restul în zonă → exact o LIPSA de 25 min', () => {
    const pings = [
      ...every2min('06:26', '12:38', true),
      ...every2min('12:40', '13:04', false),
      { at: at('13:05'), in_zone: false },
      ...every2min('13:06', '20:30', true),
    ];
    const periods = presencePeriods(pings, bounds, ms('20:30'), TZ);
    expect(periods).toEqual([expect.objectContaining({ kind: 'LIPSA', from: '12:40', to: '13:05', minutes: 25 })]);
  });

  it('o singură citire în afara razei între două în zonă → nimic', () => {
    const pings = [...every2min('06:26', '20:30', true)];
    pings[100] = { ...pings[100], in_zone: false };
    expect(presencePeriods(pings, bounds, ms('20:30'), TZ)).toEqual([]);
  });

  it('pauză ≥ 10 min între ping-uri → FARA_SEMNAL; sub 10 min → nimic', () => {
    const pings = [...every2min('06:26', '17:10', true), ...every2min('17:30', '20:30', true)];
    expect(presencePeriods(pings, bounds, ms('20:30'), TZ)).toEqual([
      expect.objectContaining({ kind: 'FARA_SEMNAL', from: '17:10', to: '17:30', minutes: 20 }),
    ]);
    const shortGap = [...every2min('06:26', '17:10', true), ...every2min('17:18', '20:30', true)];
    expect(presencePeriods(shortGap, bounds, ms('20:30'), TZ)).toEqual([]);
  });

  it('de la ultimul ping până la now (înainte de sfârșitul ferestrei) → FARA_SEMNAL', () => {
    const pings = every2min('06:26', '15:00', true);
    expect(presencePeriods(pings, bounds, ms('15:30'), TZ)).toEqual([
      expect.objectContaining({ kind: 'FARA_SEMNAL', from: '15:00', to: '15:30', minutes: 30 }),
    ]);
  });

  it('urmărire pornită târziu → FARA_SEMNAL de la începutul ferestrei; lateStart dă ora', () => {
    const pings = every2min('07:00', '20:30', true);
    expect(presencePeriods(pings, bounds, ms('20:30'), TZ)).toEqual([
      expect.objectContaining({ kind: 'FARA_SEMNAL', from: '06:25', to: '07:00', minutes: 35 }),
    ]);
    expect(lateStart(pings, bounds, TZ)).toBe('07:00');
    expect(lateStart(every2min('06:30', '20:30', true), bounds, TZ)).toBeNull();
    expect(lateStart([], bounds, TZ)).toBeNull();
  });

  it('pauza fără semnal rupe seria de lipsă; ping-urile din afara ferestrei se ignoră', () => {
    const pings = [
      { at: at('05:00'), in_zone: false }, // înainte de fereastră
      ...every2min('06:26', '12:00', true),
      ...every2min('12:02', '12:10', false),
      ...every2min('12:30', '12:40', false),
      ...every2min('12:42', '20:30', true),
    ];
    const periods = presencePeriods(pings, bounds, ms('20:30'), TZ).map((p) => `${p.kind} ${p.from}-${p.to}`);
    expect(periods).toEqual(['LIPSA 12:02-12:10', 'FARA_SEMNAL 12:10-12:30', 'LIPSA 12:30-12:40']);
  });

  it('înainte de începutul ferestrei nu raportează nimic', () => {
    expect(presencePeriods([], bounds, ms('06:00'), TZ)).toEqual([]);
  });
});

describe('linia din digest', () => {
  it('perioade + urmărire pornită târziu', () => {
    const bounds = windowBounds(DATE, { from: '06:25', to: '20:30' }, TZ);
    const periods = presencePeriods(
      [
        { at: at('12:40'), in_zone: false },
        { at: at('12:48'), in_zone: false },
        { at: at('12:56'), in_zone: false },
        { at: at('13:05'), in_zone: false },
        { at: at('13:07'), in_zone: true },
      ],
      bounds,
      ms('13:08'),
      TZ,
    );
    expect(formatPresenceLine('@vitalie', 'Chișinău', periods, '12:40')).toBe(
      '@vitalie (Chișinău): fără semnal 06:25–12:40 (6 h 15 min) · lipsă 12:40–13:05 (25 min) · urmărire pornită abia la 12:40',
    );
  });
  it('fără perioade → toată tura în zonă', () => {
    expect(formatPresenceLine('@andrei', 'Bălți', [], null)).toBe('@andrei (Bălți): toată tura în zonă');
  });
  it('formatMinutes', () => {
    expect(formatMinutes(25)).toBe('25 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(845)).toBe('14 h 05 min');
  });
});

describe('parsePresenceBody', () => {
  it('lot valid → ping-uri normalizate, accuracyM rotunjit sau null', () => {
    const out = parsePresenceBody({ pings: [{ at: at('12:40'), lat: 47.02, lon: 28.86, accuracyM: 12.6 }, { at: at('12:42'), lat: 47.02, lon: 28.86 }] });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ atMs: ms('12:40'), at: new Date(ms('12:40')).toISOString(), lat: 47.02, lon: 28.86, accuracyM: 13 });
    expect(out[1].accuracyM).toBeNull();
  });
  it('erori 400: lipsă pings, prea multe, at invalid, lat/lon lipsă sau în afara intervalului, accuracyM negativ', () => {
    expect(codeOf(() => parsePresenceBody({}))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parsePresenceBody({ pings: 'x' }))).toBe('400 BAD_REQUEST');
    const many = Array.from({ length: MAX_PINGS_PER_REQUEST + 1 }, () => ({ at: at('12:40'), lat: 1, lon: 1 }));
    expect(codeOf(() => parsePresenceBody({ pings: many }))).toBe('400 TOO_MANY_PINGS');
    expect(codeOf(() => parsePresenceBody({ pings: [{ at: 'ieri', lat: 1, lon: 1 }] }))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parsePresenceBody({ pings: [{ at: at('12:40'), lat: 1 }] }))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parsePresenceBody({ pings: [{ at: at('12:40'), lat: 91, lon: 1 }] }))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parsePresenceBody({ pings: [{ at: at('12:40'), lat: 1, lon: 1, accuracyM: -1 }] }))).toBe('400 BAD_REQUEST');
    expect(codeOf(() => parsePresenceBody({ pings: [] }))).toBe('no error');
  });
});

describe('selectNewPings / isInZone', () => {
  const bounds = windowBounds(DATE, { from: '06:25', to: '20:30' }, TZ);
  const ping = (hhmm: string, lat = CHISINAU.lat, lon = CHISINAU.lon) => ({ atMs: ms(hhmm), at: new Date(ms(hhmm)).toISOString(), lat, lon, accuracyM: null });

  it('la stație → în zonă; la ~300 m → nu', () => {
    expect(isInZone(CHISINAU.lat, CHISINAU.lon, CHISINAU)).toBe(true);
    expect(isInZone(CHISINAU.lat + 0.001, CHISINAU.lon, CHISINAU)).toBe(true); // ~110 m
    expect(isInZone(CHISINAU.lat + 0.003, CHISINAU.lon, CHISINAU)).toBe(false); // ~330 m
  });

  it('ignoră ping-urile din afara ferestrei și duplicatele (în lot sau deja în DB), calculează in_zone', () => {
    const rows = selectNewPings(
      [ping('05:00'), ping('12:40'), ping('12:40'), ping('12:42'), ping('12:44', CHISINAU.lat + 0.003), ping('21:00')],
      bounds,
      [ms('12:42')],
      'user-1',
      'CHISINAU',
    );
    expect(rows.map((r) => [r.at, r.in_zone])).toEqual([
      [new Date(ms('12:40')).toISOString(), true],
      [new Date(ms('12:44')).toISOString(), false],
    ]);
    expect(rows[0]).toMatchObject({ user_id: 'user-1', point: 'CHISINAU', accuracy_m: null });
  });
});
