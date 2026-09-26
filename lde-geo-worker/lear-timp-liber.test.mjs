import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curseCuOpriri, eticheteaza, rezumaSaptamina, caseSecundare, hav, portiDin, distPoarta } from './lear-timp-liber.mjs';
import { local, ziLucru } from './ora-locala.mjs';

// locuri reale din jurul LEAR Ungheni
const POARTA = { lat: 47.2230, lon: 27.8016 }, PARC = { lat: 47.7700, lon: 27.9235 };
const TODIRESTI = { lat: 47.3226, lon: 27.8267 }, BOCSA = { lat: 47.4644, lon: 27.6590 }, FALESTI = { lat: 47.5735, lon: 27.7068 };
const HORESTI = { lat: 47.4306, lon: 27.5787 }, DRAGANESTI = { lat: 47.7175, lon: 28.2511 }, MACARESTI = { lat: 47.0376, lon: 27.9953 };
const UNGHENI = { lat: 47.2060, lon: 27.7989 }, SCULENI = { lat: 47.3300, lon: 27.5600 }, STATIE = { lat: 47.3400, lon: 27.8500 };
const FERESTRE = [
  { sens: 'tur', shift_number: 1, de_la_min: 150, pana_la_min: 450 }, { sens: 'tur', shift_number: 2, de_la_min: 660, pana_la_min: 870 },
  { sens: 'retur', shift_number: 1, de_la_min: 810, pana_la_min: 1005 }, { sens: 'retur', shift_number: 2, de_la_min: 1290, pana_la_min: 150 }];
// ora locală «HH:MM» a zilei → ms UTC (vara: UTC+3, iarna: UTC+2)
const T = (zi, hhmm, off = 3) => Date.UTC(+zi.slice(0, 4), +zi.slice(5, 7) - 1, +zi.slice(8, 10), +hhmm.slice(0, 2) - off, +hhmm.slice(3, 5));
const ctxDe = (extra = {}) => ({ poarta: POARTA, parc: PARC, casaC: TODIRESTI, ferestre: FERESTRE, lucreazaSambata: true, lucreazaDuminica: false,
  local, ziLucru, inSapt: () => true, sfarsitDate: null, alimentari: [], numeLoc: null, inCuloar: null, ...extra });

// urme sintetice: drum între două locuri (punct la 30 s, 25 noduri) și stat pe loc (punct la 60 s)
function drum(a, b, t0, min) { const out = []; const n = Math.max(2, Math.round(min * 2));
  for (let i = 0; i <= n; i++) { const f = i / n; out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, t: new Date(t0 + f * min * 60000), v: i === 0 || i === n ? 0 : 25 }); }
  return out; }
function stai(loc, t0, min) { const out = []; for (let i = 0; i <= min; i++) out.push({ lat: loc.lat, lon: loc.lon, t: new Date(t0 + i * 60000), v: 0 }); return out; }
const urma = (...seg) => seg.flat().sort((a, b) => a.t - b.t);
const et = (pts, extra) => { const ctx = ctxDe(extra); const c = curseCuOpriri(pts, ctx); return { ctx, c, e: eticheteaza(c, ctx) }; };
const etichete = r => r.e.map(x => x.eticheta);
const kmLiber = r => rezumaSaptamina(r.e, r.ctx).km;

// o zi obișnuită de tur s1 + retur s1, cu casa la Todirești și capătul la Bocșa
const ziObisnuita = (zi, off = 3) => urma(
  drum(TODIRESTI, BOCSA, T(zi, '04:20', off), 40), stai(BOCSA, T(zi, '05:00', off), 5), drum(BOCSA, POARTA, T(zi, '05:05', off), 45),
  stai(POARTA, T(zi, '05:50', off), 12), drum(POARTA, TODIRESTI, T(zi, '06:02', off), 25),
  drum(TODIRESTI, POARTA, T(zi, '14:05', off), 25), stai(POARTA, T(zi, '14:30', off), 15), drum(POARTA, BOCSA, T(zi, '14:45', off), 45),
  stai(BOCSA, T(zi, '15:30', off), 5), drum(BOCSA, TODIRESTI, T(zi, '15:35', off), 40));

test('zi simplă: tur s1 + retur s1 → totul muncă, 0 km liber', () => {
  const r = et(ziObisnuita('2026-09-15'));
  assert.ok(r.c.length >= 2);
  assert.deepEqual([...new Set(etichete(r))], ['muncă']);
  assert.equal(kmLiber(r), 0);
});

test('poziționare 061COY: casă → Bocșa, așteptare 19′ sau 21′, apoi tur → muncă în ambele variante', () => {
  for (const asteptare of [19, 21]) {
    const r = et(urma(drum(TODIRESTI, BOCSA, T('2026-09-15', '11:40'), 60), stai(BOCSA, T('2026-09-15', '12:40'), asteptare),
      drum(BOCSA, POARTA, T('2026-09-15', `13:${asteptare + 1}`), 45), stai(POARTA, T('2026-09-15', '14:10'), 15), drum(POARTA, TODIRESTI, T('2026-09-15', '14:25'), 25)));
    assert.deepEqual([...new Set(etichete(r))], ['muncă'], `așteptare ${asteptare}′`);
  }
});

