import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScheletCamioane } from './ScheletCamioaneClient';
import { camioaneLaToate } from './toate';

// ION-121: fila «Camioane» din /lde/schelet citește public/lde/schelet-camioane.json (scris de export-lde.mjs din ION-69).
const schelet = JSON.parse(readFileSync(path.join(__dirname, '../../../../../public/lde/schelet-camioane.json'), 'utf8')) as ScheletCamioane;

describe('schelet-camioane.json', () => {
  it('are motorina și biodieselul', () => {
    expect(schelet.motorina.length).toBeGreaterThan(0);
    expect(schelet.biodiesel.map((b) => b.id)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
  });

  it('fiecare traseu de motorină are idealul de bază printre variante, cu linie și km', () => {
    for (const r of schelet.motorina) {
      const ids = r.variante.map((v) => v.id);
      expect(ids, r.id).toContain(r.deBaza);
      expect(ids, r.id).toContain(r.deBazaDirect);
      for (const v of r.variante) {
        expect(v.linie.length, `${r.id} ${v.id}`).toBeGreaterThan(1);
        expect(v.km, `${r.id} ${v.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('vămile Costești și Ungheni/Sculeni nu apar (Ion, 28.09)', () => {
    const text = JSON.stringify([...schelet.motorina.map((r) => r.variante.map((v) => v.vama)), ...schelet.biodiesel.map((b) => b.vami)]);
    expect(text).not.toMatch(/Coste[sș]ti|Sculeni/);
  });

  it('terminalul de export doar pe traseele prin ZEL', () => {
    for (const b of schelet.biodiesel) expect(b.terminal, b.id).toBe(/ZEL/.test(b.vami));
  });
});

describe('camioaneLaToate', () => {
  it('pe harta comună e ascunsă implicit și nu intră în km cu oameni', () => {
    const [r] = camioaneLaToate(schelet);
    expect(r.ascunsaImplicit).toBe(true);
    expect(r.kmZi).toBe(0);
    expect(r.rute.length).toBe(schelet.motorina.length + schelet.biodiesel.length);
  });
});
