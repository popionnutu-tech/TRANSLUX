import { describe, it, expect } from 'vitest';
import { resolveLocality, closestNames } from './voice-locality';
import { LOCALITIES as L } from './voice-locality.fixture';

const r = (s: string) => resolveLocality(s, L);
const sugg = (s: string, a: 'ro' | 'ru') => closestNames(s, L, a).map((c) => c.ro);

describe('resolveLocality — fiecare nume se găsește pe sine', () => {
  it('toate cele 91 de nume rusești și românești', () => {
    const gresite = L.flatMap((x) => [x.name_ru, x.name_ro]
      .map((n) => ({ n, got: r(n), want: x.name_ro }))
      .filter((c) => c.got !== c.want));
    expect(gresite).toEqual([]);
  });

  it('Lipcani ≠ Rîșcani, Pașcani ≠ Rîșcani — vecinii periculoși rămân separați', () => {
    expect(r('Липканы')).toBe('Lipcani');
    expect(r('Рышканы')).toBe('Rîșcani');
    expect(r('Пашканы')).toBe('Pașcani');
    expect(r('Тырново')).toBe('Tîrnova');
    expect(r('Бырново')).toBe('Bîrnova');
  });
});

describe('resolveLocality — numele ratate în apelurile din 29.09–04.10 (ION-224)', () => {
  it('«Оргеев» — numele rusesc uzual al Orheiului — și ce aude ASR-ul din el', () => {
    expect(r('Оргеев')).toBe('Orhei');
    expect(r('Оргеева')).toBe('Orhei');
    expect(r('Ордеев')).toBe('Orhei'); // conv …957r2m, 04.10 12:50
  });

  it('prepoziția lipită de nume: «Вокница» = «в Окница» (04.10 12:50)', () => {
    expect(r('Вокница')).toBe('Ocnița');
    expect(r('Сокница')).toBe('Ocnița');
    expect(r('Изединец')).toBe('Edineț');
  });

  it('«Единцы» — plural rusesc — e Edineț', () => {
    expect(r('Единцы')).toBe('Edineț');
    expect(r('Единец')).toBe('Edineț');
  });

  it('«Кричан» (o literă) → Briceni', () => {
    expect(r('Кричан')).toBe('Briceni');
  });

  it('unde nu e sigur, nu ghicește, dar propune', () => {
    // «Бречень» = Briceni auzit în rusă; «Ильинец»/«Biedeneț» = Edineț. Distanța e prea
    // mare pentru alegere automată — agentul trebuie să ÎNTREBE, cu varianta corectă în listă.
    expect(sugg('Бречень', 'ru')).toContain('Briceni');
    expect(sugg('Ильинец', 'ru')).toContain('Edineț');
    expect(sugg('Biedeneț', 'ro')).toContain('Edineț');
  });
});

describe('resolveLocality — ce nu e în rețea rămâne necunoscut', () => {
  it('orașe reale din afara rețelei nu se lipesc de un sat al nostru', () => {
    for (const n of ['Кагул', 'Комрат', 'Бендеры', 'Унгены', 'Дрокия', 'Флорешты', 'Сороки', 'Cahul', 'Leova', 'Drochia', 'Chetrosu', 'Ungheni', 'Фаргеева']) {
      expect([n, r(n)]).toEqual([n, null]);
    }
  });

  it('intrări goale sau fără litere', () => {
    expect(r('')).toBeNull();
    expect(r('123')).toBeNull();
  });
});