test('504BRAR: poartă → Măcărești (așteptare 21′) → poartă la 13:06 → ambele curse muncă', () => {
  const r = et(urma(stai(POARTA, T('2026-09-15', '10:20'), 10), drum(POARTA, MACARESTI, T('2026-09-15', '10:30'), 50), stai(MACARESTI, T('2026-09-15', '11:20'), 21),
    drum(MACARESTI, POARTA, T('2026-09-15', '11:41'), 85), stai(POARTA, T('2026-09-15', '13:06'), 20), drum(POARTA, TODIRESTI, T('2026-09-15', '13:26'), 25)),
    { casaC: TODIRESTI });
  assert.ok(r.c.length >= 2);
  assert.deepEqual([...new Set(etichete(r))], ['muncă']);
});

test('timp liber: casă → Fălești 40′ → casă, marți seara, fără poartă → liber, cu oprirea și «se repetă» a doua zi', () => {
  const zi = z => urma(drum(TODIRESTI, FALESTI, T(z, '16:00'), 40), stai(FALESTI, T(z, '16:40'), 40), drum(FALESTI, TODIRESTI, T(z, '17:20'), 40));
  const r1 = et(zi('2026-09-15'), { numeLoc: p => hav(p, FALESTI) < 1 ? 'Fălești' : 'undeva' });
  assert.deepEqual([...new Set(etichete(r1))], ['liber']);
  const rez1 = rezumaSaptamina(r1.e, r1.ctx);
  assert.ok(rez1.km > 40, `km liber ${rez1.km}`);
  assert.equal(rez1.iesiri[0].loc_principal, 'Fălești');
  assert.equal(rez1.iesiri[0].repetat, false);
  const r2 = et(urma(zi('2026-09-15'), zi('2026-09-16')), { numeLoc: p => hav(p, FALESTI) < 1 ? 'Fălești' : 'undeva' });
  const rez2 = rezumaSaptamina(r2.e, r2.ctx);
  assert.ok(rez2.iesiri.every(x => x.repetat), 'același loc în două zile = se repetă');
  assert.equal(rez2.zile, 2);
});

test('parc: casă → Bălți 3 h în parc → casă → reparație pe ambele drumuri', () => {
  const r = et(urma(drum(TODIRESTI, PARC, T('2026-09-15', '07:00'), 90), stai(PARC, T('2026-09-15', '08:30'), 180), drum(PARC, TODIRESTI, T('2026-09-15', '11:30'), 90)));   // 3 h
  assert.equal(r.c.length, 2);
  assert.deepEqual(etichete(r), ['reparație', 'reparație']);
  assert.equal(kmLiber(r), 0);
});

test('duminică (works_sunday=false) oprirea la poartă nu e ancoră → liber; sâmbătă la fel de ancoră → muncă', () => {
  const zi = z => urma(drum(TODIRESTI, POARTA, T(z, '11:30'), 30), stai(POARTA, T(z, '12:00'), 15), drum(POARTA, TODIRESTI, T(z, '12:15'), 30));
  assert.deepEqual([...new Set(etichete(et(zi('2026-09-20'))))], ['liber']);   // duminică
  assert.deepEqual([...new Set(etichete(et(zi('2026-09-19'))))], ['muncă']);   // sâmbătă
});

test('sosire luni 02:45 = ancoră (ziua de schimb e luni, deși ziLucru e duminică)', () => {
  const r = et(urma(drum(TODIRESTI, POARTA, T('2026-09-14', '02:10'), 35), stai(POARTA, T('2026-09-14', '02:45'), 10), drum(POARTA, TODIRESTI, T('2026-09-14', '02:55'), 30)));
  assert.deepEqual([...new Set(etichete(r))], ['muncă']);
});

test('plecare duminică 02:30 fix: nu-i fereastra retur s2, dar e schimbul 3 → muncă', () => {
  const r = et(urma(stai(POARTA, T('2026-09-20', '02:20'), 10), drum(POARTA, TODIRESTI, T('2026-09-20', '02:30'), 30)));
  assert.deepEqual(etichete(r), ['muncă'], 'atingere a porții noaptea, fără fereastră = schimbul 3, tot muncă');
  assert.equal(r.e[0].ancora.schimb, 3);
});

test('oprire la poartă la 09:00 (nicio fereastră) → nu-i ancoră → liber', () => {
  const r = et(urma(drum(TODIRESTI, POARTA, T('2026-09-15', '08:30'), 30), stai(POARTA, T('2026-09-15', '09:00'), 10), drum(POARTA, TODIRESTI, T('2026-09-15', '09:10'), 30)));
  assert.deepEqual([...new Set(etichete(r))], ['liber']);
});

