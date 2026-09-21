import { describe, it, expect } from 'vitest';
import { agregaLivrare, agregaBrambura, descrieZiua, perioadaCadentei, textulEconomiei, type CursaLivrare, type NavetaRand } from './livrare-poster';

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

  it('naveta făcută cu altă mașină intră în poster, deși autobuzul rutei are livrare 0', () => {
    // Cazul real: ruta 25 «Vatici» e făcută de 820GXP, care DOARME la Vatici — livrare 0.
    // Omul e dus acolo cu 073BRAO, ~200 km/zi. Fără linia navetei, ruta pare curată.
    const zile = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    const curse = zile.map((d) => cursa({ run_date: d, factory_route_id: 'r1', vehicle_id: 'vBus', km_real: 19.5, km_livrare: 0 }));
    const navete: NavetaRand[] = zile.map((d) => ({
      run_date: d, vehicle_id: 'vNav', factory_route_id: 'r1', km: 196.8, autobuz_id: 'vBus', casa: 'Ocnița-Răzeși',
    }));
    const rows = agregaLivrare({
      curse, navete, rute, startReal: new Map(), prag: 50, minZile: 3,
      soferi: new Map([['vBus|r1', 'Magalu']]),
      case: new Map([['vBus', 'Vatici']]),
      masini: new Map([['vBus', '820GXP · DAF'], ['vNav', '073BRAO · Sprinter 312']]),
      norme: new Map([['vBus', { litri: 28.5, categorie: 'autobuz_mare' }], ['vNav', { litri: 10.5, categorie: 'microbuz' }]]),
      pretZi: new Map(zile.map((d) => [d, 35.89])),
    });
    expect(rows).toHaveLength(1);                       // autobuzul are livrare 0, deci nu intră
    const r = rows[0];
    expect(r.masina).toBe('073BRAO · Sprinter 312');
    expect(r.ruta).toBe('1 Vatici · navetă');
    expect(r.sofer).toBe('Magalu (Ocnița-Răzeși)');     // omul dus, satul de unde pleacă naveta
    expect(r.zile).toBe(4);
    expect(r.naveta_zi).toBe(197);
    expect(r.naveta_total).toBe(787);
    expect(r.plin_zi).toBe(0);                          // nu face rută
    expect(r.km_tur).toBeNull();
    // costul km-ului MAȘINII DE NAVETĂ, nu al autobuzului: 10,5 l × 35,89 + 1 + 1
    expect(r.lei_km).toBeCloseTo(5.77, 2);
  });

  it('naveta sub prag sau sub trei zile nu intră', () => {
    const navete: NavetaRand[] = [
      { run_date: '2026-09-15', vehicle_id: 'vNav', factory_route_id: 'r1', km: 200, autobuz_id: 'vBus', casa: 'Zorile' },
      { run_date: '2026-09-16', vehicle_id: 'vNav', factory_route_id: 'r1', km: 200, autobuz_id: 'vBus', casa: 'Zorile' },
      // a treia zi e sâmbătă: nu se numără
      { run_date: '2026-09-19', vehicle_id: 'vNav2', factory_route_id: 'r1', km: 40, autobuz_id: 'vBus', casa: 'Zorile' },
      { run_date: '2026-09-17', vehicle_id: 'vNav2', factory_route_id: 'r1', km: 40, autobuz_id: 'vBus', casa: 'Zorile' },
      { run_date: '2026-09-18', vehicle_id: 'vNav2', factory_route_id: 'r1', km: 40, autobuz_id: 'vBus', casa: 'Zorile' },
    ];
    const rows = agregaLivrare({
      curse: [], navete, rute, startReal: new Map(), prag: 50, minZile: 3,
      soferi: new Map(), case: new Map(), masini: new Map(),
    });
    expect(rows).toEqual([]);                           // vNav: 2 zile lucrătoare; vNav2: 40 km/zi
  });

  it('costul unui km: normă × preț ANRE + reparație + salariu (Ion, 21.09)', () => {
    // 1,50 reparație DOAR la DAF; Sprinterul mare («autobuz_mic») ia 1,00, ca microbuzul —
    // vechiul leiPeKm îi dădea 10 lei/km doar fiindcă avea «autobuz» în numele categoriei.
    const zi = (d: string, vid: string) => cursa({ run_date: d, vehicle_id: vid, km_livrare: 100 });
    const zile = ['2026-09-15', '2026-09-16', '2026-09-17'];
    const rows = agregaLivrare({
      curse: zile.flatMap((d) => [zi(d, 'vDAF'), zi(d, 'vSprinter'), zi(d, 'v518'), zi(d, 'vFaraTip')]),
      rute, startReal: new Map(), prag: 50, minZile: 3,
      soferi: new Map(), case: new Map(),
      norme: new Map([
        ['vDAF', { litri: 28.5, categorie: 'autobuz_mare' }],
        ['vSprinter', { litri: 10.5, categorie: 'microbuz' }],
        ['v518', { litri: 14.5, categorie: 'autobuz_mic' }],
      ]),
      pretZi: new Map(zile.map((d) => [d, 35.89])),
      masini: new Map([['vDAF', 'DAF'], ['vSprinter', 'Sprinter 312'], ['v518', 'Sprinter 518'], ['vFaraTip', 'fără tip']]),
    });
    const leiKm = new Map(rows.map((r) => [r.masina, r.lei_km!]));
    expect(leiKm.get('DAF')).toBeCloseTo(12.73, 2);         // 28,5 l → 10,23 + 1,50 reparație + 1 salariu
    expect(leiKm.get('Sprinter 312')).toBeCloseTo(5.77, 2); // 10,5 l → 3,77 + 1 + 1
    expect(leiKm.get('Sprinter 518')).toBeCloseTo(7.20, 2); // 14,5 l, reparație 1,00 — nu 1,50
    expect(leiKm.get('fără tip')).toBeCloseTo(6.49, 2);     // norma implicită 12,5 l
  });

  it('prețul se ia pe ziua km-ilor, ponderat cu livrarea zilei', () => {
    // o zi ieftină cu puțini km și una scumpă cu mulți: media NU e media aritmetică a prețurilor
    const rows = agregaLivrare({
      curse: [
        cursa({ run_date: '2026-09-15', vehicle_id: 'v1', km_livrare: 20 }),
        cursa({ run_date: '2026-09-16', vehicle_id: 'v1', km_livrare: 180 }),
        cursa({ run_date: '2026-09-17', vehicle_id: 'v1', km_livrare: 100 }),
      ],
      rute, startReal: new Map(), prag: 50, minZile: 3, soferi: new Map(), case: new Map(),
      norme: new Map([['v1', { litri: 28.5, categorie: 'autobuz_mare' }]]),
      pretZi: new Map([['2026-09-15', 20], ['2026-09-16', 40], ['2026-09-17', 40]]),
    });
    // preț ponderat = (20×20 + 180×40 + 100×40) / 300 = 38,67 lei/l
    expect(rows[0].lei_km).toBeCloseTo((28.5 / 100) * 38.6667 + 1.5 + 1, 2);
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
