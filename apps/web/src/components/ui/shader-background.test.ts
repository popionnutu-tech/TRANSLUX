import { describe, expect, it } from 'vitest';
import { drumDesktop } from './shader-background';

// U ca în shader: min(lățime, înălțime × 0.62), în px CSS.
const U = (w: number, h: number) => Math.min(w, h * 0.62);
// marginile drumului (px CSS) la abaterea maximă, înapoi din unitățile lumii
const margini = (w: number, h: number) => {
  const u = U(w, h);
  const [, c, a] = drumDesktop(w, u);
  const px = (x: number) => (x + (w / u - 1) / 2) * u;
  return [px(c - a - 0.085), px(c + a + 0.085)];
};

describe('drumDesktop', () => {
  it('telefonul și tableta rămân cu serpentina dintâi', () => {
    expect(drumDesktop(390, U(390, 844))[0]).toBe(0);
    expect(drumDesktop(1024, U(1024, 768))[0]).toBe(0);
  });
  it('pe desktop drumul stă în golul din dreapta coloanei de 760 px, cu margine', () => {
    for (const [w, h] of [[1470, 950], [1920, 1080], [2560, 1440]]) {
      expect(drumDesktop(w, U(w, h))[0]).toBe(1);
      const [st, dr] = margini(w, h);
      expect(st).toBeGreaterThanOrEqual((w + 760) / 2 + 24 - 0.01);
      expect(dr).toBeLessThanOrEqual(w - 24 + 0.01);
    }
  });
});
