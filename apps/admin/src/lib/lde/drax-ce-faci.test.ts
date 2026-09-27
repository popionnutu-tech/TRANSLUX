import { describe, it, expect } from 'vitest';
import {
  ceFaciDrax, cazuriMasina, durata, indicatieMasina, parseCursa, parteZi, stareMasina, verdictCaz, TOLERANTA_KM,
} from './drax-ce-faci';
import type { AnalizaDrax, BucataDrax, MasinaDrax, ZiDrax } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';
import kaj345 from './drax-345kaj-2026-09-14.fixture.json';
import fti925 from './drax-925fti-2026-09-14.fixture.json';

// Cifrele GPS (costul de azi) — rândul DRAXELMAIER 2026-09-14 (ideal-v3.1, rulat 27.09 10:50 UTC):
//   345KAJ — casa Zăicani, 3 zile măsurate din 5, R1b 276 km/săpt.;  925FTI — casa Sărata Veche, 4 din 5, R1b 475,1 km/săpt.
const kaj = kaj345 as unknown as MasinaDrax;
const fti = fti925 as unknown as MasinaDrax;

const bucata = (o: Partial<BucataDrax>): BucataDrax => ({
  ora: '06:00–07:00', t0: 0, t1: 0, cat: 'livrare', km: 0, golImpus: 0, ocol: false, pranz: false, de: null, pana: null, lin: null, motiv: null, ...o,
});
const zi = (z: string, bucati: BucataDrax[], o: Partial<ZiDrax> = {}): ZiDrax => ({
  z, dow: 1, total: 0, km: fixtureDrax().masini[0].km, brambura: 0, bilant: true, dif: 0, exclus: null, noapteDim: null, noapteSeara: null,
  economie: { R1a: 0, R1b: 0, R3: 0, B: 0, nelamurit: 0 }, bucati, ...o,
});
const ZILE5 = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

describe('parseCursa, durata, parteZi', () => {
  it('linia poate avea spații; sensul și schimbul necunoscute rămân null', () => {
    expect(parseCursa('R6|Mihailenii Vechi retur s1')).toEqual({ lin: 'R6|Mihailenii Vechi', sens: 'retur', schimb: 's1' });
    expect(parseCursa('R5|X undefined undefined')).toEqual({ lin: 'R5|X', sens: null, schimb: null });
    expect(parseCursa(null)).toBeNull();
  });
  it('durata și partea zilei', () => {
    expect(durata(447)).toBe('7 h 27 min');
    expect([parteZi('06:20'), parteZi('11:59'), parteZi('16:30')]).toEqual(['dimineata', 'dimineata', 'seara']);
  });
});

describe('pragul e pe mașină: ≥ 20 km pe zi lucrată, ≥ 100 km/săpt., ≥ 3 zile măsurate', () => {
  it('stare și verdict', () => {
    expect(stareMasina(kaj)).toBe('peste');
    expect(stareMasina({ ...kaj, zileIncluse: 2 })).toBe('nemasurata');
    expect(stareMasina({ ...kaj, extrapolat: { ...kaj.extrapolat, R1b: 95 } })).toBe('sub'); // 19 km/zi
    expect([verdictCaz('peste'), verdictCaz('sub'), verdictCaz('nemasurata')]).toEqual(['ramane', 'mic', 'nemasurat']);
  });
  it('o mașină peste prag are TOATE drumurile acasă «de tăiat», și cele mici', () => {
    const x = indicatieMasina(kaj);
    expect(x.km).toEqual({ ramane: 276, mic: 0, nemasurat: 0 });
    expect(Math.abs(x.abatere)).toBeLessThanOrEqual(TOLERANTA_KM);
  });
});

describe('dimineață / seară pe GPS', () => {
  it('345KAJ: seara (16:49 → 00:17) e cea mare', () => {
    const c = cazuriMasina(kaj);
    expect(c[0]).toMatchObject({ parte: 'seara', termina: '16:49', revine: '00:17', ramane: { tip: 'uzina' } });
    const x = indicatieMasina(kaj);
    expect(x.parti.seara.kmSapt).toBeCloseTo((45 + 44.8 + 41.1) * 5 / 3, 0);
    expect(x.parti.dimineata.kmSapt + x.parti.seara.kmSapt).toBeCloseTo(x.kmSapt, 0);
  });
  it('925FTI: 258 dimineața + 217 seara = 475 (ca «gps» din plan)', () => {
    const x = indicatieMasina(fti);
    expect(Math.round(x.parti.dimineata.kmSapt)).toBe(258);
    expect(Math.round(x.parti.seara.kmSapt)).toBe(217);
    expect(x.kmSapt).toBe(475.1);
    expect(x.kmZi).toBe(95);
  });
});

describe('ceFaciDrax — grupele închid cardul', () => {
  const gol = bucata({ cat: 'livrare', ocol: true, km: 30, ora: '06:20–13:20', prev: 'R1|A tur s1', next: 'R2|B tur s2', acasa: 'Sat', pana: 'B' });
  const scurt: MasinaDrax = {
    ...fixtureDrax().masini[0], m: 'SCURT', zile: 5, zileIncluse: 5, extrapolat: { R1a: 0, R1b: 150, R3: 0, B: 150 },
    detalii: ZILE5.map((z) => zi(z, [gol])),
  };
  const putin: MasinaDrax = { ...scurt, m: 'PUTIN', zileIncluse: 2, extrapolat: { R1a: 0, R1b: 247, R3: 0, B: 247 }, detalii: ZILE5.slice(0, 2).map((z) => zi(z, [gol])) };
  const zero: MasinaDrax = { ...scurt, m: 'ZERO', zileIncluse: 0, extrapolat: { R1a: null, R1b: null, R3: null, B: null }, detalii: [] };
  const f = fixtureDrax();
  const masini = [kaj, fti, scurt, putin, zero, f.masini[1]];
  const card = masini.reduce((s, m) => s + (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0), 0);
  const a: AnalizaDrax = { ...f, masini, economie: { ...f.economie, carduri: { ...f.economie.carduri, R1bR3: card } } };

  it('listă, sub prag, nemăsurate; dimineața + seara (măsurate) + nemăsurate = cardul', () => {
    const c = ceFaciDrax(a);
    expect(c.deAratat.map((x) => x.m)).toEqual(['925FTI', '345KAJ', 'SCURT']);
    expect(c.nemasurate.map((x) => x.m)).toEqual(['PUTIN']);
    expect(c.doarMici.map((x) => x.m)).toEqual(['024XKY']);
    expect(Math.abs(c.kmParti.dimineata + c.kmParti.seara + c.kmGrupe.nemasurate - c.card)).toBeLessThanOrEqual(TOLERANTA_KM + c.neexplicat);
    expect(Math.abs(c.abatereCard)).toBeLessThanOrEqual(TOLERANTA_KM);
  });

  it('N7: mașina fără zile GPS intră la nemăsurate când altă sursă (modelul) o semnalează', () => {
    expect(ceFaciDrax(a, (m) => m === 'ZERO').nemasurate.map((x) => x.m)).toEqual(['PUTIN', 'ZERO']);
  });
});
