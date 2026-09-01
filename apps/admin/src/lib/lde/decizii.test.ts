import { describe, it, expect } from 'vitest';
import { incrucisari, mesajIncrucisare, type CursaDeAnalizat } from './decizii';

// Coordonate reale din nomenclator, ca scenariul lui Ion să fie chiar al lui.
const BALTI = { lat: 47.7699, lng: 27.9236 };
const CHISINAU = { lat: 47.0126, lng: 28.8899 };
const CONSTANTA = { lat: 44.1312, lng: 28.6163 };
const BERDICHEV = { lat: 49.8851, lng: 28.5439 };

const c = (p: Partial<CursaDeAnalizat>): CursaDeAnalizat => ({
  id: 'c1', vehicleId: 'v1', plate: 'AAA111',
  plecare: BALTI, incarcare: CONSTANTA, incarcareNume: 'Port Constanța',
  loadPlannedAt: '2026-09-10T06:00:00+03:00', fleetType: 'cisterna', sofer: null, ...p,
});

describe('incrucisari', () => {
  it('cazul lui Ion: Bălți → Constanța și Chișinău → Berdichev', () => {
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plate: 'BALTI01', plecare: BALTI, incarcare: CONSTANTA, incarcareNume: 'Port Constanța' }),
      c({ id: 'b', vehicleId: 'v2', plate: 'CHIS01', plecare: CHISINAU, incarcare: BERDICHEV, incarcareNume: 'Bază Berdichev' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].kmEconomisiti).toBeGreaterThan(100);
    expect([r[0].a.plate, r[0].b.plate].sort()).toEqual(['BALTI01', 'CHIS01']);
  });

  it('atribuirea corectă nu produce nicio alertă', () => {
    // Bălți la Berdichev (nord), Chișinău la Constanța (sud) — cum trebuie.
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plate: 'BALTI01', plecare: BALTI, incarcare: BERDICHEV, incarcareNume: 'Bază Berdichev' }),
      c({ id: 'b', vehicleId: 'v2', plate: 'CHIS01', plecare: CHISINAU, incarcare: CONSTANTA, incarcareNume: 'Port Constanța' }),
    ]);
    expect(r).toEqual([]);
  });

  it('o diferență mică nu e o greșeală — pragul taie zgomotul', () => {
    const aproape = { lat: 47.0130, lng: 28.8905 };
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plecare: CHISINAU, incarcare: CONSTANTA }),
      c({ id: 'b', vehicleId: 'v2', plecare: aproape, incarcare: BERDICHEV }),
    ]);
    expect(r).toEqual([]);
  });

  it('cisterna nu se schimbă cu zernovozul', () => {
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plecare: BALTI, incarcare: CONSTANTA, fleetType: 'cisterna' }),
      c({ id: 'b', vehicleId: 'v2', plecare: CHISINAU, incarcare: BERDICHEV, fleetType: 'zernovoz' }),
    ]);
    expect(r).toEqual([]);
  });

  it('dar dacă tipul nu e stabilit, perechea se compară', () => {
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plate: 'X1', plecare: BALTI, incarcare: CONSTANTA, fleetType: null }),
      c({ id: 'b', vehicleId: 'v2', plate: 'X2', plecare: CHISINAU, incarcare: BERDICHEV, fleetType: 'cisterna' }),
    ]);
    expect(r).toHaveLength(1);
  });

  it('fără coordonate nu se inventează o alertă', () => {
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plecare: null, incarcare: CONSTANTA }),
      c({ id: 'b', vehicleId: 'v2', plecare: CHISINAU, incarcare: BERDICHEV }),
    ]);
    expect(r).toEqual([]);
  });

  it('același camion nu se compară cu el însuși', () => {
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plecare: BALTI, incarcare: CONSTANTA }),
      c({ id: 'b', vehicleId: 'v1', plecare: CHISINAU, incarcare: BERDICHEV }),
    ]);
    expect(r).toEqual([]);
  });

  it('o cursă intră într-o SINGURĂ pereche — altfel totalul se dublează', () => {
    // Un camion din Bălți și DOUĂ din Chișinău: cursa din Bălți se potrivește cu
    // amândouă, dar schimbul se poate face o singură dată.
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plate: 'A', plecare: BALTI, incarcare: CONSTANTA }),
      c({ id: 'b', vehicleId: 'v2', plate: 'B', plecare: CHISINAU, incarcare: BERDICHEV }),
      c({ id: 'd', vehicleId: 'v4', plate: 'D', plecare: CHISINAU, incarcare: BERDICHEV }),
    ]);
    expect(r).toHaveLength(1);
    const ids = r.flatMap((x) => [x.a.cursaId, x.b.cursaId]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('două încrucișări independente rămân amândouă', () => {
    const r = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plate: 'A', plecare: BALTI, incarcare: CONSTANTA }),
      c({ id: 'b', vehicleId: 'v2', plate: 'B', plecare: CHISINAU, incarcare: BERDICHEV }),
      c({ id: 'e', vehicleId: 'v5', plate: 'E', plecare: BALTI, incarcare: CONSTANTA }),
      c({ id: 'f', vehicleId: 'v6', plate: 'F', plecare: CHISINAU, incarcare: BERDICHEV }),
    ]);
    expect(r).toHaveLength(2);
    const ids = r.flatMap((x) => [x.a.cursaId, x.b.cursaId]);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('mesajIncrucisare', () => {
  it('lista goală nu produce mesaj — nu se trimite alertă degeaba', () => {
    expect(mesajIncrucisare('2026-09-10', [])).toBe('');
  });

  it('mesajul spune plăcuța, destinația și cât costă', () => {
    const lista = incrucisari([
      c({ id: 'a', vehicleId: 'v1', plate: 'BALTI01', plecare: BALTI, incarcare: CONSTANTA, incarcareNume: 'Port Constanța' }),
      c({ id: 'b', vehicleId: 'v2', plate: 'CHIS01', plecare: CHISINAU, incarcare: BERDICHEV, incarcareNume: 'Bază Berdichev' }),
    ]);
    const m = mesajIncrucisare('2026-09-10', lista);
    expect(m).toContain('BALTI01');
    expect(m).toContain('Bază Berdichev');
    expect(m).toContain('km goi');
  });
});
