import { describe, it, expect } from 'vitest';
import { computeCanonKeywords } from './voice-canon';

const prot = (...w: string[]) => new Set(w.map((x) => x.toLowerCase()));

describe('computeCanonKeywords', () => {
  it('добавляет в свободные слоты без вытеснения', () => {
    const r = computeCanonKeywords(['A', 'B'], ['C'], prot('A'));
    expect(r.next).toEqual(['A', 'B', 'C']);
    expect(r.added).toEqual(['C']);
    expect(r.evicted).toEqual([]);
  });

  it('уже присутствующее (без учёта регистра) не добавляет повторно', () => {
    const r = computeCanonKeywords(['Бельцы'], ['бельцы', 'Орхей'], prot());
    expect(r.added).toEqual(['Орхей']);
    expect(r.next).toEqual(['Бельцы', 'Орхей']);
  });

  it('дедупит кандидатов между собой', () => {
    const r = computeCanonKeywords([], ['Ларга', 'ларга'], prot());
    expect(r.added).toEqual(['Ларга']);
  });

  it('при полном словаре вытесняет с хвоста, минуя защищённых', () => {
    const current = Array.from({ length: 50 }, (_, i) => `w${i}`);
    const r = computeCanonKeywords(current, ['Новое'], prot('w49', 'w48'));
    expect(r.next).toHaveLength(50);
    expect(r.evicted).toEqual(['w47']);
    expect(r.next).toContain('Новое');
    expect(r.next).toContain('w49');
    expect(r.next).toContain('w48');
  });

  it('кандидаты не вытесняют друг друга', () => {
    const current = Array.from({ length: 50 }, (_, i) => `w${i}`);
    const r = computeCanonKeywords(current, ['X', 'Y'], prot());
    expect(r.evicted).toEqual(['w49', 'w48']);
    expect(r.next).toContain('X');
    expect(r.next).toContain('Y');
    expect(r.next).toHaveLength(50);
  });

  it('всё защищено — кандидат блокируется, словарь не растёт', () => {
    const current = ['a', 'b'];
    const full = Array.from({ length: 48 }, (_, i) => `p${i}`);
    const all = [...current, ...full];
    const r = computeCanonKeywords(all, ['Новое'], prot(...all));
    expect(r.blocked).toEqual(['Новое']);
    expect(r.added).toEqual([]);
    expect(r.next).toEqual(all);
  });

  it('без кандидатов возвращает вход как есть', () => {
    const r = computeCanonKeywords(['A'], [], prot());
    expect(r.next).toEqual(['A']);
    expect(r.added).toEqual([]);
  });
});
