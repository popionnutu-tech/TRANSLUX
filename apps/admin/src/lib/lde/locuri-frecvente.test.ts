import { describe, it, expect } from 'vitest';
import { esteCunoscut, locuriFrecvente, type OprireGps, type PunctCunoscut } from './locuri-frecvente';

const oprire = (p: Partial<OprireGps> = {}): OprireGps => ({
  vehicleId: 'v1', plate: 'HMK139', lat: 47.0105, lng: 28.8638,
  dwellMin: 120, arrivalAt: '2026-08-20T08:00:00Z', locality: 'Chișinău', ...p,
});

const punct = (p: Partial<PunctCunoscut> = {}): PunctCunoscut => ({
  id: 'p1', name: 'Baza Chișinău', lat: 47.0105, lng: 28.8638, radiusM: 500, ...p,
});

describe('esteCunoscut', () => {
  it('oprirea în raza unui punct din nomenclator e cunoscută', () => {
    expect(esteCunoscut({ lat: 47.0107, lng: 28.8640 }, [punct()])).toBe(true);
  });

  it('la 5 km nu mai e același punct', () => {
    expect(esteCunoscut({ lat: 47.0605, lng: 28.8638 }, [punct()])).toBe(false);
  });

  it('punctul fără coordonate nu poate declara nimic cunoscut', () => {
    expect(esteCunoscut({ lat: 47.0105, lng: 28.8638 }, [punct({ lat: null, lng: null })])).toBe(false);
  });

  it('raza mică a punctului nu lasă aceeași parcare să reapară ca «loc nou»', () => {
    // punct cu rază 50 m, oprire la ~300 m — tot el e, nu un loc nou
    expect(esteCunoscut({ lat: 47.0132, lng: 28.8638 }, [punct({ radiusM: 50 })])).toBe(true);
  });
});

