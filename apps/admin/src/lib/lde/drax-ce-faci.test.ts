import { describe, it, expect } from 'vitest';
import {
  ceFaciDrax, cazuriMasina, durata, indicatieMasina, parseCursa, textCaz, textR1a, verdictCaz, TOLERANTA_KM,
} from './drax-ce-faci';
import type { AnalizaDrax, BucataDrax, MasinaDrax, ZiDrax } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';
import kaj345 from './drax-345kaj-2026-09-14.fixture.json';

// 345KAJ din rândul DRAXELMAIER 2026-09-14 refăcut pe ideal-v3.1 (ION-107, 27.09): liniile R6 · Mihailenii Vechi și R8 · Costesti,
// R1b 276 km/săpt., R3 0, 3 zile măsurate din 5 (14 și 16.09 excluse: «jumătate probabil nedetectată»)
const real = kaj345 as unknown as MasinaDrax;

const bucata = (o: Partial<BucataDrax>): BucataDrax => ({
  ora: '06:00–07:00', t0: 0, t1: 0, cat: 'livrare', km: 0, golImpus: 0, ocol: false, pranz: false, de: null, pana: null, lin: null, motiv: null, ...o,
});
const zi = (z: string, bucati: BucataDrax[], o: Partial<ZiDrax> = {}): ZiDrax => ({
  z, dow: 1, total: 0, km: fixtureDrax().masini[0].km, brambura: 0, bilant: true, dif: 0, exclus: null, noapteDim: null, noapteSeara: null,
  economie: { R1a: 0, R1b: 0, R3: 0, B: 0, nelamurit: 0 }, bucati, ...o,
});
const ORA = 3600e3;

describe('parseCursa și durata', () => {
  it('linia poate avea spații; sensul necunoscut rămâne null', () => {
    expect(parseCursa('R6|Mihailenii Vechi retur s1')).toEqual({ lin: 'R6|Mihailenii Vechi', sens: 'retur' });
    expect(parseCursa('R5|X undefined undefined')).toEqual({ lin: 'R5|X', sens: null });
    expect(parseCursa(null)).toBeNull();
  });
  it('durata în ore și minute', () => {
    expect(durata(447)).toBe('7 h 27 min');
    expect(durata(180)).toBe('3 h');
    expect(durata(45)).toBe('45 min');
  });
});

describe('verdictCaz', () => {
  it('mic bate schimb; pragurile 3 h și 20 km/zi; mașina sub prag = mic', () => {
    expect(verdictCaz({ kmZi: 44, asteptareMin: 447 }, true)).toBe('schimb');
    expect(verdictCaz({ kmZi: 44, asteptareMin: 180 }, true)).toBe('realist');
    expect(verdictCaz({ kmZi: 19.9, asteptareMin: 60 }, true)).toBe('mic');
    expect(verdictCaz({ kmZi: 17, asteptareMin: 410 }, true)).toBe('mic');
    expect(verdictCaz({ kmZi: 44, asteptareMin: 60 }, false)).toBe('mic');
  });
});

describe('345KAJ — rândul 14.09 refăcut pe ideal-v3.1', () => {
  const cazuri = cazuriMasina(real);

  it('liniile vecine sunt R6 · Mihailenii Vechi și R8 · Costesti, nu Recea*', () => {
    expect(real.rute.map((r) => r.r)).toContain('R6|Mihailenii Vechi');
    expect(real.rute.some((r) => r.r.includes('Recea'))).toBe(false);
    for (const c of cazuri) expect([c.dupa?.lin, c.inainte?.lin]).toEqual(['R6|Mihailenii Vechi', 'R8|Costesti']);
  });

  it('după returul R6 la 16:49: ar sta ~7,5 h până la 00:17 → candidat de schimb de linii, nu «să aștepte»', () => {
    const c = cazuri[0];
    expect(c).toMatchObject({ tip: 'ocol', verdict: 'schimb', termina: '16:49', revine: '00:17', acasa: 'Zăicani',
      locSfarsit: { tip: 'capat', sat: 'Mihăileni' }, locInceput: { tip: 'uzina' } });
    expect(c.zile.map((x) => x.z)).toEqual(['2026-09-15', '2026-09-17', '2026-09-18']);
    expect(c.asteptareMin).toBeGreaterThan(7 * 60);
    expect(c.kmSapt).toBeCloseTo((45 + 44.8 + 41.1) * 5 / 3, 1);
    const t = textCaz(c);
    expect(t).toContain('ar sta 7 h');
    expect(t).toContain('Candidat de schimb de linii: mașina face linii în capete diferite');
    expect(t).not.toContain('Să aștepte');
  });

  it('ocolul de dimineață (Zăicani e pe drumul spre Costești, ~17 km/zi) e mic, fără dispoziție', () => {
    expect(cazuri[1]).toMatchObject({ verdict: 'mic', acasa: 'Zăicani' });
    expect(cazuri[1].kmZi).toBeLessThan(20);
    expect(textCaz(cazuri[1])).toContain('nu merită o dispoziție');
  });

  it('control: realist + schimb + mic = R1b + R3 (± 1 km); lei doar pe indicațiile realiste', () => {
    const x = indicatieMasina(real);
    expect(x.km).toEqual({ realist: 0, schimb: 218.2, mic: 57.8 });
    expect(Math.abs(x.km.realist + x.km.schimb + x.km.mic - x.R1bR3)).toBeLessThanOrEqual(TOLERANTA_KM);
    expect(Math.abs(x.abatere)).toBeLessThanOrEqual(TOLERANTA_KM);
    expect(x.lei).toBeNull();
    expect(textR1a(x)).toContain('Zăicani');
  });
});

