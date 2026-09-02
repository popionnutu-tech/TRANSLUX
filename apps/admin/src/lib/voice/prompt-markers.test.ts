import { describe, it, expect } from 'vitest';
import { PROMPT_MARKERS_RO, PROMPT_MARKERS_RU, TOATE_MARKERELE } from './prompt-markers';

// Fișierul își declară singur cerința: reperele trebuie să rămână unice între
// ele. De ea depind doi consumatori (controlerul de drift și nomenclatorul de
// tipuri de reclamații), dar nimic nu o verifica. Un reper care se cuprinde în
// altul face detectorul orb la ștergerea blocului propriu — blocul dispare din
// promptul viu și nimeni nu află (02.09).
describe('reperele promptului', () => {
  it('nu se cuprind unul pe altul', () => {
    const coliziuni: string[] = [];
    for (const a of TOATE_MARKERELE) {
      for (const b of TOATE_MARKERELE) {
        if (a !== b && b.includes(a)) coliziuni.push(`«${a}» e cuprins în «${b}»`);
      }
    }
    expect(coliziuni).toEqual([]);
  });

  it('nu au dubluri', () => {
    expect(new Set(TOATE_MARKERELE).size).toBe(TOATE_MARKERELE.length);
  });

  it('nu are repere goale sau cu spații la capete', () => {
    for (const m of TOATE_MARKERELE) {
      expect(m).toBe(m.trim());
      expect(m.length).toBeGreaterThan(3);
    }
  });

  it('lista completă e suma celor două limbi', () => {
    expect(TOATE_MARKERELE).toEqual([...PROMPT_MARKERS_RO, ...PROMPT_MARKERS_RU]);
  });
});
