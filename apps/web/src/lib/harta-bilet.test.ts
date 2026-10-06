import { describe, expect, it } from 'vitest';
import { fazaBilet, incadrareBilet, intre, kmPeLinie, paddingBilet, type LatLon } from './harta-bilet';

// Linie spre Chișinău (sud), ca în route_shapes: Criva → Edineț → Bălți → Chișinău, cu un punct la ~1 km pas.
const CRIVA: LatLon = [48.27, 26.66];
const EDINET: LatLon = [48.17, 27.31];
const BALTI: LatLon = [47.76, 27.93];
const CHISINAU: LatLon = [47.02, 28.84];
function linie(puncte: LatLon[], pasi = 40): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 1; i < puncte.length; i++) {
    const [a, b] = [puncte[i - 1], puncte[i]];
    for (let k = 0; k < pasi; k++) out.push([a[0] + ((b[0] - a[0]) * k) / pasi, a[1] + ((b[1] - a[1]) * k) / pasi]);
  }
  out.push(puncte[puncte.length - 1]);
  return out;
}
const LINE = linie([CRIVA, EDINET, BALTI, CHISINAU]);
const pe = (a: LatLon, b: LatLon, f: number): LatLon => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const ZAHAREUCA = pe(CRIVA, EDINET, 0.6); // înainte de Edineț, spre sud
const DUPA_EDINET = pe(EDINET, BALTI, 0.3);

describe('intre — bucata biletului', () => {
  it('spre Chișinău: începe la urcare, se termină la coborâre, fără Criva', () => {
    const b = intre(LINE, EDINET, CHISINAU)!;
    expect(b[0][0]).toBeCloseTo(EDINET[0], 3);
    expect(b[b.length - 1][0]).toBeCloseTo(CHISINAU[0], 3);
    expect(b.every((p) => p[1] >= EDINET[1] - 1e-6)).toBe(true);
  });
  it('spre nord: aceeași bucată, în ordinea inversă', () => {
    const b = intre(LINE, CHISINAU, EDINET)!;
    expect(b[0][0]).toBeCloseTo(CHISINAU[0], 3);
    expect(b[b.length - 1][1]).toBeCloseTo(EDINET[1], 3);
  });
  it('stația în afara liniei → null (atunci linia întreagă estompată)', () => {
    expect(intre(LINE, [46.5, 30.5], CHISINAU)).toBeNull();
  });
});

describe('fazaBilet', () => {
  const baza = { from: EDINET, to: CHISINAU, line: LINE };
  it('fără poziție → fara-autobuz', () => {
    expect(fazaBilet({ ...baza, bus: null })).toBe('fara-autobuz');
  });
  it('autobuzul la Zahareuca, înainte de Edineț → spre-urcare', () => {
    expect(fazaBilet({ ...baza, bus: ZAHAREUCA })).toBe('spre-urcare');
  });
  it('autobuzul chiar în stație (sau la 200 m după) → încă spre-urcare', () => {
    expect(fazaBilet({ ...baza, bus: EDINET })).toBe('spre-urcare');
    expect(fazaBilet({ ...baza, bus: pe(EDINET, BALTI, 0.003) })).toBe('spre-urcare');
    expect(fazaBilet({ ...baza, bus: DUPA_EDINET, inStatiaMea: true })).toBe('spre-urcare');
  });
  it('a trecut de Edineț → spre-coborare', () => {
    expect(fazaBilet({ ...baza, bus: DUPA_EDINET })).toBe('spre-coborare');
  });
  it('plecata de la /pozitie câștigă, chiar fără linie', () => {
    expect(fazaBilet({ bus: ZAHAREUCA, from: EDINET, to: CHISINAU, line: null, plecata: true })).toBe('spre-coborare');
  });
  it('spre nord (Chișinău → Edineț): trecut = mai la nord de urcare', () => {
    const nord = { from: CHISINAU, to: EDINET, line: LINE };
    expect(fazaBilet({ ...nord, bus: pe(BALTI, CHISINAU, 0.5) })).toBe('spre-coborare');
    expect(fazaBilet({ ...nord, bus: pe(BALTI, CHISINAU, 0.99999) })).toBe('spre-urcare');
  });
  it('fără linie și fără plecata → spre-urcare', () => {
    expect(fazaBilet({ bus: DUPA_EDINET, from: EDINET, to: CHISINAU, line: null })).toBe('spre-urcare');
  });
});

describe('incadrareBilet', () => {
  it('fiecare fază pe punctele ei', () => {
    expect(incadrareBilet('fara-autobuz', null, EDINET, CHISINAU)).toEqual([EDINET]);
    expect(incadrareBilet('spre-urcare', ZAHAREUCA, EDINET, CHISINAU)).toEqual([ZAHAREUCA, EDINET]);
    expect(incadrareBilet('spre-coborare', DUPA_EDINET, EDINET, CHISINAU)).toEqual([DUPA_EDINET, CHISINAU]);
  });
  it('capăt lipsă → celălalt; nimic → listă goală', () => {
    expect(incadrareBilet('spre-coborare', DUPA_EDINET, EDINET, null)).toEqual([DUPA_EDINET, EDINET]);
    expect(incadrareBilet('fara-autobuz', null, null, null)).toEqual([]);
  });
});

describe('kmPeLinie și paddingBilet', () => {
  it('km crescători spre Chișinău', () => {
    expect(kmPeLinie(EDINET, LINE)!).toBeLessThan(kmPeLinie(BALTI, LINE)!);
    expect(kmPeLinie([46.5, 30.5], LINE)).toBeNull();
  });
  it('jos cel puțin 40 % din hartă sau cardul real + 36', () => {
    expect(paddingBilet(390, 700).paddingBottomRight[1]).toBe(280);
    expect(paddingBilet(390, 700, 300).paddingBottomRight[1]).toBe(336);
    // Cardul uriaș nu mănâncă toată harta: rămân ≥ 120 px sub antet.
    expect(paddingBilet(390, 500, 480).paddingBottomRight[1]).toBe(500 - 72 - 120);
  });
});
