import { describe, expect, it } from 'vitest';
import { calculeazaDepartureAt } from './bilete-reguli';
import { chisinauInstantIso, chisinauLocalLaMs, offsetChisinauMin } from './chisinau-ora';

const utc = (zi: string, ora: string, politica?: 'prima' | 'a_doua') => new Date(chisinauLocalLaMs(zi, ora, politica)).toISOString();

// N6 (dezbaterea Claude–Codex, 10.10.2026): rezultatele în UTC, scrise de mână din regula Moldovei —
// 25.10.2026 04:00 EEST → 03:00 EET la 01:00 UTC; 28.03.2027 03:00 EET → 04:00 EEST la 01:00 UTC.
describe('chisinauLocalLaMs — toamna 2026 (ora de iarnă)', () => {
  it.each([
    ['2026-10-24', '23:30', '2026-10-24T20:30:00.000Z'],
    ['2026-10-25', '00:05', '2026-10-24T21:05:00.000Z'], // varianta veche: 22:05Z (o oră mai târziu)
    ['2026-10-25', '01:30', '2026-10-24T22:30:00.000Z'],
    ['2026-10-25', '02:30', '2026-10-24T23:30:00.000Z'],
    ['2026-10-25', '03:00', '2026-10-25T00:00:00.000Z'], // ora dublă → prima apariție (EEST)
    ['2026-10-25', '03:30', '2026-10-25T00:30:00.000Z'], // ora dublă → prima apariție (EEST)
    ['2026-10-25', '04:00', '2026-10-25T02:00:00.000Z'],
    ['2026-10-26', '00:05', '2026-10-25T22:05:00.000Z'],
  ])('%s %s → %s', (zi, ora, asteptat) => {
    expect(utc(zi, ora)).toBe(asteptat);
  });

  it('ora dublă cu politica «a_doua» → ora de iarnă (EET)', () => {
    expect(utc('2026-10-25', '03:00', 'a_doua')).toBe('2026-10-25T01:00:00.000Z');
    expect(utc('2026-10-25', '03:30', 'a_doua')).toBe('2026-10-25T01:30:00.000Z');
    expect(utc('2026-10-25', '02:30', 'a_doua')).toBe('2026-10-24T23:30:00.000Z'); // neambiguă: politica nu contează
  });
});

describe('chisinauLocalLaMs — primăvara 2027 (ora de vară)', () => {
  it.each([
    ['2027-03-28', '02:30', '2027-03-28T00:30:00.000Z'], // există (EET)
    ['2027-03-28', '03:30', '2027-03-28T01:30:00.000Z'], // golul: mutată înainte cu o oră → 04:30 EEST
    ['2027-03-28', '04:00', '2027-03-28T01:00:00.000Z'],
    ['2027-03-28', '00:05', '2027-03-27T22:05:00.000Z'],
  ])('%s %s → %s', (zi, ora, asteptat) => {
    expect(utc(zi, ora)).toBe(asteptat);
  });
});

describe('chisinauInstantIso', () => {
  it('scrie offset-ul real al orei, nu al prânzului', () => {
    expect(chisinauInstantIso('2026-10-25', '00:05')).toBe('2026-10-25T00:05:00+03:00');
    expect(chisinauInstantIso('2026-10-25', '03:30')).toBe('2026-10-25T03:30:00+03:00');
    expect(chisinauInstantIso('2026-10-25', '03:30', 'a_doua')).toBe('2026-10-25T03:30:00+02:00');
    expect(chisinauInstantIso('2026-10-25', '04:00')).toBe('2026-10-25T04:00:00+02:00');
    expect(chisinauInstantIso('2026-10-14', '07:00')).toBe('2026-10-14T07:00:00+03:00');
    expect(chisinauInstantIso('2027-01-15', '07:00')).toBe('2027-01-15T07:00:00+02:00');
  });

  it('ora din golul de primăvară iese mutată (03:30 → 04:30 EEST)', () => {
    expect(chisinauInstantIso('2027-03-28', '03:30')).toBe('2027-03-28T04:30:00+03:00');
  });

  it('ora invalidă → miezul nopții, ca înainte', () => {
    expect(chisinauInstantIso('2026-10-14', '7:00')).toBe('2026-10-14T00:00:00+03:00');
    expect(chisinauInstantIso('2026-10-25', '')).toBe('2026-10-25T00:00:00+03:00');
  });

  it('fiecare oră a anului se întoarce în aceeași oră locală (în afară de golul de primăvară)', () => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    for (let d = Date.UTC(2026, 0, 1); d < Date.UTC(2028, 0, 1); d += 86_400_000) {
      const zi = new Date(d).toISOString().slice(0, 10);
      for (const ora of ['00:00', '00:05', '01:30', '02:59', '03:00', '03:59', '04:00', '12:00', '23:59']) {
        const ms = chisinauLocalLaMs(zi, ora);
        const inapoi = fmt.format(new Date(ms)).replace(', ', 'T');
        if (inapoi !== `${zi}T${ora}`) {
          // singura excepție permisă: golul de primăvară, mutat cu o oră
          expect(offsetChisinauMin(ms)).toBe(180);
          expect(offsetChisinauMin(ms - 3_600_000)).toBe(120);
        }
      }
    }
  });
});

describe('calculeazaDepartureAt în noaptea de 25.10.2026 (N6)', () => {
  it('ruta 8 pornită 24.10 la 20:00, Lipcani 00:05 → 25.10 00:05 EEST', () => {
    const iso = calculeazaDepartureAt('2026-10-24', '00:05', '20:00');
    expect(iso).toBe('2026-10-25T00:05:00+03:00');
    expect(new Date(iso).toISOString()).toBe('2026-10-24T21:05:00.000Z');
  });

  it('cursa din 25.10 la 05:45 e deja pe ora de iarnă', () => {
    expect(new Date(calculeazaDepartureAt('2026-10-25', '05:45', '05:45')).toISOString()).toBe('2026-10-25T03:45:00.000Z');
  });
});