test('trecere prin raza porții fără oprire: în afara ferestrei nu-i ancoră; în fereastră DA (320BRAT lasă oamenii din mers)', () => {
  const trec = (h1, h2) => urma(drum(TODIRESTI, UNGHENI, T('2026-09-15', h1), 30).map(p => ({ ...p, v: 25 })), drum(UNGHENI, TODIRESTI, T('2026-09-15', h2), 30).map(p => ({ ...p, v: 25 })));
  const r = et(trec('09:30', '10:00'));
  assert.ok(r.c.every(c => c.atingeriPoarta.every(a => !a.oprire)));
  assert.deepEqual([...new Set(etichete(r))], ['liber']);
  assert.deepEqual([...new Set(etichete(et(trec('05:00', '05:30'))))], ['muncă']);
});
test('trecere scurtă prin casă în mijlocul muncii (456BRAX: sate → Todirești 46′ → poartă) rămâne în lanț', () => {
  const TESCURENI = { lat: 47.4050, lon: 27.9361 };
  const r = et(urma(drum(TODIRESTI, TESCURENI, T('2026-09-15', '04:20'), 30), stai(TESCURENI, T('2026-09-15', '04:50'), 5), drum(TESCURENI, TODIRESTI, T('2026-09-15', '04:55'), 40),
    stai(TODIRESTI, T('2026-09-15', '05:35'), 46), drum(TODIRESTI, POARTA, T('2026-09-15', '06:21'), 25), stai(POARTA, T('2026-09-15', '06:46'), 10), drum(POARTA, TODIRESTI, T('2026-09-15', '06:56'), 25)));
  assert.deepEqual([...new Set(etichete(r))], ['muncă']);
});

test('oprire de 15′ la poartă în mijlocul cursei = ancoră pentru toată cursa', () => {
  const r = et(urma(drum(BOCSA, POARTA, T('2026-09-15', '13:30'), 45), stai(POARTA, T('2026-09-15', '14:15'), 15), drum(POARTA, BOCSA, T('2026-09-15', '14:30'), 45)));
  assert.equal(r.c.length, 1, 'o singură cursă (pauza 15′ nu taie)');
  assert.equal(r.c[0].atingeriPoarta[0].pozitie, 'mijloc');
  assert.deepEqual(etichete(r), ['muncă']);
});

test('așteptare 209′ la poartă nu rupe lanțul (043BRAU 19:57 → 23:26)', () => {
  const r = et(urma(drum(HORESTI, POARTA, T('2026-09-15', '19:02'), 55), stai(POARTA, T('2026-09-15', '19:57'), 209), drum(POARTA, HORESTI, T('2026-09-15', '23:26'), 60)), { casaC: HORESTI });
  assert.equal(r.c.length, 2);
  assert.deepEqual(etichete(r), ['muncă', 'muncă']);
});

test('pauză de 2 h 30 în orașul Ungheni (nu la poartă) rupe lanțul: drumul acasă de după e liber', () => {
  const r = et(urma(stai(POARTA, T('2026-09-15', '14:30'), 10), drum(POARTA, UNGHENI, T('2026-09-15', '14:40'), 10), stai(UNGHENI, T('2026-09-15', '14:50'), 150), drum(UNGHENI, TODIRESTI, T('2026-09-15', '17:20'), 30)));
  assert.deepEqual(etichete(r), ['muncă', 'liber']);
});

test('gol de semnal: 45′ pe loc nu rupe lanțul, 3 h rupe', () => {
  const cu = (min) => urma(stai(POARTA, T('2026-09-15', '14:30'), 10), drum(POARTA, BOCSA, T('2026-09-15', '14:40'), 45),
    drum(BOCSA, TODIRESTI, T('2026-09-15', `${String(15 + Math.floor((25 + min) / 60)).padStart(2, '0')}:${String((25 + min) % 60).padStart(2, '0')}`), 40));
  assert.deepEqual(etichete(et(cu(45))), ['muncă', 'muncă']);
  assert.deepEqual(etichete(et(cu(180))), ['muncă', 'liber']);
});

test('gol de semnal cu deplasare mare → bucată neclară, nu liber', () => {
  const r = et(urma(drum(TODIRESTI, BOCSA, T('2026-09-15', '16:00'), 30), drum(FALESTI, TODIRESTI, T('2026-09-15', '18:00'), 40)));
  assert.ok(r.e.some(e => e.eticheta === 'neclar' && e.cursa.gol));
});

test('pragul: 49,9 km nu dă steag, 50 dă', () => {
  const r = et(urma(drum(TODIRESTI, FALESTI, T('2026-09-15', '16:00'), 40), drum(FALESTI, TODIRESTI, T('2026-09-15', '16:40'), 40)));
  const rez = rezumaSaptamina(r.e, r.ctx);
  assert.equal(rez.peste_prag, rez.km >= 50);
  const r2 = et(r.c.flatMap(c => c.pts), { praguri: { PRAG_ALARMA_KM: rez.km + 0.1 } });
  assert.equal(rezumaSaptamina(r2.e, r2.ctx).peste_prag, false);
  const r3 = et(r.c.flatMap(c => c.pts), { praguri: { PRAG_ALARMA_KM: rez.km } });
  assert.equal(rezumaSaptamina(r3.e, r3.ctx).peste_prag, true);
});

test('fără casă cunoscută: lanțul se rupe doar la pauze ≥ 2 h', () => {
  const r = et(urma(drum(TODIRESTI, POARTA, T('2026-09-15', '05:00'), 30), stai(POARTA, T('2026-09-15', '05:30'), 12), drum(POARTA, TODIRESTI, T('2026-09-15', '05:42'), 30),
    stai(TODIRESTI, T('2026-09-15', '06:12'), 30), drum(TODIRESTI, FALESTI, T('2026-09-15', '06:42'), 40)), { casaC: null });
  assert.deepEqual([...new Set(etichete(r))], ['muncă'], 'pauza de 30′ acasă nu se cunoaște drept casă'); assert.equal(r.c.length, 2);
});

