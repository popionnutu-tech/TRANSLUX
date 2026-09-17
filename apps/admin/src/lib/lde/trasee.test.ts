import { describe, it, expect } from 'vitest';
import { costPereche, costZi, propuneriSchimb, propuneriComasare, propuneriAngajare, economieCumulata, haversineKm, seSuprapun, PRAG_OM_NOU_KM_ZI, type RutaCost, type SoferCurent } from './trasee';

const ruta = (id: string, lat: number, lon: number): RutaCost => ({
  factory_route_id: id, eticheta: `ruta ${id}`,
  primaStatie: { lat, lon }, ultimaStatie: { lat, lon }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1,
});

describe('costul unei perechi șofer↔rută', () => {
  it('e dusul + întorsul de acasă la prima stație', () => {
    const c = costPereche({ lat: 47.0, lon: 28.0 }, ruta('A', 47.09, 28.0));
    expect(c).toBeCloseTo(2 * haversineKm({ lat: 47, lon: 28 }, { lat: 47.09, lon: 28 }), 1);
  });

  it('fără bază sau fără etalon → null, NU o estimare inventată', () => {
    expect(costPereche(null, ruta('A', 47, 28))).toBeNull();
    expect(costPereche({ lat: 47, lon: 28 }, { ...ruta('A', 47, 28), primaStatie: null, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 })).toBeNull();
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
    const doarTur: RutaCost = { factory_route_id: 'X', eticheta: 'X', primaStatie: { lat: 47.1, lon: 28.6 }, ultimaStatie: null, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
    expect(costPereche({ lat: 47.5, lon: 28.8 }, doarTur)).toBeNull();
  });

  it('nu se compară o rută socotită „2 × dus" cu una socotită „dus + întors"', () => {
    // ruta A: dusul lung, întorsul scurt; ruta B: simetrică. Cu vechea formulă (dublarea
    // dusului când lipsea returul), A ar fi ieșit artificial scumpă și schimbul propus greșit.
    const A: RutaCost = { factory_route_id: 'A', eticheta: 'A', primaStatie: { lat: 47.9, lon: 28.0 }, ultimaStatie: { lat: 47.05, lon: 28.0 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
    const B: RutaCost = { factory_route_id: 'B', eticheta: 'B', primaStatie: { lat: 47.2, lon: 28.0 }, ultimaStatie: { lat: 47.2, lon: 28.0 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
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
  const nord: RutaCost = { factory_route_id: 'N', eticheta: 'nord', primaStatie: { lat: 47.8, lon: 28.0 }, ultimaStatie: { lat: 47.8, lon: 28.0 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
  const sud: RutaCost = { factory_route_id: 'S', eticheta: 'est', primaStatie: { lat: 47.4, lon: 28.8 }, ultimaStatie: { lat: 47.4, lon: 28.8 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
  const rute = new Map([['N', nord], ['S', sud]]);

  it('cu poarta în formulă, satul dintre zone câștigă STRICT — intuiția lui Ion se confirmă', () => {
    // Înainte de reparație, cu doar două ancore (prima și ultima stație), suma
    // distanțelor era aceeași oriunde pe linia dintre ele: mijlocul doar EGALA capetele.
    // Acum poarta e a treia ancoră, iar geometria se schimbă: mijlocul e strict mai bun.
    // Adică exact ce spunea Ion pe 17.09, și ce nu puteam confirma cu modelul vechi.
    const laNord = costZi({ lat: 47.8, lon: 28.0 }, [nord, sud])!;
    const laMijloc = costZi({ lat: 47.6, lon: 28.4 }, [nord, sud])!;
    const inLateral = costZi({ lat: 47.2, lon: 28.1 }, [nord, sud])!;
    expect(laMijloc).toBeLessThan(laNord);
    expect(inLateral).toBeGreaterThan(laMijloc);
  });

  it('cu TREI ture în direcții diferite, mijlocul câștigă STRICT (cazul Orhei)', () => {
    const vest: RutaCost = { factory_route_id: 'V', eticheta: 'vest', primaStatie: { lat: 47.4, lon: 27.6 }, ultimaStatie: { lat: 47.4, lon: 27.6 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
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
    const stricata: RutaCost = { ...sud, ultimaStatie: null, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
    expect(costZi({ lat: 47.5, lon: 28.0 }, [nord, stricata])).toBeNull();
  });
});


describe('zona servită de doi șoferi de departe (Ion, 17.09)', () => {
  // Două rute din ACEEAȘI zonă (sate la 3 km una de alta), ture diferite, doi șoferi care
  // locuiesc amândoi departe. Schimbul între ei nu rezolvă nimic — niciunul nu stă acolo.
  const r1: RutaCost = { factory_route_id: 'R1', eticheta: 'ruta 1', primaStatie: { lat: 47.40, lon: 28.00 }, ultimaStatie: { lat: 47.40, lon: 28.00 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
  const r2: RutaCost = { factory_route_id: 'R2', eticheta: 'ruta 2', primaStatie: { lat: 47.43, lon: 28.00 }, ultimaStatie: { lat: 47.43, lon: 28.00 }, poarta: { lat: 47.38, lon: 28.82 }, ture: 1 };
  const rute = new Map([['R1', r1], ['R2', r2]]);
  const ture = new Map([
    ['R1', { de_la: 6 * 60, pana_la: 14 * 60 + 30 }],
    ['R2', { de_la: 16 * 60, pana_la: 23 * 60 + 30 }],
  ]);
  const soferi: SoferCurent[] = [
    { driver_id: 'd1', nume: 'Unu', baza: { lat: 47.80, lon: 28.0 }, rute: ['R1'] },   // ~44 km nord
    { driver_id: 'd2', nume: 'Doi', baza: { lat: 47.85, lon: 28.0 }, rute: ['R2'] },   // ~50 km nord
  ];

  it('propune comasarea: unul ia ambele ture, celălalt se eliberează', () => {
    const p = propuneriComasare(soferi, rute, ture);
    expect(p).toHaveLength(1);
    expect(p[0].ramane.nume).toBe('Unu');          // e mai aproape
    expect(p[0].se_elibereaza.nume).toBe('Doi');
    // economia e DIFERENȚA (cel rămas preia ruta), nu costul întreg al celui eliberat
    expect(p[0].economie_km_zi).toBeGreaterThan(5);
    expect(p[0].economie_km_zi).toBeLessThan(40);
  });

  it('NU propune comasarea când turele se calcă pe ceas', () => {
    const suprapuse = new Map([
      ['R1', { de_la: 6 * 60, pana_la: 14 * 60 + 30 }],
      ['R2', { de_la: 10 * 60, pana_la: 18 * 60 }],
    ]);
    expect(propuneriComasare(soferi, rute, suprapuse)).toHaveLength(0);
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


describe('reparațiile din 17.09, după cele trei runde de verificare', () => {
  const poarta = { lat: 47.38, lon: 28.82 };
  const ruta = (id: string, lat: number, lon: number, ture = 1): RutaCost => ({
    factory_route_id: id, eticheta: id,
    primaStatie: { lat, lon }, ultimaStatie: { lat, lon }, poarta, ture,
  });

  it('costul conține segmentul poartă ↔ acasă, care lipsea', () => {
    // un șofer care stă LA prima stație, dar departe de poartă, tot are km goi
    const laStatie = costZi({ lat: 47.0, lon: 28.0 }, [ruta('A', 47.0, 28.0)])!;
    const dusIntorsPoarta = 2 * haversineKm({ lat: 47.0, lon: 28.0 }, poarta);
    expect(laStatie).toBeGreaterThan(dusIntorsPoarta - 0.5);
  });

  it('ruta făcută de trei ori pe zi costă de trei ori', () => {
    const oData = costZi({ lat: 47.0, lon: 28.0 }, [ruta('A', 47.1, 28.1, 1)])!;
    const deTrei = costZi({ lat: 47.0, lon: 28.0 }, [ruta('A', 47.1, 28.1, 3)])!;
    expect(deTrei).toBeCloseTo(3 * oData, 1);
  });

  it('fără poartă nu se calculează nimic — nu se ghicește', () => {
    const faraPoarta = { ...ruta('A', 47.1, 28.1), poarta: null };
    expect(costZi({ lat: 47.0, lon: 28.0 }, [faraPoarta])).toBeNull();
  });

  it('comasarea raportează DIFERENȚA, nu costul celui eliberat', () => {
    // doi șoferi, ambii departe; cel rămas tot va conduce ruta celuilalt
    const r1 = ruta('R1', 47.40, 28.00), r2 = ruta('R2', 47.43, 28.00);
    const rute = new Map([['R1', r1], ['R2', r2]]);
    const ferestre = new Map([
      ['R1', { de_la: 6 * 60, pana_la: 14 * 60 + 30 }],
      ['R2', { de_la: 16 * 60, pana_la: 23 * 60 }],
    ]);
    const soferi: SoferCurent[] = [
      { driver_id: 'd1', nume: 'Unu', baza: { lat: 47.80, lon: 28.0 }, rute: ['R1'] },
      { driver_id: 'd2', nume: 'Doi', baza: { lat: 47.85, lon: 28.0 }, rute: ['R2'] },
    ];
    const p = propuneriComasare(soferi, rute, ferestre);
    expect(p).toHaveLength(1);
    // economia trebuie să fie MICĂ: cel rămas preia ruta, deci plătește aproape la fel
    const costDoi_R2 = costZi(soferi[1].baza, [r2])!;
    expect(p[0].economie_km_zi).toBeLessThan(costDoi_R2 * 0.5);
  });

  it('comasarea refuză turele care se calcă pe ceas, nu doar pe numărul schimbului', () => {
    const rute = new Map([['R1', ruta('R1', 47.40, 28.00)], ['R2', ruta('R2', 47.43, 28.00)]]);
    // schimburi DIFERITE ca număr, dar 14:30 = sfârșitul uneia și începutul celeilalte
    const lipite = new Map([
      ['R1', { de_la: 6 * 60, pana_la: 14 * 60 + 30 }],
      ['R2', { de_la: 14 * 60 + 30, pana_la: 23 * 60 }],
    ]);
    const soferi: SoferCurent[] = [
      { driver_id: 'd1', nume: 'Unu', baza: { lat: 47.80, lon: 28.0 }, rute: ['R1'] },
      { driver_id: 'd2', nume: 'Doi', baza: { lat: 47.85, lon: 28.0 }, rute: ['R2'] },
    ];
    expect(propuneriComasare(soferi, rute, lipite)).toHaveLength(0);
  });

  it('granița comună nu e suprapunere, dar fără margine de drum ar fi', () => {
    const a = { de_la: 6 * 60, pana_la: 14 * 60 + 30 };
    const b = { de_la: 15 * 60 + 30, pana_la: 23 * 60 };
    expect(seSuprapun(a, b, 45)).toBe(false);
    expect(seSuprapun(a, { de_la: 14 * 60 + 30, pana_la: 23 * 60 }, 45)).toBe(true);
  });

  it('pragul „un om în plus" e scris, nu presupus', () => {
    expect(PRAG_OM_NOU_KM_ZI).toBe(100);
  });
});
