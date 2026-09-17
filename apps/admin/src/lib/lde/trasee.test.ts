import { describe, it, expect } from 'vitest';
import { costPereche, costZi, propuneriSchimb, propuneriComasare, propuneriAngajare, economieCumulata, haversineKm, type RutaCost, type SoferCurent } from './trasee';

const ruta = (id: string, lat: number, lon: number): RutaCost => ({
  factory_route_id: id, eticheta: `ruta ${id}`,
  primaStatie: { lat, lon }, ultimaStatie: { lat, lon },
});

describe('costul unei perechi șofer↔rută', () => {
  it('e dusul + întorsul de acasă la prima stație', () => {
    const c = costPereche({ lat: 47.0, lon: 28.0 }, ruta('A', 47.09, 28.0));
    expect(c).toBeCloseTo(2 * haversineKm({ lat: 47, lon: 28 }, { lat: 47.09, lon: 28 }), 1);
  });

  it('fără bază sau fără etalon → null, NU o estimare inventată', () => {
    expect(costPereche(null, ruta('A', 47, 28))).toBeNull();
    expect(costPereche({ lat: 47, lon: 28 }, { ...ruta('A', 47, 28), primaStatie: null })).toBeNull();
  });
});

describe('propunerile de schimb', () => {
  const rute = new Map([['A', ruta('A', 47.5, 28.0)], ['B', ruta('B', 47.0, 28.0)]]);

  it('găsește schimbul evident: fiecare e pe ruta celuilalt', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: { lat: 47.0, lon: 28.0 }, rute: ['A'] },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, rute: ['B'] },
    ];
    const p = propuneriSchimb(soferi, rute);
    expect(p).toHaveLength(1);
    expect(p[0].economie_km_zi).toBeGreaterThan(100);
    expect(p[0].a.pe).toBe('ruta B');
  });

  it('nu propune nimic când fiecare e deja pe ruta lui', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: { lat: 47.0, lon: 28.0 }, rute: ['B'] },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, rute: ['A'] },
    ];
    expect(propuneriSchimb(soferi, rute)).toHaveLength(0);
  });

  it('sare perechea unde o singură latură e necunoscută', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: null, rute: ['A'] },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, rute: ['B'] },
    ];
    expect(propuneriSchimb(soferi, rute)).toHaveLength(0);
  });

  it('economia cumulată nu folosește același șofer de două ori', () => {
    const rute3 = new Map([...rute, ['C', ruta('C', 48.0, 28.0)]]);
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Unu', baza: { lat: 47.0, lon: 28.0 }, rute: ['A'] },
      { driver_id: 's2', nume: 'Doi', baza: { lat: 47.5, lon: 28.0 }, rute: ['B'] },
      { driver_id: 's3', nume: 'Trei', baza: { lat: 48.0, lon: 28.0 }, rute: ['C'] },
    ];
    const { aplicabile } = economieCumulata(propuneriSchimb(soferi, rute3));
    const ids = aplicabile.flatMap((p) => [p.a.driver_id, p.b.driver_id]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('costul cere AMBELE capete (defect găsit 17.09, perechea Popescu–Pangalos)', () => {
  it('ruta fără etalon de retur nu primește jumătate de formulă', () => {
    const doarTur: RutaCost = { factory_route_id: 'X', eticheta: 'X', primaStatie: { lat: 47.1, lon: 28.6 }, ultimaStatie: null };
    expect(costPereche({ lat: 47.5, lon: 28.8 }, doarTur)).toBeNull();
  });

  it('nu se compară o rută socotită „2 × dus" cu una socotită „dus + întors"', () => {
    // ruta A: dusul lung, întorsul scurt; ruta B: simetrică. Cu vechea formulă (dublarea
    // dusului când lipsea returul), A ar fi ieșit artificial scumpă și schimbul propus greșit.
    const A: RutaCost = { factory_route_id: 'A', eticheta: 'A', primaStatie: { lat: 47.9, lon: 28.0 }, ultimaStatie: { lat: 47.05, lon: 28.0 } };
    const B: RutaCost = { factory_route_id: 'B', eticheta: 'B', primaStatie: { lat: 47.2, lon: 28.0 }, ultimaStatie: { lat: 47.2, lon: 28.0 } };
    const baza = { lat: 47.0, lon: 28.0 };
    const cA = costPereche(baza, A)!, cB = costPereche(baza, B)!;
    // A = 100 km dus + 5,5 km întors ≈ 105; B = 22 + 22 = 44. Ambele pe aceeași formulă.
    expect(cA).toBeGreaterThan(cB);
    expect(cA).toBeLessThan(2 * haversineKm(baza, A.primaStatie!));
  });
});


describe('ziua întreagă, cu întoarcerea dintre ture (Ion, 17.09)', () => {
  // Două zone la 60 km una de alta, pe aceeași uzină. Tura 1 pleacă din zona de nord,
  // tura 2 din zona de sud. Un șofer face amândouă turele.
  // zonele NU sunt pe aceeasi linie: una la nord, alta la est. Pe o linie, suma
  // distantelor pana la doua puncte e aceeasi oriunde intre ele, deci mijlocul ar iesi
  // doar la egalitate — asa arata si realitatea: satele nu stau insirate.
  const nord: RutaCost = { factory_route_id: 'N', eticheta: 'nord', primaStatie: { lat: 47.8, lon: 28.0 }, ultimaStatie: { lat: 47.8, lon: 28.0 } };
  const sud: RutaCost = { factory_route_id: 'S', eticheta: 'est', primaStatie: { lat: 47.4, lon: 28.8 }, ultimaStatie: { lat: 47.4, lon: 28.8 } };
  const rute = new Map([['N', nord], ['S', sud]]);

  it('cu DOUĂ ture, tot coridorul dintre zone e la fel de bun — și mai bun decât în lateral', () => {
    // Geometria e neînduplecată: suma distanțelor până la două puncte e ACEEAȘI oriunde
    // pe linia dintre ele. Deci satul din mijloc nu bate satul din zonă — îl EGALEAZĂ.
    // Ce bate: orice sat aflat în afara coridorului. Asta e forma exactă a intuiției lui
    // Ion, și e tot utilă — mulțimea șoferilor potriviți e coridorul întreg, nu doar cele
    // două capete.
    const laNord = costZi({ lat: 47.8, lon: 28.0 }, [nord, sud])!;
    const laMijloc = costZi({ lat: 47.6, lon: 28.4 }, [nord, sud])!;
    const inLateral = costZi({ lat: 47.2, lon: 28.1 }, [nord, sud])!;
    expect(Math.abs(laMijloc - laNord)).toBeLessThan(0.5);
    expect(inLateral).toBeGreaterThan(laMijloc + 10);
  });

  it('cu TREI ture în direcții diferite, mijlocul câștigă STRICT (cazul Orhei)', () => {
    const vest: RutaCost = { factory_route_id: 'V', eticheta: 'vest', primaStatie: { lat: 47.4, lon: 27.6 }, ultimaStatie: { lat: 47.4, lon: 27.6 } };
    const laNord = costZi({ lat: 47.8, lon: 28.0 }, [nord, sud, vest])!;
    const laMijloc = costZi({ lat: 47.53, lon: 28.13 }, [nord, sud, vest])!;
    expect(laMijloc).toBeLessThan(laNord);
  });

  it('a doua tură își adaugă propriul dus-întors, nu se lipește de prima', () => {
    const doarTura1 = costZi({ lat: 47.8, lon: 28.0 }, [nord])!;
    const ambele = costZi({ lat: 47.8, lon: 28.0 }, [nord, sud])!;
    expect(ambele).toBeGreaterThan(doarTura1 + 100);
  });

  it('propune schimbul care apropie fiecare șofer de ziua lui', () => {
    const soferi: SoferCurent[] = [
      { driver_id: 's1', nume: 'Nordicul', baza: { lat: 47.8, lon: 28.0 }, rute: ['S'] },
      { driver_id: 's2', nume: 'Sudicul', baza: { lat: 47.26, lon: 28.0 }, rute: ['N'] },
    ];
    const p = propuneriSchimb(soferi, rute);
    expect(p).toHaveLength(1);
    expect(p[0].a.pe).toBe('nord');
  });

  it('o rută cu un capăt necunoscut strică toată ziua, nu doar bucata ei', () => {
    const stricata: RutaCost = { ...sud, ultimaStatie: null };
    expect(costZi({ lat: 47.5, lon: 28.0 }, [nord, stricata])).toBeNull();
  });
});


describe('zona servită de doi șoferi de departe (Ion, 17.09)', () => {
  // Două rute din ACEEAȘI zonă (sate la 3 km una de alta), ture diferite, doi șoferi care
  // locuiesc amândoi departe. Schimbul între ei nu rezolvă nimic — niciunul nu stă acolo.
  const r1: RutaCost = { factory_route_id: 'R1', eticheta: 'ruta 1', primaStatie: { lat: 47.40, lon: 28.00 }, ultimaStatie: { lat: 47.40, lon: 28.00 } };
  const r2: RutaCost = { factory_route_id: 'R2', eticheta: 'ruta 2', primaStatie: { lat: 47.43, lon: 28.00 }, ultimaStatie: { lat: 47.43, lon: 28.00 } };
  const rute = new Map([['R1', r1], ['R2', r2]]);
  const ture = new Map([['R1', 1], ['R2', 2]]);
  const soferi: SoferCurent[] = [
    { driver_id: 'd1', nume: 'Unu', baza: { lat: 47.80, lon: 28.0 }, rute: ['R1'] },   // ~44 km nord
    { driver_id: 'd2', nume: 'Doi', baza: { lat: 47.85, lon: 28.0 }, rute: ['R2'] },   // ~50 km nord
  ];

  it('propune comasarea: unul ia ambele ture, celălalt se eliberează', () => {
    const p = propuneriComasare(soferi, rute, ture);
    expect(p).toHaveLength(1);
    expect(p[0].ramane.nume).toBe('Unu');          // e mai aproape
    expect(p[0].se_elibereaza.nume).toBe('Doi');
    expect(p[0].economie_km_zi).toBeGreaterThan(50);
  });

  it('NU propune comasarea când turele se suprapun', () => {
    const acelasiSchimb = new Map([['R1', 1], ['R2', 1]]);
    expect(propuneriComasare(soferi, rute, acelasiSchimb)).toHaveLength(0);
  });

  it('propune angajarea locală și spune cât s-ar tăia', () => {
    const p = propuneriAngajare(soferi, rute);
    expect(p).toHaveLength(1);
    expect(p[0].km_daca_local).toBeLessThan(p[0].km_acum);
    expect(p[0].economie_km_zi).toBeGreaterThan(150);   // doi șoferi × ~45 km dus-întors
    expect(p[0].soferi_acum.sort()).toEqual(['Doi', 'Unu']);
  });

  it('nu propune angajare unde șoferii stau deja în zonă', () => {
    const local: SoferCurent[] = [
      { driver_id: 'd1', nume: 'Unu', baza: { lat: 47.40, lon: 28.0 }, rute: ['R1'] },
      { driver_id: 'd2', nume: 'Doi', baza: { lat: 47.43, lon: 28.0 }, rute: ['R2'] },
    ];
    expect(propuneriAngajare(local, rute)).toHaveLength(0);
  });
});