test('fereastra peste miezul nopții: plecare de la poartă la 01:15 = retur s2', () => {
  const r = et(urma(stai(POARTA, T('2026-09-16', '01:05'), 10), drum(POARTA, TODIRESTI, T('2026-09-16', '01:15'), 30)));
  assert.deepEqual(etichete(r), ['muncă']);
  assert.equal(r.e[0].ancora.tip, 'retur');
});

test('navetă Horești ↔ Drăgănești pe weekend (46 h acolo) = navetă, nu liber; parcare 3 h × 2 zile în oraș ≠ casă', () => {
  const pts = urma(ziObisnuita('2026-09-18').map(p => ({ ...p, lat: p.lat, lon: p.lon })),
    drum(HORESTI, DRAGANESTI, T('2026-09-18', '19:00'), 90), stai(DRAGANESTI, T('2026-09-18', '20:30'), 46 * 60), drum(DRAGANESTI, HORESTI, T('2026-09-20', '18:30'), 90));
  const ctx = ctxDe({ casaC: HORESTI });
  const c = curseCuOpriri(pts, ctx);
  const case2 = caseSecundare(c, ctx);
  assert.equal(case2.length, 1); assert.ok(hav(case2[0], DRAGANESTI) < 1);
  const e = eticheteaza(c, ctx);
  const naveta = e.filter(x => x.eticheta === 'navetă');
  assert.equal(naveta.length, 2);
  // parcare 3 h în Ungheni sâmbăta și duminica: nu e casă
  const pts2 = urma(drum(HORESTI, UNGHENI, T('2026-09-19', '10:00'), 60), stai(UNGHENI, T('2026-09-19', '11:00'), 180), drum(UNGHENI, HORESTI, T('2026-09-19', '14:00'), 60),
    drum(HORESTI, UNGHENI, T('2026-09-20', '10:00'), 60), stai(UNGHENI, T('2026-09-20', '11:00'), 180), drum(UNGHENI, HORESTI, T('2026-09-20', '14:00'), 60));
  const c2 = curseCuOpriri(pts2, ctx);
  assert.equal(caseSecundare(c2, ctx).length, 0);
  assert.deepEqual([...new Set(eticheteaza(c2, ctx).map(x => x.eticheta))], ['liber']);
});

test('mașina care doarme la capăt (Horești = capătul lui A8): totul muncă', () => {
  const r = et(urma(drum(HORESTI, POARTA, T('2026-09-15', '04:40'), 60), stai(POARTA, T('2026-09-15', '05:40'), 12), drum(POARTA, HORESTI, T('2026-09-15', '05:52'), 60)), { casaC: HORESTI });
  assert.deepEqual([...new Set(etichete(r))], ['muncă']);
});

test('marginea datelor: cursa fără ancoră neîncheiată e neclară; cu ancoră rămâne muncă; completată, devine muncă', () => {
  const trunchiat = urma(drum(TODIRESTI, SCULENI, T('2026-09-21', '01:30'), 60));
  const r = et(trunchiat, { sfarsitDate: T('2026-09-21', '03:30') });
  assert.deepEqual(etichete(r), ['neclar']);
  const complet = urma(drum(TODIRESTI, SCULENI, T('2026-09-21', '01:30'), 60), stai(SCULENI, T('2026-09-21', '02:30'), 5), drum(SCULENI, POARTA, T('2026-09-21', '02:35'), 60), stai(POARTA, T('2026-09-21', '03:35'), 10));
  const r2 = et(complet, { sfarsitDate: T('2026-09-21', '08:00') });
  assert.deepEqual([...new Set(etichete(r2))], ['muncă']);
});

test('alimentarea scutește doar drumul la o stație de lângă casă, nu un circuit de 80 km', () => {
  const alim = { t: new Date(T('2026-09-15', '10:12')), lat: STATIE.lat, lon: STATIE.lon };
  const scurt = urma(drum(TODIRESTI, STATIE, T('2026-09-15', '10:00'), 10), stai(STATIE, T('2026-09-15', '10:10'), 5), drum(STATIE, TODIRESTI, T('2026-09-15', '10:15'), 10));
  const r = et(scurt, { alimentari: [alim] });
  const rez = rezumaSaptamina(r.e, r.ctx);
  assert.ok(rez.km_alimentare > 0 && rez.km < 0.5, `scutit: ${JSON.stringify(rez)}`);
  // circuit de ~80 km cu o oprire de 5′ la o stație departe de casă (Sculeni, ~30 km)
  const alim2 = { t: new Date(T('2026-09-15', '10:52')), lat: SCULENI.lat, lon: SCULENI.lon };
  const lung = urma(drum(TODIRESTI, FALESTI, T('2026-09-15', '10:00'), 40), drum(FALESTI, SCULENI, T('2026-09-15', '10:40'), 10), stai(SCULENI, T('2026-09-15', '10:50'), 5), drum(SCULENI, TODIRESTI, T('2026-09-15', '10:55'), 40));
  const r2 = et(lung, { alimentari: [alim2] });
  const rez2 = rezumaSaptamina(r2.e, r2.ctx);
  assert.equal(rez2.km_alimentare, 0); assert.ok(rez2.km > 50 && rez2.peste_prag);
  // două opriri la < 5′ una de alta în interval → ambiguu, fără scutire
  const amb = urma(drum(TODIRESTI, STATIE, T('2026-09-15', '10:00'), 10), stai(STATIE, T('2026-09-15', '10:10'), 2), drum(STATIE, { lat: STATIE.lat + 0.01, lon: STATIE.lon }, T('2026-09-15', '10:12'), 2), stai({ lat: STATIE.lat + 0.01, lon: STATIE.lon }, T('2026-09-15', '10:14'), 3), drum({ lat: STATIE.lat + 0.01, lon: STATIE.lon }, TODIRESTI, T('2026-09-15', '10:17'), 10));
  const r3 = et(amb, { alimentari: [alim] });
  assert.equal(rezumaSaptamina(r3.e, r3.ctx).km_alimentare, 0);
});

