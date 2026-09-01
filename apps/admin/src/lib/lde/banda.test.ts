import { describe, it, expect } from 'vitest';
import {
  segmentInFereastra, progresCursa, aIntarziat, camioaneInBanda, grupeazaPeTip, mutaPastrandDurata,
  asazaInBenzi,
} from './banda';

const ZILE = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05'];
const cam = (p: Partial<Parameters<typeof camioaneInBanda>[0][number]> = {}) => ({
  id: 'v1', plate: 'ANT344', fleetType: null, driverId: 'd1', driverName: 'Ion', ...p,
});

describe('segmentInFereastra', () => {
  it('cursa de o zi ocupă o coloană', () => {
    expect(segmentInFereastra('2026-09-02T06:00:00+03:00', '2026-09-02T18:00:00+03:00', ZILE))
      .toEqual({ start: 1, span: 1, taiatStanga: false, taiatDreapta: false });
  });

  it('cursa multi-zi ocupă toate zilele ei', () => {
    expect(segmentInFereastra('2026-09-01T07:00:00+03:00', '2026-09-03T14:00:00+03:00', ZILE))
      .toEqual({ start: 0, span: 3, taiatStanga: false, taiatDreapta: false });
  });

  it('cursa începută înaintea ferestrei se retează la stânga', () => {
    const s = segmentInFereastra('2026-08-29T07:00:00+03:00', '2026-09-02T14:00:00+03:00', ZILE);
    expect(s).toMatchObject({ start: 0, span: 2, taiatStanga: true, taiatDreapta: false });
  });

  it('cursa care depășește fereastra se retează la dreapta', () => {
    const s = segmentInFereastra('2026-09-04T07:00:00+03:00', '2026-09-12T14:00:00+03:00', ZILE);
    expect(s).toMatchObject({ start: 3, span: 2, taiatStanga: false, taiatDreapta: true });
  });

  it('cursa care înghite toată fereastra se retează la ambele capete', () => {
    expect(segmentInFereastra('2026-08-20T07:00:00+03:00', '2026-09-30T14:00:00+03:00', ZILE))
      .toEqual({ start: 0, span: 5, taiatStanga: true, taiatDreapta: true });
  });

  it('cursa din afara ferestrei nu se desenează', () => {
    expect(segmentInFereastra('2026-07-01T07:00:00+03:00', '2026-07-02T14:00:00+03:00', ZILE)).toBeNull();
    expect(segmentInFereastra('2026-10-01T07:00:00+03:00', '2026-10-02T14:00:00+03:00', ZILE)).toBeNull();
  });

  it('ziua e cea de la Chișinău, nu cea UTC', () => {
    // 23:30 pe 2 septembrie la Chișinău = 20:30 UTC. Citit din ISO ca UTC ar fi
    // tot ziua 2; dar 00:30 pe 3 septembrie local e 21:30 UTC pe 2 — acolo se rupea.
    const s = segmentInFereastra('2026-09-03T00:30:00+03:00', '2026-09-03T10:00:00+03:00', ZILE);
    expect(s).toMatchObject({ start: 2, span: 1 });
  });

  it('datele stricate nu desenează nimic', () => {
    expect(segmentInFereastra('nu-i data', '2026-09-02T10:00:00+03:00', ZILE)).toBeNull();
    expect(segmentInFereastra('2026-09-02T10:00:00+03:00', '2026-09-02T10:00:00+03:00', [])).toBeNull();
  });
});

describe('progresCursa', () => {
  const t0 = '2026-09-01T00:00:00Z';
  const t1 = '2026-09-03T00:00:00Z';

  it('la mijloc dă jumătate', () => {
    expect(progresCursa(t0, t1, Date.parse('2026-09-02T00:00:00Z'))).toBeCloseTo(.5, 5);
  });

  it('înainte de start dă 0, după final dă 1', () => {
    expect(progresCursa(t0, t1, Date.parse('2026-08-30T00:00:00Z'))).toBe(0);
    expect(progresCursa(t0, t1, Date.parse('2026-09-10T00:00:00Z'))).toBe(1);
  });

  it('intervalul inversat sau stricat nu dă NaN', () => {
    expect(progresCursa(t1, t0)).toBe(0);
    expect(progresCursa('x', t1)).toBe(0);
  });
});