describe('ceFaciDrax — secțiunea și cardul', () => {
  const golScurt = bucata({ cat: 'livrare', ocol: true, km: 30, t0: 0, t1: 2 * ORA, ora: '14:40–16:40', prev: 'R1|A tur s2', next: 'R2|B tur s2', acasa: 'Sat', pana: 'B' });
  const m2h: MasinaDrax = {
    ...fixtureDrax().masini[0], m: 'SCURT', zile: 5, zileIncluse: 5, lei: { masurat: 300, extrapolat: 300 }, normaLipsa: false,
    extrapolat: { R1a: 0, R1b: 150, R3: 0, B: 150 },
    detalii: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].map((z) => zi(z, [golScurt])),
  };

  it('realist + candidați + mici = cardul; o așteptare de 2 h la capătul următoarei curse e indicație', () => {
    const f = fixtureDrax();
    const masini = [real, m2h, f.masini[1]];
    const card = masini.reduce((s, m) => s + (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0), 0);
    const a: AnalizaDrax = { ...f, masini, economie: { ...f.economie, carduri: { ...f.economie.carduri, R1bR3: card } } };
    const c = ceFaciDrax(a);
    expect(c.cuIndicatie.map((x) => x.m)).toEqual(['SCURT']);
    expect(c.candidatiSchimb.map((x) => x.m)).toEqual(['345KAJ']);
    expect(c.km.realist).toBe(150);
    // 024XKY sintetic: R1b + R3 = 50 fără nicio bucată → «neexplicat», nu pierdut
    expect(c.neexplicat).toBe(50);
    expect(Math.abs(c.abatereCard)).toBeLessThanOrEqual(TOLERANTA_KM);
    const [caz] = c.cuIndicatie[0].cazuri;
    expect(textCaz(caz)).toContain('Să aștepte la capătul B 2 h (14:40–16:40)');
    expect(c.cuIndicatie[0].lei).toBe(300);
  });

  it('golul dintre tur și retur (R3) și ziua «de lămurit»', () => {
    const golTure = bucata({ cat: 'golTure', ora: '06:20–08:40', t0: 0, t1: 2.33 * ORA, km: 60, r3: 45, r3fin: 40,
      prev: 'R32|Trifanesti tur s1', next: 'R32|Trifanesti retur s1', acasa: 'Trifănești', de: 'Slobozia', pana: 'Slobozia', lin: 'R32|Trifanesti' });
    const ocolScos = bucata({ cat: 'livrare', ocol: true, km: 30, prev: 'R1|A retur s1', next: 'R2|B retur s2', acasa: 'Sat' });
    const m: MasinaDrax = {
      ...fixtureDrax().masini[0], m: 'TEST', zile: 4, zileIncluse: 4, lei: { masurat: null, extrapolat: null },
      extrapolat: { R1a: 0, R1b: 0, R3: 160, B: 160 },
      detalii: ['2026-09-14', '2026-09-15', '2026-09-16'].map((z) => zi(z, [golTure]))
        .concat(zi('2026-09-17', [golTure, ocolScos], { scosDeLamurit: { R1a: 0, R1b: 30, R3: 0 } })),
    };
    const cazuri = cazuriMasina(m);
    expect(cazuri).toHaveLength(1);
    expect(cazuri[0]).toMatchObject({ tip: 'ture', verdict: 'realist', kmSapt: 160, asteapta: { tip: 'uzina' }, lei: null });
    expect(textCaz(cazuri[0])).toContain('pleacă la Trifănești');
    expect(textCaz(cazuri[0])).toContain('la uzină (în parc)');
  });
});