test('brambura: drumul rutei e obișnuința săptămânii — o zi pe alt drum e brambura, două zile pe el nu', () => {
  // retur obișnuit poartă → Bocșa → Todirești, în trei zile; joi, în plus, acasă pe la Fălești (o singură zi)
  const dus = z => drum(TODIRESTI, POARTA, T(z, '13:55'), 35);   // dimineața-i acasă, ca zilele să se lege fără gol cu deplasare
  // retur până la Bocșa (cursa cu poarta), 25′ acolo, apoi acasă — drumul spre casă e cursa fără poartă
  const retur = z => urma(dus(z), stai(POARTA, T(z, '14:30'), 10), drum(POARTA, BOCSA, T(z, '14:40'), 45), stai(BOCSA, T(z, '15:25'), 25), drum(BOCSA, TODIRESTI, T(z, '15:50'), 40));
  const ocolit = z => urma(dus(z), stai(POARTA, T(z, '14:30'), 10), drum(POARTA, BOCSA, T(z, '14:40'), 45), stai(BOCSA, T(z, '15:25'), 25), drum(BOCSA, FALESTI, T(z, '15:50'), 30), drum(FALESTI, TODIRESTI, T(z, '16:20'), 40));
  const r = et(urma(retur('2026-09-14'), retur('2026-09-15'), retur('2026-09-16'), ocolit('2026-09-17')));
  assert.deepEqual([...new Set(etichete(r))], ['muncă']);
  const rez = rezumaSaptamina(r.e, r.ctx);
  assert.ok(rez.km_brambura >= 20, `brambura ${rez.km_brambura}`); assert.equal(rez.km, 0);
  assert.ok(rez.iesiri.some(x => x.eticheta === 'brambura' && x.zi === '2026-09-17'));
  // același drum pe la Fălești în două zile → e ruta lui, nu brambura
  const r2 = et(urma(retur('2026-09-14'), retur('2026-09-15'), ocolit('2026-09-16'), ocolit('2026-09-17')));   // fiecare drum în două zile
  assert.equal(rezumaSaptamina(r2.e, r2.ctx).km_brambura, 0);
});
test('cursa care atinge poarta în orele schimbului nu e brambura, oricât de neobișnuit drumul (poate a acoperit o mașină stricată)', () => {
  const zi = (z, spre) => urma(drum(TODIRESTI, POARTA, T(z, '13:55'), 35), stai(POARTA, T(z, '14:30'), 10), drum(POARTA, spre, T(z, '14:40'), 45), drum(spre, TODIRESTI, T(z, '15:25'), 40));
  const r = et(urma(zi('2026-09-14', BOCSA), zi('2026-09-15', BOCSA), zi('2026-09-16', BOCSA), zi('2026-09-17', FALESTI)));
  assert.equal(rezumaSaptamina(r.e, r.ctx).km_brambura, 0);
});
test('altă uzină: cursa care atinge poarta Drăxlmaier e «altă uzină», nu liber', () => {
  const DRAX = { lat: 47.7741, lon: 27.9159, r: 0.5, nume: 'Drăxlmaier Bălți' };
  const r = et(urma(drum(TODIRESTI, DRAX, T('2026-09-15', '09:00'), 80), stai(DRAX, T('2026-09-15', '10:20'), 10), drum(DRAX, TODIRESTI, T('2026-09-15', '10:30'), 80)), { alteUzine: [DRAX] });
  assert.deepEqual([...new Set(etichete(r))], ['altă uzină']);
  const rez = rezumaSaptamina(r.e, r.ctx);
  assert.equal(rez.km, 0); assert.equal(rez.iesiri.length, 0, 'ziua legată de altă uzină nu se listează');
  // aceeași zi, și o ieșire liberă după-amiaza: nici ea nu intră
  const r2 = et(urma(drum(TODIRESTI, DRAX, T('2026-09-15', '09:00'), 80), stai(DRAX, T('2026-09-15', '10:20'), 10), drum(DRAX, TODIRESTI, T('2026-09-15', '10:30'), 80),
    stai(TODIRESTI, T('2026-09-15', '11:50'), 150), drum(TODIRESTI, FALESTI, T('2026-09-15', '14:20'), 40), stai(FALESTI, T('2026-09-15', '15:00'), 30), drum(FALESTI, TODIRESTI, T('2026-09-15', '15:30'), 40)), { alteUzine: [DRAX] });
  const rez2 = rezumaSaptamina(r2.e, r2.ctx);
  assert.equal(rez2.km, 0); assert.equal(rez2.iesiri.length, 0);
});
test('orice oprire la depozitul din Bălți e drum de parc (183BZP: 2′ și 6′)', () => {
  const r = et(urma(stai(POARTA, T('2026-09-15', '14:30'), 10), drum(POARTA, PARC, T('2026-09-15', '14:40'), 90), stai(PARC, T('2026-09-15', '16:10'), 3), drum(PARC, TODIRESTI, T('2026-09-15', '16:13'), 90)));
  assert.deepEqual([...new Set(etichete(r))], ['reparație']);
});

