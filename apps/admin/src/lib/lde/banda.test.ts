import { describe, it, expect } from 'vitest';
import {
  segmentInFereastra, progresCursa, aIntarziat, camioaneInBanda, grupeazaPeTip, mutaPastrandDurata,
  asazaInBenzi, esteInCursa, asteaptaDescarcarea, undeEste, scenaCamion, fazaCamion, oprireaDeIncarcare,
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

  it('camionul plin care așteaptă peste ora planificată E întârziat — marfa n-a ajuns', () => {
    expect(aIntarziat(trecut, 'asteapta_descarcare', acum)).toBe(true);
  });
});

describe('esteInCursa / asteaptaDescarcarea', () => {
  it('planificată și încheiată nu sunt «în cursă»', () => {
    expect(esteInCursa('planificata')).toBe(false);
    expect(esteInCursa('incheiata')).toBe(false);
    expect(esteInCursa('anulata')).toBe(false);
  });
  it('camionul plin care așteaptă e în cursă — nu e liber pentru altă marfă', () => {
    expect(esteInCursa('asteapta_descarcare')).toBe(true);
    expect(asteaptaDescarcarea('asteapta_descarcare')).toBe(true);
    expect(asteaptaDescarcarea('spre_descarcare')).toBe(false);
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

describe('undeEste — cu țara (Ion, 08.09)', () => {
  const PUNCTE = [
    { name: 'Port Constanța', lat: 44.1312, lng: 28.6163 },
    { name: 'TLX Bălți', lat: 47.75288, lng: 27.87852 },
  ];
  it('pe drum spune țara: «în drum prin România, N km de …»', () => {
    const t = undeEste({ lat: 45.9, lng: 28.4, tara: 'România' }, PUNCTE);
    expect(t).toMatch(/^în drum prin România, \d+ km de /);
  });
  it('fără țară textul rămâne cel vechi — nu se inventează', () => {
    expect(undeEste({ lat: 45.9, lng: 28.4 }, PUNCTE)).toMatch(/^în drum, \d+ km de /);
    expect(undeEste({ lat: 45.9, lng: 28.4, tara: null }, PUNCTE)).toMatch(/^în drum, /);
  });
  it('aproape de punct: punctul, cu țara în paranteză; în punct: doar punctul', () => {
    expect(undeEste({ lat: 47.7699, lng: 27.9236, tara: 'Moldova' }, PUNCTE)).toMatch(/^la \d+ km de TLX Bălți \(Moldova\)$/);
    expect(undeEste({ lat: 47.7529, lng: 27.8786, tara: 'Moldova' }, PUNCTE)).toBe('la TLX Bălți');
  });
  it('fără puncte cu coordonate: măcar țara', () => {
    expect(undeEste({ lat: 45.9, lng: 28.4, tara: 'România' }, [])).toBe('în România, fără punct apropiat');
  });
});

describe('scenaCamion — toate scenele (Ion, 08.09)', () => {
  const PUNCTE = [{ name: 'Port Constanța', lat: 44.1312, lng: 28.6163 }];
  const poz = { lat: 45.9, lng: 28.4, tara: 'România' };
  const cursa = (status: string, extra: Record<string, unknown> = {}) => ({
    status, cargo: 'diesel', unloadPointName: 'TLX Bălți', unloadPointCountry: 'Moldova',
    loadPointName: 'Port Constanța', loadPointCountry: 'România', ...extra,
  });
  it('reparația și odihna bat orice', () => {
    expect(scenaCamion({ stareZi: { state: 'reparatie', expectedEnd: '2026-09-10' }, cursa: cursa('la_descarcare'), poz, puncte: PUNCTE }))
      .toBe('în reparație, până la 2026-09-10');
    expect(scenaCamion({ stareZi: { state: 'odihna' }, cursa: null, poz, puncte: PUNCTE })).toBe('odihnă șofer');
  });
  it('la descărcare în Moldova', () => {
    expect(scenaCamion({ stareZi: null, cursa: cursa('la_descarcare'), poz, puncte: PUNCTE }))
      .toBe('la descărcare diesel, TLX Bălți (Moldova)');
  });
  it('la descărcare cu biodiesel în Bulgaria', () => {
    expect(scenaCamion({ stareZi: null, cursa: cursa('la_descarcare', { cargo: 'biodiesel', unloadPointName: 'Ruse', unloadPointCountry: 'Bulgaria' }), poz, puncte: PUNCTE }))
      .toBe('la descărcare biodiesel, Ruse (Bulgaria)');
  });
  it('plin și așteaptă, la încărcare', () => {
    expect(scenaCamion({ stareZi: null, cursa: cursa('asteapta_descarcare'), poz, puncte: PUNCTE }))
      .toBe('plin diesel, așteaptă descărcarea la TLX Bălți (Moldova)');
    expect(scenaCamion({ stareZi: null, cursa: cursa('la_incarcare'), poz, puncte: PUNCTE }))
      .toBe('la încărcare diesel, Port Constanța (România)');
  });
  it('în drum: unde e după GPS, cu țara', () => {
    expect(scenaCamion({ stareZi: null, cursa: cursa('spre_descarcare'), poz, puncte: PUNCTE }))
      .toMatch(/^în drum prin România, \d+ km de Port Constanța$/);
    expect(scenaCamion({ stareZi: null, cursa: null, poz, puncte: PUNCTE })).toMatch(/^în drum prin România/);
  });
  it('fără GPS și fără stare la punct: spune că nu știe', () => {
    expect(scenaCamion({ stareZi: null, cursa: cursa('spre_incarcare'), poz: null, puncte: PUNCTE })).toBe('fără poziție GPS recentă');
  });
});

describe('fazaCamion — faza cursei, cu GPS-ul ca martor (Ion, 10.09)', () => {
  const PETROMIDIA = { lat: 44.3266, lng: 28.6247, radiusM: 800 };
  const BACIOI = { lat: 46.9146, lng: 28.8623, radiusM: null };
  const laPetromidia = { lat: 44.3270, lng: 28.6250 };
  const peDrum = { lat: 45.9, lng: 28.4 };
  const acum = Date.parse('2026-09-10T10:00:00+03:00');
  const cursa = (status: string, loadPlannedAt = '2026-09-09T07:00:00+03:00') =>
    ({ status, loadPlannedAt, loadPoint: PETROMIDIA, unloadPoint: BACIOI });

  it('starea bifată la punct e adevăr, indiferent de GPS', () => {
    expect(fazaCamion({ cursa: cursa('la_incarcare'), poz: peDrum, acumMs: acum })).toEqual({ faza: 'la_incarcare', dupaGps: false });
    expect(fazaCamion({ cursa: cursa('la_descarcare'), poz: null, acumMs: acum })).toEqual({ faza: 'la_descarcare', dupaGps: false });
  });
  it('«spre …» e în drum, dar GPS-ul la punct îl pune la punct', () => {
    expect(fazaCamion({ cursa: cursa('spre_incarcare'), poz: peDrum, acumMs: acum })).toEqual({ faza: 'in_drum', dupaGps: false });
    expect(fazaCamion({ cursa: cursa('spre_incarcare'), poz: laPetromidia, acumMs: acum })).toEqual({ faza: 'la_incarcare', dupaGps: true });
    expect(fazaCamion({ cursa: cursa('spre_descarcare'), poz: { lat: 46.9150, lng: 28.8630 }, acumMs: acum })).toEqual({ faza: 'la_descarcare', dupaGps: true });
    expect(fazaCamion({ cursa: cursa('spre_incarcare'), poz: null, acumMs: acum })).toEqual({ faza: 'in_drum', dupaGps: false });
  });
  it('KWX620: planificată, ora de încărcare trecută, GPS la Petromidia = la încărcare după GPS', () => {
    expect(fazaCamion({ cursa: cursa('planificata'), poz: laPetromidia, acumMs: acum })).toEqual({ faza: 'la_incarcare', dupaGps: true });
  });
  it('planificată și GPS la punctul de descărcare = la descărcare după GPS', () => {
    expect(fazaCamion({ cursa: cursa('planificata'), poz: { lat: 46.9150, lng: 28.8630 }, acumMs: acum })).toEqual({ faza: 'la_descarcare', dupaGps: true });
  });
  it('planificată pe mâine: camionul care stă la punct NU e la încărcare', () => {
    expect(fazaCamion({ cursa: cursa('planificata', '2026-09-11T07:00:00+03:00'), poz: laPetromidia, acumMs: acum })).toBeNull();
  });
  it('planificată, dar pe drum sau fără GPS: fără fază, rămâne liber', () => {
    expect(fazaCamion({ cursa: cursa('planificata'), poz: peDrum, acumMs: acum })).toBeNull();
    expect(fazaCamion({ cursa: cursa('planificata'), poz: null, acumMs: acum })).toBeNull();
  });
  it('punct scris liber, fără coordonate: GPS-ul nu poate spune nimic', () => {
    expect(fazaCamion({ cursa: { status: 'planificata', loadPlannedAt: '2026-09-09T07:00:00+03:00', loadPoint: null, unloadPoint: null }, poz: laPetromidia, acumMs: acum })).toBeNull();
  });
  it('raza punctului bate kilometrul implicit', () => {
    const departe = { lat: 44.3266 + 0.006, lng: 28.6247 }; // ~670 m: în raza de 800 m, ar fi și sub 1 km
    const maiDeparte = { lat: 44.3266 + 0.012, lng: 28.6247 }; // ~1.3 km: afară
    expect(fazaCamion({ cursa: cursa('planificata'), poz: departe, acumMs: acum })?.faza).toBe('la_incarcare');
    expect(fazaCamion({ cursa: cursa('planificata'), poz: maiDeparte, acumMs: acum })).toBeNull();
    const larg = { ...cursa('planificata'), loadPoint: { ...PETROMIDIA, radiusM: 2000 } };
    expect(fazaCamion({ cursa: larg, poz: maiDeparte, acumMs: acum })?.faza).toBe('la_incarcare');
  });
  it('plin și așteaptă, încheiată, anulată: fără fază', () => {
    for (const s of ['asteapta_descarcare', 'incheiata', 'anulata']) {
      expect(fazaCamion({ cursa: cursa(s), poz: laPetromidia, acumMs: acum })).toBeNull();
    }
  });
});

describe('fazaCamion cu istoricul opririlor — «în drum» după GPS (Ion, 10.09: MOW214, IIC263)', () => {
  const BERDICHEV = { lat: 49.8852, lng: 28.5433, radiusM: 800 };
  const RUSE = { lat: 43.8564, lng: 25.9706, radiusM: 500 };
  const acum = Date.parse('2026-09-10T18:00:00+03:00');
  const cursa = { status: 'planificata', loadPlannedAt: '2026-09-05T07:00:00+03:00', loadPoint: BERDICHEV, unloadPoint: RUSE };
  const laBerdichev33h: Parameters<typeof fazaCamion>[0]['opriri'] = [
    { lat: 49.8852, lng: 28.5433, dwellMin: 1347, arrivalAt: '2026-09-05T21:48:45Z' },
  ];
  const langaUngheni = { lat: 47.0, lng: 27.6 };

  it('MOW214: a stat la Berdichev, acum e pe drum = în drum, după GPS', () => {
    expect(fazaCamion({ cursa, poz: langaUngheni, opriri: laBerdichev33h, acumMs: acum })).toEqual({ faza: 'in_drum', dupaGps: true });
  });
  it('a încărcat și acum stă la Ruse = la descărcare, după GPS', () => {
    expect(fazaCamion({ cursa, poz: { lat: 43.8566, lng: 25.9708 }, opriri: laBerdichev33h, acumMs: acum })).toEqual({ faza: 'la_descarcare', dupaGps: true });
  });
  it('KYK742: n-a fost la încărcare, stă la punctul de descărcare = liber, n-a plecat încă', () => {
    expect(fazaCamion({ cursa, poz: { lat: 43.8566, lng: 25.9708 }, opriri: [], acumMs: acum })).toBeNull();
  });
  it('fără nicio oprire la încărcare: pe drum rămâne liber', () => {
    expect(fazaCamion({ cursa, poz: langaUngheni, opriri: [], acumMs: acum })).toBeNull();
  });
  it('stă la încărcare acum: la încărcare, indiferent de istoric', () => {
    expect(fazaCamion({ cursa, poz: { lat: 49.8853, lng: 28.5434 }, opriri: [], acumMs: acum })).toEqual({ faza: 'la_incarcare', dupaGps: true });
  });
  it('oprirea scurtă sau dinaintea cursei nu e încărcare', () => {
    expect(oprireaDeIncarcare([{ lat: 49.8852, lng: 28.5433, dwellMin: 13, arrivalAt: '2026-09-05T15:51:30Z' }], BERDICHEV, cursa.loadPlannedAt)).toBeNull();
    expect(oprireaDeIncarcare([{ lat: 49.8852, lng: 28.5433, dwellMin: 600, arrivalAt: '2026-08-30T15:51:30Z' }], BERDICHEV, cursa.loadPlannedAt)).toBeNull();
    // Cu o zi înainte de ora planificată: contează (a ajuns mai devreme).
    expect(oprireaDeIncarcare([{ lat: 49.8852, lng: 28.5433, dwellMin: 600, arrivalAt: '2026-09-04T12:00:00Z' }], BERDICHEV, cursa.loadPlannedAt)).not.toBeNull();
  });
  it('cea mai veche oprire bună e momentul încărcării', () => {
    const o = oprireaDeIncarcare([
      { lat: 49.8852, lng: 28.5433, dwellMin: 300, arrivalAt: '2026-09-06T21:01:40Z' },
      { lat: 49.8852, lng: 28.5433, dwellMin: 249, arrivalAt: '2026-09-05T16:49:21Z' },
    ], BERDICHEV, cursa.loadPlannedAt);
    expect(o?.arrivalAt).toBe('2026-09-05T16:49:21Z');
  });
  it('punct fără coordonate: istoricul nu ajută', () => {
    expect(fazaCamion({ cursa: { ...cursa, loadPoint: null }, poz: langaUngheni, opriri: laBerdichev33h, acumMs: acum })).toBeNull();
  });
});
