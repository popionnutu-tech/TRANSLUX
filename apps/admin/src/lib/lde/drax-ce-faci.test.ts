import { describe, it, expect } from 'vitest';
import { ceFaciDrax, cazuriMasina, indicatieMasina, parseCursa, textCaz, textR1a, TOLERANTA_KM } from './drax-ce-faci';
import type { AnalizaDrax, BucataDrax, MasinaDrax, ZiDrax } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';
import kaj345 from './drax-345kaj-2026-09-14.fixture.json';

// 345KAJ din rândul real DRAXELMAIER 2026-09-14 (rescris 27.09 cu câmpurile ION-105): R1b 528,3 km/săpt., R3 0, 3 zile măsurate din 5
const real = kaj345 as unknown as MasinaDrax;

const bucata = (o: Partial<BucataDrax>): BucataDrax => ({
  ora: '06:00–07:00', t0: 0, t1: 0, cat: 'livrare', km: 0, golImpus: 0, ocol: false, pranz: false, de: null, pana: null, lin: null, motiv: null, ...o,
});
const zi = (z: string, bucati: BucataDrax[], o: Partial<ZiDrax> = {}): ZiDrax => ({
  z, dow: 1, total: 0, km: fixtureDrax().masini[0].km, brambura: 0, bilant: true, dif: 0, exclus: null, noapteDim: null, noapteSeara: null,
  economie: { R1a: 0, R1b: 0, R3: 0, B: 0, nelamurit: 0 }, bucati, ...o,
});

describe('parseCursa', () => {
  it('linia poate avea spații; sensul necunoscut rămâne null', () => {
    expect(parseCursa('R3|Recea* retur s1')).toEqual({ lin: 'R3|Recea*', sens: 'retur' });
    expect(parseCursa('R12|Sofia Noua tur s2')).toEqual({ lin: 'R12|Sofia Noua', sens: 'tur' });
    expect(parseCursa('R5|X undefined undefined')).toEqual({ lin: 'R5|X', sens: null });
    expect(parseCursa(null)).toBeNull();
  });
});

describe('cazuriMasina — 345KAJ, rândul real 14.09', () => {
  const cazuri = cazuriMasina(real);

  it('două tipare, descrescător; zilele excluse (14 și 16.09) nu intră', () => {
    expect(cazuri).toHaveLength(2);
    expect(cazuri[0].zile.map((x) => x.z)).toEqual(['2026-09-15', '2026-09-17', '2026-09-18']);
    expect(cazuri[1].zile.map((x) => x.z)).toEqual(['2026-09-15', '2026-09-17']);
    expect(cazuri.flatMap((c) => c.zile).some((x) => x.z === '2026-09-14' || x.z === '2026-09-16')).toBe(false);
  });

  it('tiparul mare: după returul R3 Recea* la 16:17 la capătul Recea, acasă la Zăicani, înapoi la 00:17 la uzină', () => {
    const c = cazuri[0];
    expect(c).toMatchObject({
      tip: 'ocol', termina: '16:17', revine: '00:17', acasa: 'Zăicani',
      dupa: { lin: 'R3|Recea*', sens: 'retur' }, inainte: { lin: 'R8|Costesti', sens: 'retur' },
      locSfarsit: { tip: 'capat', sat: 'Recea' }, locInceput: { tip: 'uzina' }, asteapta: { tip: 'uzina' },
    });
    // 94,0 + 94,4 + 93,9 km măsurați × 5/3
    expect(c.kmSapt).toBeCloseTo(470.5, 1);
    expect(c.kmZi).toBeCloseTo(94.1, 1);
    const t = textCaz(c);
    for (const s of ['mar 15.09, joi 17.09, vin 18.09', 'R3 · Recea* (retur)', '16:17 la capătul Recea', 'acasă la Zăicani', '00:17 la uzină',
      'R8 · Costesti (retur)', 'Să aștepte la uzină', '≈ 94 km/zi', '471 km/săpt.']) expect(t).toContain(s);
  });

  it('tiparul mic: după turul de dimineață, așteaptă la capătul Costești', () => {
    expect(cazuri[1]).toMatchObject({ tip: 'ocol', locSfarsit: { tip: 'uzina' }, asteapta: { tip: 'capat', sat: 'Costești' } });
    expect(cazuri[1].kmSapt).toBeCloseTo((22.6 + 12.1) * 5 / 3, 1);
  });

  it('control: Σ km din indicații = R1b + R3 extrapolați (± 1 km); lei doar cu normă', () => {
    const x = indicatieMasina(real);
    expect(Math.abs(x.kmCazuri - (real.extrapolat.R1b! + real.extrapolat.R3!))).toBeLessThanOrEqual(TOLERANTA_KM);
    expect(x.lei).not.toBeNull();
    expect(indicatieMasina({ ...real, normaLipsa: true }).lei).toBeNull();
    expect(textR1a(x)).toContain('Zăicani');
  });
});

describe('ceFaciDrax — secțiunea', () => {
  it('totalul secțiunii = cardul «se poate tăia cu o dispoziție»; sub prag separat', () => {
    const f = fixtureDrax();
    const masini = [real, f.masini[1]];
    const card = masini.reduce((s, m) => s + (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0), 0);
    const a: AnalizaDrax = { ...f, masini, economie: { ...f.economie, carduri: { ...f.economie.carduri, R1bR3: card } } };
    const c = ceFaciDrax(a);
    expect(c.pestePrag.map((x) => x.m)).toEqual(['345KAJ']);
    expect(c.subPrag).toEqual({ masini: 1, km: 50 });
    expect(Math.abs(c.abatereCard)).toBeLessThanOrEqual(TOLERANTA_KM);
  });

  it('golul dintre tur și retur (R3) și ziua «de lămurit»', () => {
    const golTure = bucata({ cat: 'golTure', ora: '06:20–14:40', km: 60, r3: 45, r3fin: 40, prev: 'R32|Trifanesti tur s1', next: 'R32|Trifanesti retur s1',
      acasa: 'Trifănești', de: 'Slobozia', pana: 'Slobozia', lin: 'R32|Trifanesti' });
    const ocolScos = bucata({ cat: 'livrare', ocol: true, km: 30, prev: 'R1|A retur s1', next: 'R2|B retur s2', acasa: 'Sat' });
    const m: MasinaDrax = {
      ...fixtureDrax().masini[0], m: 'TEST', zile: 2, zileIncluse: 2, lei: { masurat: null, extrapolat: null },
      extrapolat: { R1a: 0, R1b: 0, R3: 80, B: 80 },
      detalii: [zi('2026-09-14', [golTure]), zi('2026-09-15', [golTure, ocolScos], { scosDeLamurit: { R1a: 0, R1b: 30, R3: 0 } })],
    };
    const [c] = cazuriMasina(m);
    expect(c).toMatchObject({ tip: 'ture', kmSapt: 80, asteapta: { tip: 'uzina' }, lei: null });
    expect(cazuriMasina(m)).toHaveLength(1);
    expect(textCaz(c)).toContain('pleacă la Trifănești');
    expect(textCaz(c)).toContain('la uzină (în parc)');
  });
});