test('control: km_stationare = Σ kmZi − Σ curse', () => {
  const r = et(ziObisnuita('2026-09-15'));
  const suma = r.c.reduce((s, c) => s + c.km, 0);
  const rez = rezumaSaptamina(r.e, r.ctx, suma + 3.2);
  assert.ok(Math.abs(rez.control.km_stationare - 3.2) < 0.2);
});

test('apartenența la săptămână: cursa de duminică 13.09 nu intră în săptămâna 14–20.09', () => {
  const pts = urma(drum(TODIRESTI, FALESTI, T('2026-09-13', '16:00'), 40), drum(FALESTI, TODIRESTI, T('2026-09-13', '17:00'), 40), ziObisnuita('2026-09-15'));
  const r = et(pts, { inSapt: z => z >= '2026-09-14' && z <= '2026-09-20' });
  assert.equal(rezumaSaptamina(r.e, r.ctx).km, 0);
  const r2 = et(pts, { inSapt: z => z >= '2026-09-07' && z <= '2026-09-13' });
  assert.ok(rezumaSaptamina(r2.e, r2.ctx).km > 40);
});

test('iarna (UTC+2) aceleași ore de perete dau aceleași etichete ca vara', () => {
  const vara = et(ziObisnuita('2026-09-15', 3)), iarna = et(ziObisnuita('2026-11-17', 2));
  assert.deepEqual(etichete(vara), etichete(iarna));
  assert.deepEqual(vara.e.map(e => e.ancora?.tip), iarna.e.map(e => e.ancora?.tip));
});

// ─── Drăxlmaier (F3): mai multe porți, parcul lângă poarta VEST, fără schimb 3 ────────────────────
const EST = { lat: 47.78513, lon: 27.94307 }, VEST = { lat: 47.77408, lon: 27.91593 };
const SLOBOZIA = { lat: 47.7010, lon: 27.8290 }, PARC_B = { lat: 47.7700, lon: 27.9235 };
const FER_DRAX = [
  { sens: 'tur', shift_number: 1, de_la_min: 210, pana_la_min: 420 }, { sens: 'tur', shift_number: 2, de_la_min: 810, pana_la_min: 960 },
  { sens: 'retur', shift_number: 1, de_la_min: 900, pana_la_min: 1065 }, { sens: 'retur', shift_number: 2, de_la_min: 1380, pana_la_min: 105 }];
const ctxDrax = (extra = {}) => { const c = ctxDe({ casaC: SLOBOZIA, ferestre: FER_DRAX, parc: PARC_B, porti: [EST, VEST],
  praguri: { R_PARC: 0.5, R_PARC_ZONA: 1 }, ancoraBateParcul: true, schimb3: false, reparatieDoarFaraCurse: true, ...extra }); delete c.poarta; return c; };
const etD = (pts, extra) => { const ctx = ctxDrax(extra); const c = curseCuOpriri(pts, ctx); return { ctx, c, e: eticheteaza(c, ctx) }; };

test('helperul porților: porti ?? [poarta], idempotent; fără niciuna aruncă', () => {
  assert.deepEqual(portiDin({ poarta: POARTA }), [POARTA]);
  assert.deepEqual(portiDin({ porti: [EST, VEST], poarta: POARTA }), [EST, VEST]);
  assert.equal(distPoarta(TODIRESTI, { poarta: POARTA }), hav(TODIRESTI, POARTA), 'o poartă = exact hav de dinainte');
  assert.throws(() => portiDin({}), /fără poartă/);
});

test('nerecul: ctx vechi { poarta } și ctx nou { porti: [poarta] } dau aceleași etichete și același rezumat', () => {
  const pts = urma(ziObisnuita('2026-09-15'), drum(TODIRESTI, FALESTI, T('2026-09-15', '18:00'), 40), drum(FALESTI, TODIRESTI, T('2026-09-15', '19:00'), 40));
  const a = et(pts), ctxN = { ...ctxDe(), porti: [POARTA] }; delete ctxN.poarta;
  const cN = curseCuOpriri(pts, ctxN), eN = eticheteaza(cN, ctxN);
  assert.deepEqual(eN.map(x => [x.eticheta, x.motiv]), a.e.map(x => [x.eticheta, x.motiv]));
  assert.deepEqual(rezumaSaptamina(eN, ctxN), rezumaSaptamina(a.e, a.ctx));
});

test('ctx FĂRĂ poarta (doar porti): toate cele patru funcții merg, depMax și rCasa finite', () => {
  const r = etD(urma(drum(SLOBOZIA, EST, T('2026-09-15', '05:30'), 40), stai(EST, T('2026-09-15', '06:10'), 10), drum(EST, SLOBOZIA, T('2026-09-15', '06:20'), 40)));
  assert.ok(r.c.every(c => c.gol || Number.isFinite(c.depMax)));
  assert.ok(Array.isArray(caseSecundare(r.c, r.ctx)));
  const rez = rezumaSaptamina(r.e, r.ctx, 1);
  assert.ok(Number.isFinite(rez.km) && rez.control);
  assert.deepEqual([...new Set(r.e.map(x => x.eticheta))], ['muncă']);
});

