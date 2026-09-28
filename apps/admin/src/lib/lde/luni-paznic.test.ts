import { describe, it, expect } from 'vitest';
import { lipsurileLunii, textLuniPaznic } from './luni-paznic';

const S = '2026-09-28';
const toate = new Map([
  ['lear_poster_last', S], ['lear_poster_last_lear_flore_ti', S], ['sebn_optimizari_poster_last', S],
  ['indicatii_alexei_last_lear', S], ['indicatii_alexei_last_floresti', S], ['briceni_optimizari_poster_last', S],
]);
const rapoarte = new Set(['LEAR Ungheni', 'LEAR Florești', 'SEBN', 'BRICENI', 'DRAXELMAIER']);

describe('paznicul de luni', () => {
  it('totul plecat → nimic de spus', () => {
    expect(lipsurileLunii(S, rapoarte, toate)).toEqual([]);
    expect(textLuniPaznic(S, [])).toBeNull();
  });
  it('cheie de săptămâna trecută = neplecat; raport lipsă, pe uzină; indicațiile nu se mai cer (ION-118)', () => {
    const chei = new Map(toate); chei.set('lear_poster_last_lear_flore_ti', '2026-09-21'); chei.delete('indicatii_alexei_last_lear');
    const l = lipsurileLunii(S, new Set(['LEAR Ungheni', 'LEAR Florești']), chei);
    expect(l).toEqual([
      { uzina: 'LEAR Florești', ce: 'poster' },
      { uzina: 'SEBN Orhei și Strășeni', ce: 'raport' },
      { uzina: 'Trox + suburban Briceni', ce: 'raport' },
      { uzina: 'Drăxlmaier Bălți', ce: 'raport' },
    ]);
    const t = textLuniPaznic(S, l)!;
    expect(t).toContain('<b>LEAR Florești</b>: poster');
    expect(t).toContain('<b>SEBN Orhei și Strășeni</b>: raport');
    expect(t).toContain('lear-saptamanal.log');
  });
  it('Briceni: se cer rândul analizei și posterul (pleacă lunea din 26.09, ION-73)', () => {
    expect(lipsurileLunii(S, rapoarte, toate).some((x) => x.uzina.startsWith('Trox'))).toBe(false);
    const fara = new Set(rapoarte); fara.delete('BRICENI');
    expect(lipsurileLunii(S, fara, toate)).toEqual([{ uzina: 'Trox + suburban Briceni', ce: 'raport' }]);
    const vechi = new Map(toate); vechi.set('briceni_optimizari_poster_last', '2026-09-21');
    expect(lipsurileLunii(S, rapoarte, vechi)).toEqual([{ uzina: 'Trox + suburban Briceni', ce: 'poster' }]);
  });
  it('SEBN n-are indicații separate, deci nu i se cere cheia', () => {
    expect(lipsurileLunii(S, rapoarte, toate).some((x) => x.uzina.startsWith('SEBN'))).toBe(false);
  });
  it('Drăxlmaier: se cere doar rândul (posterul și indicațiile nu pleacă până la «da», ION-94)', () => {
    const fara = new Set(rapoarte); fara.delete('DRAXELMAIER');
    expect(lipsurileLunii(S, fara, toate)).toEqual([{ uzina: 'Drăxlmaier Bălți', ce: 'raport' }]);
    expect(lipsurileLunii(S, rapoarte, new Map(toate)).some((x) => x.uzina.startsWith('Drăxlmaier'))).toBe(false);
    expect(textLuniPaznic(S, [{ uzina: 'Drăxlmaier Bălți', ce: 'raport' }])).toContain('analiza-respinsa.json');
  });
});
