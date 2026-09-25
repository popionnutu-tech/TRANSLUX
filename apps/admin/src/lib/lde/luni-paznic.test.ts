import { describe, it, expect } from 'vitest';
import { lipsurileLunii, textLuniPaznic } from './luni-paznic';

const S = '2026-09-28';
const toate = new Map([
  ['lear_poster_last', S], ['lear_poster_last_lear_flore_ti', S], ['sebn_optimizari_poster_last', S],
  ['indicatii_alexei_last_lear', S], ['indicatii_alexei_last_floresti', S],
]);
const rapoarte = new Set(['LEAR Ungheni', 'LEAR Florești', 'SEBN', 'BRICENI']);

describe('paznicul de luni', () => {
  it('totul plecat → nimic de spus', () => {
    expect(lipsurileLunii(S, rapoarte, toate)).toEqual([]);
    expect(textLuniPaznic(S, [])).toBeNull();
  });
  it('cheie de săptămâna trecută = neplecat; raport lipsă și indicații lipsă, pe uzină', () => {
    const chei = new Map(toate); chei.set('lear_poster_last_lear_flore_ti', '2026-09-21'); chei.delete('indicatii_alexei_last_lear');
    const l = lipsurileLunii(S, new Set(['LEAR Ungheni', 'LEAR Florești']), chei);
    expect(l).toEqual([
      { uzina: 'LEAR Ungheni', ce: 'indicații' },
      { uzina: 'LEAR Florești', ce: 'poster' },
      { uzina: 'SEBN Orhei și Strășeni', ce: 'raport' },
      { uzina: 'Trox + suburban Briceni', ce: 'raport' },
    ]);
    const t = textLuniPaznic(S, l)!;
    expect(t).toContain('<b>LEAR Florești</b>: poster');
    expect(t).toContain('<b>SEBN Orhei și Strășeni</b>: raport');
    expect(t).toContain('lear-saptamanal.log');
  });
  it('Briceni: se cere doar rândul analizei, posterul nu (pleacă doar după «da»-ul lui Ion, ION-73)', () => {
    expect(lipsurileLunii(S, rapoarte, toate).some((x) => x.uzina.startsWith('Trox'))).toBe(false);
    const fara = new Set(rapoarte); fara.delete('BRICENI');
    expect(lipsurileLunii(S, fara, toate)).toEqual([{ uzina: 'Trox + suburban Briceni', ce: 'raport' }]);
  });
  it('SEBN n-are indicații separate, deci nu i se cere cheia', () => {
    expect(lipsurileLunii(S, rapoarte, toate).some((x) => x.uzina.startsWith('SEBN'))).toBe(false);
  });
});