test('două porți: sosire la VEST în fereastra tur s1 e ancoră ca la EST', () => {
  const r = etD(urma(drum(SLOBOZIA, VEST, T('2026-09-15', '05:30'), 40), stai(VEST, T('2026-09-15', '06:10'), 10), drum(VEST, SLOBOZIA, T('2026-09-15', '06:20'), 40)));
  assert.equal(r.e[0].ancora?.tip, 'tur');
});

test('schimb3: false — atingere a porții duminică 22:10 nu e ancoră (ancora === null); implicit (LEAR) e muncă', () => {
  const pts = urma(drum(SLOBOZIA, EST, T('2026-09-20', '21:30'), 40), stai(EST, T('2026-09-20', '22:10'), 10), drum(EST, SLOBOZIA, T('2026-09-20', '22:20'), 40));
  const r = etD(pts);
  assert.ok(r.e.every(x => x.ancora === null), 'fără ancoră de schimb 3');
  assert.ok(r.e.every(x => x.eticheta !== 'muncă'));
  const vechi = etD(pts, { schimb3: undefined });
  assert.equal(vechi.e.some(x => x.ancora?.schimb === 3), true, 'fără ctx.schimb3 regula LEAR rămâne');
});

test('schimb3: false — sosirea la poartă la 22:40 legată de returul s2 de la 00:10 rămâne muncă (041BRAU)', () => {
  const r = etD(urma(drum(SLOBOZIA, VEST, T('2026-09-15', '22:00'), 40), stai(VEST, T('2026-09-15', '22:40'), 90), drum(VEST, SLOBOZIA, T('2026-09-16', '00:10'), 40)));
  assert.deepEqual([...new Set(r.e.map(x => x.eticheta))], ['muncă']);
});

test('ancoraBateParcul: tur s1 la VEST → 3 h la parc (0,7 km) → retur s1 = muncă, nu reparație; fără steag = reparație', () => {
  const pts = urma(drum(SLOBOZIA, VEST, T('2026-09-15', '05:30'), 40), stai(VEST, T('2026-09-15', '06:10'), 10), drum(VEST, PARC_B, T('2026-09-15', '06:20'), 5),
    stai(PARC_B, T('2026-09-15', '06:25'), 500), drum(PARC_B, VEST, T('2026-09-15', '14:45'), 5), stai(VEST, T('2026-09-15', '14:50'), 20), drum(VEST, SLOBOZIA, T('2026-09-15', '15:10'), 40));
  assert.deepEqual([...new Set(etD(pts).e.map(x => x.eticheta))], ['muncă']);
  assert.ok(etD(pts, { ancoraBateParcul: false, reparatieDoarFaraCurse: false }).e.some(x => x.eticheta === 'reparație'));
});

test('reparatieDoarFaraCurse: oprire la parc în afara lanțului într-o zi de lucru = neclar; duminica fără muncă = reparație; implicit (LEAR) = reparație', () => {
  // tur s1 06:10 la EST, acasă; seara (în afara lanțului, după 3 h acasă) casă → parc 20′ → casă
  const zi = urma(drum(SLOBOZIA, EST, T('2026-09-15', '05:30'), 40), stai(EST, T('2026-09-15', '06:10'), 10), drum(EST, SLOBOZIA, T('2026-09-15', '06:20'), 40),
    drum(SLOBOZIA, PARC_B, T('2026-09-15', '19:00'), 40), stai(PARC_B, T('2026-09-15', '19:40'), 20), drum(PARC_B, SLOBOZIA, T('2026-09-15', '20:00'), 40));
  const r = etD(zi);
  assert.ok(r.e.some(x => x.eticheta === 'neclar' && /zi de lucru/.test(x.motiv)));
  assert.ok(!r.e.some(x => x.eticheta === 'reparație'));
  assert.ok(etD(zi, { reparatieDoarFaraCurse: undefined }).e.some(x => x.eticheta === 'reparație'), 'fără flag rămâne regula LEAR');
  const dum = urma(drum(SLOBOZIA, PARC_B, T('2026-09-20', '10:00'), 40), stai(PARC_B, T('2026-09-20', '10:40'), 60), drum(PARC_B, SLOBOZIA, T('2026-09-20', '11:40'), 40));
  assert.deepEqual([...new Set(etD(dum).e.map(x => x.eticheta))], ['reparație']);
});

test('distPoarta: o poartă = hav exact, inclusiv NaN (paritate cu originalul)', () => {
  const p = { lat: NaN, lon: 27.8 };
  assert.ok(Number.isNaN(distPoarta(p, { poarta: POARTA })) && Number.isNaN(hav(p, POARTA)));
  assert.equal(distPoarta(VEST, { porti: [EST, VEST] }), 0);
});

