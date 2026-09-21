import { describe, it, expect } from 'vitest';
import { agregaLivrare, agregaBrambura, descrieZiua, perioadaCadentei, textulEconomiei, type CursaLivrare } from './livrare-poster';

const rute = [
  { id: 'r1', uzina_id: 'SEBN_STRASENI', route_number: 1, stops_in_order: 'Vatici → SEBN MD2 Strășeni' },
  { id: 'r2', uzina_id: 'SEBN_ORHEI', route_number: 7, stops_in_order: 'Lalova → SEBN MD' },
];
const cursa = (o: Partial<CursaLivrare>): CursaLivrare => ({
  run_date: '2026-09-07', factory_route_id: 'r1', vehicle_id: 'v1', sens: 'tur',
  km_real: 30, km_livrare: 0, km_brambura: 0, km_service: 0, km_gol_ruta: 0, ...o,
});

describe('agregaLivrare', () => {
  it('ține doar rutele cu livrare peste prag și scade brambura din livrare', () => {
    const curse = [
      cursa({ km_livrare: 70, km_brambura: 10 }),                  // luni: 60 net
      cursa({ sens: 'retur', km_livrare: 50, km_gol_ruta: 30 }),   // luni
      cursa({ run_date: '2026-09-08', km_livrare: 60 }),           // marți
      cursa({ factory_route_id: 'r2', vehicle_id: 'v2', km_livrare: 5 }),   // Covalschi: sub prag
      cursa({ run_date: '2026-09-06', km_livrare: 900 }),          // duminică: nu intră
    ];
    const rows = agregaLivrare({
      curse, rute, startReal: new Map(), prag: 50, minZile: 1,
      soferi: new Map([['v1|r1', 'Popescu'], ['v2|r2', 'Covalschi']]),
      case: new Map([['v1', 'Chiperceni'], ['v2', 'Lalova']]),
      masini: new Map([['v1', '552BRAO · Sprinter 312']]),
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.masina).toBe('552BRAO · Sprinter 312');
    expect(r.ruta).toBe('1 Vatici');
    expect(r.sofer).toBe('Popescu (Chiperceni)');
    expect(r.zile).toBe(2);
    expect(r.naveta_total).toBe(170);        // 60 + 50 + 60
    expect(r.naveta_zi).toBe(85);
    expect(r.gol_ruta_zi).toBe(15);
    expect(r.km_tur).toBe(30);
  });

  it('la Ungheni livrarea mașinii se adună peste cele două rute ale ei, nu se rupe pe rute', () => {
    // 032BRAT: r9 în schimbul 1, r17 în schimbul 2 — 30 km/zi pe fiecare, 60 pe mașină.
    // Pe rute ambele erau sub pragul de 50 și mașina lipsea cu totul de pe poster.
    const ung = [
      { id: 'u9', uzina_id: 'LEAR_UNGHENI', route_number: 9, stops_in_order: 'Mănoilești → Vulpești → Rezina' },
      { id: 'u17', uzina_id: 'LEAR_UNGHENI', route_number: 17, stops_in_order: 'Sineștii Vechi → Bumbăta → LEAR' },
    ];
    const zi = (d: string) => [
      cursa({ run_date: d, factory_route_id: 'u9', vehicle_id: 'vU', shift_number: 1, km_real: 40, km_livrare: 30 }),
      cursa({ run_date: d, factory_route_id: 'u17', vehicle_id: 'vU', shift_number: 2, km_real: 40, km_livrare: 30 }),
    ];
    const rows = agregaLivrare({
      curse: [...zi('2026-09-07'), ...zi('2026-09-08'), ...zi('2026-09-09')],
      rute: ung, startReal: new Map([['u9', 'Hîrcești']]), prag: 50,
      soferi: new Map([['vU|u9', 'Guzun']]), case: new Map([['vU', 'Mircești']]),
      masini: new Map([['vU', '032BRAT · Sprinter']]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].naveta_zi).toBe(60);                 // 30 + 30, nu două rânduri de 30
    expect(rows[0].naveta_total).toBe(180);
    expect(rows[0].ruta).toBe('9 Mănoilești – Hîrcești + 17 Sineștii Vechi');
    expect(rows[0].sofer).toBe('Guzun (Mircești)');
  });

  it('fără curse peste prag → poster gol; la fel fără drum plin sau sub 3 zile', () => {
    const gol = (curse: CursaLivrare[], minZile?: number) =>
      agregaLivrare({ curse, rute, startReal: new Map(), soferi: new Map(), case: new Map(), minZile });
    expect(gol([cursa({ km_livrare: 10 })], 1)).toEqual([]);
    expect(gol([cursa({ km_real: 0, km_livrare: 120 })], 1)).toEqual([]);                    // mașină fără curse
    expect(gol([cursa({ km_livrare: 120 }), cursa({ run_date: '2026-09-08', km_livrare: 120 })])).toEqual([]);  // 2 zile < 3
  });
});

describe('agregaBrambura', () => {
  it('o linie pe (mașină, zi), peste 20 km, cu șoferul zilei și ruta scurtă', () => {
    const curse = [
      cursa({ km_brambura: 15 }), cursa({ sens: 'retur', km_brambura: 10 }),           // 25 în aceeași zi
      cursa({ run_date: '2026-09-08', km_brambura: 12 }),                                 // sub prag
      cursa({ factory_route_id: 'r2', vehicle_id: 'v2', run_date: '2026-09-09', km_brambura: 46 }),
    ];
    const rows = agregaBrambura({
      curse, rute, masini: new Map([['v1', '552BRAO · Sprinter 312']]),
      soferZi: new Map([['v1|2026-09-07', 'Popescu'], ['v2|2026-09-09', 'Covalschi']]),
    });
    expect(rows).toEqual([
      { vehicle_id: 'v2', data: '2026-09-09', masina: '—', sofer: 'Covalschi', ruta: 'Orhei 7', unde: '', km: 46 },
      { vehicle_id: 'v1', data: '2026-09-07', masina: '552BRAO · Sprinter 312', sofer: 'Popescu', ruta: 'Strășeni 1', unde: '', km: 25 },
    ]);
  });
});

describe('descrieZiua', () => {
  const hh = (iso: string) => iso.slice(11, 16);
  it('spune unde a fost în afara rutei și când; casa marcată, cartierele Orheiului și satele rutei sar', () => {
    const opriri = [
      { locality: 'Chiperceni', arrival_at: '2026-09-15T16:06:00Z', departure_at: '2026-09-15T21:14:00Z', is_base: true },
      { locality: 'Bălți', arrival_at: '2026-09-15T08:43:00Z', departure_at: '2026-09-15T10:19:00Z', is_base: false },
      { locality: 'Bălți', arrival_at: '2026-09-15T10:18:00Z', departure_at: '2026-09-15T10:36:00Z', is_base: false },
      { locality: 'Fedoreuca', arrival_at: '2026-09-15T11:48:00Z', departure_at: '2026-09-15T12:03:00Z', is_base: false },
      { locality: 'Vatici', arrival_at: '2026-09-15T05:10:00Z', departure_at: '2026-09-15T05:12:00Z', is_base: false },   // sat al rutei
      { locality: 'Bucuria', arrival_at: '2026-09-15T15:35:00Z', departure_at: '2026-09-15T15:47:00Z', is_base: false },  // cartier Orhei
    ];
    expect(descrieZiua(opriri, new Set(['vatici', 'curchi']), hh, 'Chiperceni'))
      .toBe('Bălți 08:43–10:36 · Fedoreuca 11:48–12:03');
  });
  it('fără nimic în afară: pauza cea mai lungă acasă, cu orele ei', () => {
    const opriri = [
      { locality: 'Ghindești', arrival_at: '2026-09-03T00:00:00Z', departure_at: '2026-09-03T04:10:00Z', is_base: true },
      { locality: 'Ghindești', arrival_at: '2026-09-03T07:12:00Z', departure_at: '2026-09-03T12:03:00Z', is_base: false },
      { locality: 'Bucuria', arrival_at: '2026-09-03T15:35:00Z', departure_at: '2026-09-03T15:47:00Z', is_base: false },
    ];
    expect(descrieZiua(opriri, new Set(), hh, 'Ghindești')).toBe('acasă 07:12–12:03 (Ghindești), nimic în afara rutei');
    // cu drumurile zilei: km-ii sunt pe drumul în plus până acasă și înapoi, nu «acasă»
    const drumuri = [
      cursa({ sens: 'retur', shift_number: 1, km_livrare: 47 }),
      cursa({ sens: 'tur', shift_number: 3, km_livrare: 46 }),
      cursa({ sens: 'tur', shift_number: 1, km_livrare: 2 }),
    ];
    expect(descrieZiua(opriri, new Set(), hh, 'Ghindești', drumuri))
      .toBe('Ghindești–rută în plus: retur s1 +47, tur s3 +46 km · acasă 07:12–12:03');
  });
});

describe('textulEconomiei', () => {
  it('spune km-ii, leii, luna și cine face cei mai mulți, în română', () => {
    const t = textulEconomiei([{
      masina: '552BRAO · Sprinter 312', uzina: 'SEBN_STRASENI', ruta: '1 Vatici',
      sofer: 'Popescu (Chiperceni)', zile: 10, km_tur: 31, total_zi: 390, plin_zi: 122, gol_ruta_zi: 57, naveta_zi: 191, naveta_total: 1906, lei_km: 5,
    }], '2026-09-07', '2026-09-18');
    expect(t).toContain('SEBN Strășeni · 07.09–18.09');
    expect(t).toContain('1.906 km = 9.530 lei');   // 1906 × 5,00 (microbuz)
    expect(t).toContain('Popescu 9.530');
    expect(t).toContain('De făcut');
    expect(t.split('\n').length).toBeLessThanOrEqual(4);
  });
});

describe('perioadaCadentei', () => {
  it('trimite doar lunea, din 14 în 14 zile, pe cele 14 zile dinainte', () => {
    expect(perioadaCadentei('2026-10-05')).toEqual({ from: '2026-09-21', to: '2026-10-04' });
    expect(perioadaCadentei('2026-10-19')).toEqual({ from: '2026-10-05', to: '2026-10-18' });
    expect(perioadaCadentei('2026-10-12')).toBeNull();   // lunea dintre
    expect(perioadaCadentei('2026-10-06')).toBeNull();   // marți
    expect(perioadaCadentei('2026-09-21')).toBeNull();   // înainte de prima
  });
});