describe('asazaInBenzi', () => {
  const s = (start: number, span: number) => ({
    seg: { start, span, taiatStanga: false, taiatDreapta: false },
  });

  it('cursele care nu se ating stau pe aceeași bandă', () => {
    const b = asazaInBenzi([s(0, 2), s(2, 1), s(4, 1)]);
    expect(b).toHaveLength(1);
    expect(b[0]).toHaveLength(3);
  });

  it('cursa care începe ÎN INTERIORUL alteia primește bandă proprie', () => {
    // Cazul real: cursa multi-zi 0→3 se întoarce dimineața, alta pleacă în ziua 3
    // după-amiaza. Ambele sunt legale în bază — ambele trebuie desenate.
    const b = asazaInBenzi([s(0, 4), s(3, 1)]);
    expect(b).toHaveLength(2);
    expect(b[0]).toHaveLength(1);
    expect(b[1]).toHaveLength(1);
  });

  it('două curse care încep în aceeași zi nu se ascund una pe alta', () => {
    const b = asazaInBenzi([s(1, 1), s(1, 2)]);
    expect(b.flat()).toHaveLength(2);
    expect(b).toHaveLength(2);
  });

  it('trei suprapuneri dau trei benzi, dar a patra reintră pe prima liberă', () => {
    const b = asazaInBenzi([s(0, 3), s(1, 3), s(2, 3), s(4, 1)]);
    expect(b).toHaveLength(3);
    expect(b[0]).toHaveLength(2); // 0→3 și apoi 4
  });

  it('lista goală nu produce benzi', () => {
    expect(asazaInBenzi([])).toEqual([]);
  });
});

describe('aIntarziat', () => {
  const trecut = '2026-09-01T10:00:00Z';
  const acum = Date.parse('2026-09-02T10:00:00Z');

  it('cursa deschisă peste ora de descărcare e întârziată', () => {
    // Stările sunt cele reale din TRIP_FLOW, nu literale inventate.
    expect(aIntarziat(trecut, 'spre_descarcare', acum)).toBe(true);
    expect(aIntarziat(trecut, 'planificata', acum)).toBe(true);
  });

  it('camionul aflat sub descărcare peste ora planificată e tot întârziat', () => {
    // Decizia: dacă stă la descărcare peste plan, întârzierea e reală.
    expect(aIntarziat(trecut, 'la_descarcare', acum)).toBe(true);
  });

  it('cursa încheiată sau anulată nu e întârziată, oricât ar fi trecut', () => {
    expect(aIntarziat(trecut, 'incheiata', acum)).toBe(false);
    expect(aIntarziat(trecut, 'anulata', acum)).toBe(false);
  });

  it('cursa cu descărcarea în viitor nu e întârziată', () => {
    expect(aIntarziat('2026-09-05T10:00:00Z', 'in_cursa', acum)).toBe(false);
  });
});

describe('camioaneInBanda', () => {
  it('camionul fără șofer nu are rând', () => {
    const r = camioaneInBanda([cam({ id: 'v1' }), cam({ id: 'v2', driverId: null, driverName: null })], []);
    expect(r.map((x) => x.id)).toEqual(['v1']);
  });

  it('dar rămâne dacă are o cursă în fereastră, chiar fără niciun șofer', () => {
    // Altfel bara devine invizibilă, iar constrângerea din bază o vede în
    // continuare: dispecerul primește «are deja o cursă» și nu găsește unde.
    const r = camioaneInBanda(
      [cam({ id: 'v2', driverId: null, driverName: null })],
      [{ vehicleId: 'v2' }],
    );
    expect(r).toHaveLength(1);
  });

  it('camionul fără șofer și fără curse rămâne în afara benzii', () => {
    const r = camioaneInBanda(
      [cam({ id: 'v2', driverId: null, driverName: null })],
      [{ vehicleId: 'altul' }],
    );
    expect(r).toEqual([]);
  });
});

describe('grupeazaPeTip', () => {
  it('grupează în ordinea cisterne, zernovoz, fără tip și sare grupurile goale', () => {
    const g = grupeazaPeTip([
      cam({ id: 'a', fleetType: 'zernovoz' }),
      cam({ id: 'b', fleetType: 'cisterna' }),
      cam({ id: 'c', fleetType: null }),
    ]);
    expect(g.map((x) => x.cheie)).toEqual(['cisterna', 'zernovoz', 'fara_tip']);
    expect(grupeazaPeTip([cam({ fleetType: 'cisterna' })]).map((x) => x.cheie)).toEqual(['cisterna']);
  });
});

describe('mutaPastrandDurata', () => {
  it('mută începutul și păstrează durata și ora din zi', () => {
    const r = mutaPastrandDurata('2026-09-01T06:00:00+03:00', '2026-09-03T14:00:00+03:00', '2026-09-05');
    expect(r).not.toBeNull();
    expect(new Date(r!.load).toISOString()).toBe('2026-09-05T03:00:00.000Z'); // 06:00 la Chișinău
    expect(Date.parse(r!.unload) - Date.parse(r!.load)).toBe(
      Date.parse('2026-09-03T14:00:00+03:00') - Date.parse('2026-09-01T06:00:00+03:00'),
    );
  });

  it('mutarea pe aceeași zi nu schimbă nimic', () => {
    const r = mutaPastrandDurata('2026-09-01T06:00:00+03:00', '2026-09-03T14:00:00+03:00', '2026-09-01');
    expect(r).toEqual({ load: '2026-09-01T06:00:00+03:00', unload: '2026-09-03T14:00:00+03:00' });
  });

  it('datele stricate nu produc o mutare', () => {
    expect(mutaPastrandDurata('x', '2026-09-03T14:00:00+03:00', '2026-09-05')).toBeNull();
  });
});