test('C2 (F3 r3): cursă care trece de luni 03:00 — cu bramburaPePasi totalul săptămânii = pașii din săptămână; implicit rămâne proporțional', () => {
  // 20 km: primii 10 (duminică 20.09, ziua de lucru până luni 03:00) pe drum neobișnuit, ultimii 10 (luni 21.09) pe drum obișnuit
  const pts = drum(FALESTI, TODIRESTI, T('2026-09-21', '02:40'), 40);
  const cursa = { pts, km: 20, kmPeZi: new Map([['2026-09-20', 10], ['2026-09-21', 10]]), opriri: [], atingeriPoarta: [], de_la: new Date(T('2026-09-21', '02:40')), pana_la: new Date(T('2026-09-21', '03:20')), p0: pts[0], p1: pts.at(-1), depMax: 5, parc: { zona: false, oprireMin: 0 } };
  const e = [{ i: 0, eticheta: 'muncă', motiv: 'în lanț', ancora: null, lant: 0, km_brambura: 10, bramburaPeZi: new Map([['2026-09-20', 10]]), km_alimentare: 0, cursa }];
  const inSapt = z => z >= '2026-09-14' && z <= '2026-09-20';
  const nou = rezumaSaptamina(e, ctxDe({ inSapt, bramburaPePasi: true }));
  const vechi = rezumaSaptamina(e, ctxDe({ inSapt }));
  assert.equal(nou.km_brambura, 10, 'pe pași: toți cei 10 km neobișnuiți sunt în săptămâna 14–20');
  assert.equal(vechi.km_brambura, 5, 'implicit (LEAR/SEBN): proporțional, 10 × 10/20');
  assert.equal(nou.iesiri.find(x => x.eticheta === 'brambura').km_brambura, 10, 'ieșirea poartă aceeași cifră ca totalul');
  // săptămâna următoare primește 0 km brambura din aceeași cursă (niciun km numărat de două ori)
  assert.equal(rezumaSaptamina(e, ctxDe({ inSapt: z => z >= '2026-09-21' && z <= '2026-09-27', bramburaPePasi: true })).km_brambura, 0);
});

test('C2: eticheteaza cu bramburaPePasi pune bramburaPeZi pe zilele pașilor; fără flag câmpul lipsește', () => {
  const dus = z => drum(TODIRESTI, POARTA, T(z, '13:55'), 35);
  const retur = z => urma(dus(z), stai(POARTA, T(z, '14:30'), 10), drum(POARTA, BOCSA, T(z, '14:40'), 45), stai(BOCSA, T(z, '15:25'), 25), drum(BOCSA, TODIRESTI, T(z, '15:50'), 40));
  const ocolit = z => urma(dus(z), stai(POARTA, T(z, '14:30'), 10), drum(POARTA, BOCSA, T(z, '14:40'), 45), stai(BOCSA, T(z, '15:25'), 25), drum(BOCSA, FALESTI, T(z, '15:50'), 30), drum(FALESTI, TODIRESTI, T(z, '16:20'), 40));
  const pts = urma(retur('2026-09-14'), retur('2026-09-15'), retur('2026-09-16'), ocolit('2026-09-17'));
  const r = et(pts, { bramburaPePasi: true }), r0 = et(pts);
  const b = r.e.find(x => x.km_brambura > 0), b0 = r0.e.find(x => x.km_brambura > 0);
  assert.ok(b.bramburaPeZi instanceof Map && [...b.bramburaPeZi.keys()].every(z => z === '2026-09-17'));
  assert.ok(Math.abs([...b.bramburaPeZi.values()].reduce((a, x) => a + x, 0) - b.km_brambura) < 0.1);
  assert.equal(b0.bramburaPeZi, null);
  assert.equal(rezumaSaptamina(r.e, r.ctx).km_brambura, rezumaSaptamina(r0.e, r0.ctx).km_brambura, 'cursa în întregime în săptămână: aceeași cifră');
});

test('R3-2 (F3 r4): brambura pe zile din rezumat — în ziua cu «altă uzină» Σ zile = total = 0; fără flag, câmpul lipsește', () => {
  const pts = drum(FALESTI, TODIRESTI, T('2026-09-16', '10:00'), 40);
  const cu = (km) => ({ pts, km, kmPeZi: new Map([['2026-09-16', km]]), opriri: [], atingeriPoarta: [], de_la: new Date(T('2026-09-16', '10:00')), pana_la: new Date(T('2026-09-16', '10:40')), p0: pts[0], p1: pts.at(-1), depMax: 5, parc: { zona: false, oprireMin: 0 } });
  const munca = { i: 0, eticheta: 'muncă', motiv: 'în lanț', ancora: null, lant: 0, km_brambura: 12, bramburaPeZi: new Map([['2026-09-16', 12]]), km_alimentare: 0, cursa: cu(20) };
  const alta = { i: 1, eticheta: 'altă uzină', motiv: 'oprește la poarta X', ancora: null, lant: null, km_brambura: 0, bramburaPeZi: null, km_alimentare: 0, uzina: 'X', cursa: cu(8) };
  const inSapt = z => z >= '2026-09-14' && z <= '2026-09-20';
  const r = rezumaSaptamina([munca, alta], ctxDe({ inSapt, bramburaPePasi: true }));
  assert.equal(r.km_brambura, 0);
  assert.equal(Object.values(r.brambura_pe_zi).reduce((a, x) => a + x, 0), 0);
  const r1 = rezumaSaptamina([munca], ctxDe({ inSapt, bramburaPePasi: true }));
  assert.equal(r1.km_brambura, 12); assert.deepEqual(r1.brambura_pe_zi, { '2026-09-16': 12 });
  assert.equal('brambura_pe_zi' in rezumaSaptamina([munca], ctxDe({ inSapt })), false);
});