describe('locuriFrecvente', () => {
  it('grupează opririle apropiate și numără vizitele, camioanele și orele', () => {
    const r = locuriFrecvente([
      oprire({ lat: 47.5, lng: 28.5, dwellMin: 120, vehicleId: 'v1', plate: 'AAA111' }),
      oprire({ lat: 47.5012, lng: 28.5008, dwellMin: 180, vehicleId: 'v2', plate: 'BBB222' }),
      oprire({ lat: 47.5005, lng: 28.5002, dwellMin: 60, vehicleId: 'v1', plate: 'AAA111' }),
    ], []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ vizite: 3, camioane: 2, oreTotal: 6 });
    expect(r[0].placi).toEqual(['AAA111', 'BBB222']);
  });

  it('locurile deja în nomenclator NU se propun din nou', () => {
    const r = locuriFrecvente(
      [oprire(), oprire({ arrivalAt: '2026-08-21T08:00:00Z' })],
      [punct()],
    );
    expect(r).toEqual([]);
  });

  it('o singură vizită nu e încă un loc — prag implicit 2', () => {
    expect(locuriFrecvente([oprire({ lat: 46.1, lng: 27.1 })], [])).toEqual([]);
  });

  it('sugestia de nume e localitatea cea mai frecventă din grup', () => {
    const r = locuriFrecvente([
      oprire({ lat: 45.2, lng: 27.2, locality: 'Giurgiulești' }),
      oprire({ lat: 45.2001, lng: 27.2001, locality: 'Giurgiulești' }),
      oprire({ lat: 45.2002, lng: 27.2002, locality: 'Cahul' }),
    ], []);
    expect(r[0].sugestie).toBe('Giurgiulești');
  });

  it('ordinea e după orele de staționare — cel mai important loc primul', () => {
    const r = locuriFrecvente([
      oprire({ lat: 44.1, lng: 28.6, dwellMin: 60, locality: 'Constanța' }),
      oprire({ lat: 44.1001, lng: 28.6001, dwellMin: 60, locality: 'Constanța' }),
      oprire({ lat: 50.9, lng: 28.6, dwellMin: 600, locality: 'Berdichev', vehicleId: 'v2' }),
      oprire({ lat: 50.9001, lng: 28.6001, dwellMin: 600, locality: 'Berdichev', vehicleId: 'v3' }),
    ], []);
    expect(r.map((x) => x.sugestie)).toEqual(['Berdichev', 'Constanța']);
  });

  it('un loc mare rupt de marginea grilei rămâne UN singur rând (portul Constanța)', () => {
    // Cazul real, 01.09: portul apărea ca 4 locuri diferite, la câteva sute de metri.
    const r = locuriFrecvente([
      oprire({ lat: 44.1312, lng: 28.6163, vehicleId: 'v1', plate: 'AAA111' }),
      oprire({ lat: 44.1302, lng: 28.6197, vehicleId: 'v2', plate: 'BBB222' }),
      oprire({ lat: 44.1330, lng: 28.6239, vehicleId: 'v3', plate: 'CCC333' }),
    ], []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ vizite: 3, camioane: 3 });
  });

  it('două locuri chiar diferite NU se contopesc', () => {
    const r = locuriFrecvente([
      oprire({ lat: 44.13, lng: 28.61, vehicleId: 'v1' }),
      oprire({ lat: 44.13, lng: 28.61, vehicleId: 'v2' }),
      oprire({ lat: 49.88, lng: 28.54, vehicleId: 'v3' }),
      oprire({ lat: 49.88, lng: 28.54, vehicleId: 'v4' }),
    ], []);
    expect(r).toHaveLength(2);
  });

  it('o singură oprire LUNGĂ e totuși un loc — uzina străină vizitată rar', () => {
    const r = locuriFrecvente([oprire({ lat: 49.88, lng: 28.54, dwellMin: 20 * 60, locality: 'Berdichev' })], []);
    expect(r).toHaveLength(1);
    expect(r[0].sugestie).toBe('Berdichev');
  });

  it('raza sugerată acoperă întinderea locului, nu constanta 500', () => {
    // Port: opriri răsfirate pe ~700 m. Cu 500 m fix, jumătate rămânea în afară.
    const r = locuriFrecvente([
      oprire({ lat: 44.1312, lng: 28.6163, vehicleId: 'v1' }),
      oprire({ lat: 44.1302, lng: 28.6197, vehicleId: 'v2' }),
      oprire({ lat: 44.1330, lng: 28.6239, vehicleId: 'v3' }),
    ], []);
    expect(r[0].razaSugerata).toBeGreaterThan(500);
    expect(r[0].razaSugerata).toBeLessThanOrEqual(3000);
  });

  it('un loc mic primește raza minimă, nu una de câțiva metri', () => {
    const r = locuriFrecvente([
      oprire({ lat: 47.5, lng: 28.5, vehicleId: 'v1' }),
      oprire({ lat: 47.5001, lng: 28.5001, vehicleId: 'v2' }),
    ], []);
    expect(r[0].razaSugerata).toBe(300);
  });

  it('stația de peste drum NU se lipește de bază (contopire strânsă)', () => {
    // Două locuri la ~1,2 km: la pragul vechi de 1,5 km deveneau un singur rând.
    const r = locuriFrecvente([
      oprire({ lat: 47.500, lng: 28.500, vehicleId: 'v1' }),
      oprire({ lat: 47.500, lng: 28.500, vehicleId: 'v2' }),
      oprire({ lat: 47.500, lng: 28.516, vehicleId: 'v3' }),
      oprire({ lat: 47.500, lng: 28.516, vehicleId: 'v4' }),
    ], []);
    expect(r).toHaveLength(2);
  });

  it('centrul rămâne al celulei dense, nu pleacă spre opririle lipite', () => {
    // 3 opriri într-o celulă + 1 alăturată: centrul nu trebuie tras de cea singură.
    const r = locuriFrecvente([
      oprire({ lat: 47.5000, lng: 28.5000, vehicleId: 'v1' }),
      oprire({ lat: 47.5001, lng: 28.5001, vehicleId: 'v2' }),
      oprire({ lat: 47.5002, lng: 28.5002, vehicleId: 'v3' }),
      oprire({ lat: 47.5040, lng: 28.5045, vehicleId: 'v4' }),
    ], []);
    expect(r).toHaveLength(1);
    expect(r[0].lat).toBeCloseTo(47.5001, 3);
  });

  it('coordonatele lipsă nu strică gruparea', () => {
    const r = locuriFrecvente([
      oprire({ lat: NaN, lng: 28.5 }),
      oprire({ lat: 47.5, lng: 28.5 }),
      oprire({ lat: 47.5001, lng: 28.5001 }),
    ], []);
    expect(r).toHaveLength(1);
    expect(r[0].vizite).toBe(2);
  });
});
