// Teste pentru utilitarele geo LDE (haversine + etichetare sate).
// Regulile (etalon din GPS, sate = etichete, NU rutăm prin centre) sunt documentate
// în lde-geo-rules.ts — testăm aici doar helperele pure.
import { describe, it, expect } from 'vitest';
import { haversineKm, labelVillagesAlong, LDE_GEO_VILLAGE_PROXIMITY_KM } from './lde-geo-rules.js';

describe('haversineKm', () => {
  it('punct identic = 0', () => {
    expect(haversineKm([47.0, 28.8], [47.0, 28.8])).toBe(0);
  });
  it('Halahora de Sus → Mărcăuți ≈ 7.2 km linie dreaptă (verificat OSM)', () => {
    const d = haversineKm([48.2531, 27.1827], [48.3114, 27.2259]);
    expect(d).toBeGreaterThan(6.8);
    expect(d).toBeLessThan(7.6);
  });
});

describe('labelVillagesAlong (sate = etichete, Regula 3)', () => {
  const places = [
    { name: 'Halahora de Sus', lat: 48.2531, lon: 27.1827 },
    { name: 'Bălcăuți', lat: 48.2837, lon: 27.2023 },
    { name: 'Mărcăuți', lat: 48.3114, lon: 27.2259 },
    { name: 'Departe', lat: 47.0, lon: 28.8 },
  ];
  it('etichetează satele aproape de urmă, în ordine, deduplicate', () => {
    const trace: Array<[number, number]> = [
      [48.2531, 27.1827], // Halahora
      [48.2531, 27.1827], // dublură → ignorată
      [48.2837, 27.2023], // Bălcăuți
      [48.3114, 27.2259], // Mărcăuți
    ];
    expect(labelVillagesAlong(trace, places)).toEqual(['Halahora de Sus', 'Bălcăuți', 'Mărcăuți']);
  });
  it('NU etichetează satele dincolo de prag', () => {
    const trace: Array<[number, number]> = [[48.2531, 27.1827]]; // doar lângă Halahora
    const out = labelVillagesAlong(trace, places, LDE_GEO_VILLAGE_PROXIMITY_KM);
    expect(out).toEqual(['Halahora de Sus']);
    expect(out).not.toContain('Departe');
  });
});
