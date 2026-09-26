// Drăxlmaier — rândul săptămânii în lde_analiza_reguli (uzina «DRAXELMAIER»), v5 (triajele F3 r1–r4).
// Tipuri PROPRII Drăxlmaier (verdictul 1; abatere consemnată de la contractul F2 S7): apps/admin/src/lib/lde/drax-analiza.ts le descrie.
// `date` = { uzina, saptamina, pana_la, total, zile, zileBilantOk, masini[], rute[], economie, indicatii, deLamurit, timp_liber, control }.
//   masini[] = flota rândului (economie.json → masini), un rând pe mașină (B3); liber din liber.json (prioritatea F2, B1);
//   lista «de lămurit» (de-lamurit.json lângă script; verdictul 4 precizat de Codex): doar INTERVALELE listate ies — zilele din
//   «economie» (cu categoriile lor) din R1a / R1b / R3 ai mașinii, zilele din «alarma» din §11 (liber.mjs); restul mașinii rămâne.
// Cu --write: upsert REST în lde_analiza_reguli (on_conflict=uzina,saptamina, rulat_la = acum), DOAR cu P10 și P10c trecute și
// invarianții de mai jos; altfel analiza-respinsa.json și cod 1 (paznicul vede lipsa rândului). Fără --write: doar analiza.json.
//   node --env-file=/root/lde-worker/.env scrie-analiza.mjs <ECON_D> [--write]
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPlaces, buildPlacesIndex } from '/root/lde-worker/places-index.mjs';

const WRITE = process.argv.includes('--write');
const DIR = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!DIR || !existsSync(`${DIR}/economie.json`) || !existsSync(`${DIR}/liber.json`)) { console.error('scrie-analiza.mjs <ECON_D> [--write] (lipsește economie.json / liber.json)'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
const A = J('economie.json'), Z = J('economie-zile.json'), L = J('liber.json');
const Pr = existsSync(`${DIR}/economie-probe.json`) ? J('economie-probe.json') : {}, C = existsSync(`${DIR}/economie-control.json`) ? J('economie-control.json') : {};
const DL = existsSync(new URL('./de-lamurit.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('./de-lamurit.json', import.meta.url), 'utf8')) : [];
const deLamurit = new Map(DL.map((x) => [x.m, x.motiv]));
const dowZi = (z) => { const d = new Date(z + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
// zilele-mașină ale căror componente §8 sunt «de lămurit»: livrare → R1a + R1b, golTure → R3 (categoriile din intrarea «economie»)
const dlEcon = (m, x) => { const e = DL.find((q) => q.m === m)?.economie; if (!e) return null;
  if (!((e.zile ?? []).includes(x.z) || (e.dow ?? []).includes(dowZi(x.z)))) return null;
  const cat = new Set(e.cat ?? ['livrare', 'golTure']);
  return { R1a: cat.has('livrare') ? x.R1a ?? 0 : 0, R1b: cat.has('livrare') ? x.R1b ?? 0 : 0, R3: cat.has('golTure') ? x.R3 ?? 0 : 0 }; };
const idx = buildPlacesIndex(loadPlaces('/root/lde-worker/places.geojsonseq'));
const loc = (c) => (c ? idx.nearestWithin({ lat: c[0], lon: c[1] }, 3.8)?.name ?? null : null);
const r1 = (x) => Math.round((x ?? 0) * 10) / 10;
const CAT = ['cuOameni', 'livrare', 'golRuta', 'golTure', 'parc', 'service', 'deplasare', 'legatura', 'necunoscut'];
const [luni, dum] = Object.values(A.fereastra)[0];
const liberDe = new Map(L.masini.map((m) => [m.masina, m]));
const peZi = new Map(A.zile.map((x) => [`${x.m}|${x.z}`, x]));
const nume = (lin) => (lin ? lin.split('|').join(' · ') : null);
// indicații (verdictul 2): prag 100 km/săpt. (LEAR 12.2) pe R1b + R3 EXTRAPOLAT (km/zi măsurați × zilele lucrate), ≥ 3 zile măsurate
export const PRAG_INDICATII_KM = 100, MIN_ZILE_MASURATE = 3, MAX_INDICATII = 3;

const masini = A.masini.map((m) => {
  const zile = Z.zile.filter((d) => d.m === m.m).sort((a, b) => a.z.localeCompare(b.z));
  const rute = new Map();
  for (const d of zile) for (const s of d.seg) if (s.cat === 'cuOameni' && s.lin) {
    const r = rute.get(s.lin) ?? rute.set(s.lin, { r: s.lin, nume: nume(s.lin), curse: 0, km: 0, zile: new Set() }).get(s.lin);
    r.curse++; r.km += s.km; r.zile.add(d.z); }
  const Lm = liberDe.get(m.m), liber = Lm?.liber ?? null;
  const brZi = new Map(Object.entries(Lm?.bramburaPeZi ?? {}));
  // «de lămurit»: componentele zilelor listate ies din R1a / R1b / R3 (doar zilele eșantionului, ca m.R1a…); B = suma rămasă
  const scos = { R1a: 0, R1b: 0, R3: 0 };
  for (const x of A.zile.filter((q) => q.m === m.m && !q.exclus)) { const d = dlEcon(m.m, x); if (d) for (const k of Object.keys(scos)) scos[k] += d[k]; }
  const ec = { R1a: r1(m.R1a - scos.R1a), R1b: r1(m.R1b - scos.R1b), R3: r1(m.R3 - scos.R3) }; ec.B = r1(ec.R1a + ec.R1b + ec.R3);
  const ext = (k) => (m.zileIncluse ? r1((ec[k] ?? 0) / m.zileIncluse * m.zile) : null);
  const extScos = (k) => (m.zileIncluse ? r1(scos[k] / m.zileIncluse * m.zile) : 0);
  const dl = deLamurit.get(m.m) ?? null;
  return {
    m: m.m, zile: m.zile, zileIncluse: m.zileIncluse, zileExcluse: m.zileExcluse, total: m.total,
    km: Object.fromEntries(CAT.map((k) => [k, m.km[k] ?? 0])),
    rute: [...rute.values()].map((r) => ({ ...r, km: r1(r.km), zile: r.zile.size })),
    casa: m.casa ? loc([m.casa.lat, m.casa.lon]) : null, casaKmPoarta: m.casa?.kmPoarta ?? null,
    // §8: regula B, măsurat pe zilele eșantionului + extrapolarea mașinii; A doar referință (8.4)
    regula: 'B', economie: { ...ec, A: m.A, nelamurit: m.nelamurit },
    extrapolat: { R1a: ext('R1a'), R1b: ext('R1b'), R3: ext('R3'), B: ext('B') }, Amaibun: m.Amaibun,
    deLamuritScos: { R1a: extScos('R1a'), R1b: extScos('R1b'), R3: extScos('R3'), B: r1(extScos('R1a') + extScos('R1b') + extScos('R3')), masurat: { R1a: r1(scos.R1a), R1b: r1(scos.R1b), R3: r1(scos.R3) } },
    dejaLangaUzina: { intervale: m.deja.n, km: m.deja.km },
    nelamuritLista: m.nelamuritLista ?? [], curseDePranz: m.curseDePranz ?? { intervale: 0, km: 0, lista: [] },
    lei: { masurat: m.lei?.B != null && m.B ? Math.round(m.lei.B * ec.B / m.B) : m.lei?.B ?? null,
      extrapolat: m.lei?.B != null && m.zileIncluse && m.B ? Math.round(m.lei.B * ec.B / m.B / m.zileIncluse * m.zile) : null }, normaLipsa: m.normaLipsa,
    deLamurit: dl, liber, liberBrut: Lm?.brut ?? null, kmExplicatF2: Lm?.km_explicat_f2 ?? null, steaguriLiber: Lm?.steaguri ?? (Lm ? [] : ['fără analiza timpului liber']),
    detalii: zile.map((d) => {
      const x = peZi.get(`${d.m}|${d.z}`);
      return { z: d.z, dow: d.dow, total: d.total, km: Object.fromEntries(CAT.map((k) => [k, d.km[k] ?? 0])), brambura: r1(brZi.get(d.z) ?? 0),
        bilant: d.bilant, dif: d.dif, tipar: d.tipar, exclus: x?.exclus ?? null,
        noapteDim: d.noapteA ? (d.noapteA.tip === 'loc' ? loc([d.noapteA.lat, d.noapteA.lon]) : d.noapteA.tip) : null,
        noapteSeara: d.noapteB ? (d.noapteB.tip === 'loc' ? loc([d.noapteB.lat, d.noapteB.lon]) : d.noapteB.tip) : null,
        economie: x ? { R1a: x.R1a, R1b: x.R1b, R3: x.R3, B: x.B, nelamurit: x.nelamurit } : null,
        bucati: d.seg.map((s) => ({ ora: s.ora, t0: s.t0, t1: s.t1, cat: s.cat, km: s.km, golImpus: s.golImpus || 0, ocol: !!s.ocol,
          r3: s.cat === 'golTure' ? r1(s.r3km) : undefined, inZona: s.cat === 'golTure' ? r1(s.kmZona) : undefined, pranz: !!s.cursaPranz,
          de: loc(s.de), pana: loc(s.pana), lin: s.lin, motiv: s.motiv ?? null })) };
    }),
  };
});
// indicațiile (se scriu, NU pleacă până la «da»)
const cand = masini.filter((m) => m.zileIncluse >= MIN_ZILE_MASURATE)
  .map((m) => ({ m: m.m, R1b: m.extrapolat.R1b ?? 0, R3: m.extrapolat.R3 ?? 0, R1a: m.extrapolat.R1a ?? 0, zile: `${m.zileIncluse}/${m.zile}` }))
  .map((x) => ({ ...x, R1bR3: r1(x.R1b + x.R3) })).filter((x) => x.R1bR3 >= PRAG_INDICATII_KM).sort((a, b) => b.R1bR3 - a.R1bR3);
const indicatii = { prag_km: PRAG_INDICATII_KM, peste_prag: cand.length, top: cand.slice(0, MAX_INDICATII) };
const rute = new Map();
for (const d of Z.zile) for (const s of d.seg) if (s.cat === 'livrare' && s.lin) {
  const r = rute.get(s.lin) ?? rute.set(s.lin, { id: s.lin, nume: nume(s.lin), livrare: 0, masini: new Set() }).get(s.lin);
  r.livrare += s.km; r.masini.add(d.m); }
const t = A.flota.toate;
const faraDL = (k) => r1(t.masurat[k] - masini.filter((m) => m.deLamurit).reduce((a, m) => a + (m.economie[k] ?? 0), 0));
// Triaj r2 (B-N2): cardurile (pagină + poster) = Σ rândurilor afișate, fără mașinile «de lămurit»; extrapolarea pe mașină (km/zi × zilele ei).
// Cifra F2 a flotei (km/zi al flotei × zile-mașină) rămâne doar ca referință, sub numele «referintaF2».
// F3 r3 (Codex #4): mașinile «de lămurit» RĂMÂN în carduri, în B și în indicații (luni–joi e muncă F2); se suspendă doar alarma §11
const vizibile = masini;
const sumaR = (f) => r1(vizibile.reduce((a, m) => a + (f(m) ?? 0), 0));
const carduri = { masini: vizibile.length, nemasurate: vizibile.filter((m) => m.extrapolat.B == null).map((m) => m.m),
  R1a: sumaR((m) => m.extrapolat.R1a), R1b: sumaR((m) => m.extrapolat.R1b), R3: sumaR((m) => m.extrapolat.R3), B: sumaR((m) => m.extrapolat.B),
  R1bR3: sumaR((m) => (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0)), lei: Math.round(vizibile.reduce((a, m) => a + (m.lei.extrapolat ?? 0), 0)),
  // «din care N km scoși ca de lămurit» (R3-2 business): pe poster și pe pagină, lângă cardul B
  deLamurit: { masini: [...deLamurit.keys()], B: sumaR((m) => m.deLamuritScos.B), R1a: sumaR((m) => m.deLamuritScos.R1a), R1b: sumaR((m) => m.deLamuritScos.R1b), R3: sumaR((m) => m.deLamuritScos.R3) } };
// săptămâna atipică (B-N6): flota < ½ din flota săptămânii precedente (dosarul ei, dacă există)
const prevDir = DIR.replace(/\d{4}-\d{2}-\d{2}\/?$/, (() => { const x = new Date(luni + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 7); return x.toISOString().slice(0, 10); })());
const flotaPrev = prevDir !== DIR && existsSync(`${prevDir}/economie.json`) ? JSON.parse(readFileSync(`${prevDir}/economie.json`, 'utf8')).masini.length : null;
const saptAtipica = flotaPrev != null && A.masini.length < 0.5 * flotaPrev;
const date = {
  uzina: 'DRAXELMAIER', saptamina: luni, pana_la: dum,
  total: { ...Object.fromEntries(CAT.map((k) => [k, t.km[k] ?? 0])), brambura: L.timp_liber.km_brambura_total },
  zile: Z.zile.length, zileBilantOk: Z.zile.filter((d) => d.bilant).length,
  masini, rute: [...rute.values()].map((r) => ({ ...r, livrare: r1(r.livrare), masini: [...r.masini] })).sort((a, b) => b.livrare - a.livrare),
  economie: { regula: 'B', formulare: 'cost de azi (bază de analiză), nu economie garantată', zileLV: t.zileLV, esantion: t.esantion, nedetectate: t.nedetectate,
    carduri, referintaF2: { extrapolare: t.extrapolare, lei: t.lei.extrapolare.B, nota: 'km/zi al flotei × zile-mașină, cu mașinile «de lămurit»; nu se afișează ca card' },
    saptAtipica, flotaPrecedenta: flotaPrev,
    masurat: t.masurat, masuratFaraDeLamurit: { R1a: faraDL('R1a'), R1b: faraDL('R1b'), R3: faraDL('R3'), B: faraDL('B') },
    peZiMasina: t.peZiMasina, extrapolare: t.extrapolare, r3citiri: t.r3, deja: t.deja, atipice: A.atipice,
    lei: { masurat: t.lei.masurat.B, extrapolat: t.lei.extrapolare.B }, P8: { intervale: A.flota.P8.intervale, pica: A.flota.P8.pica, plafon: A.flota.P8.plafon },
    Areferinta: A.flota.Areferinta.masini, nemasurate: A.flota.nemasurate, putinMasurate: A.flota.putinMasurate, weekend: A.flota.weekend,
    r2: { propus: false, castigFlota: A.r2.castigFlota, castigBrut: A.r2.castigBrut, pierderi: A.r2.pierderi }, normaLipsa: A.normaLipsa },
  indicatii, deLamurit: DL,
  referinte: Object.fromEntries(['schelet-ideal', 'curse-ideal', 'obs-ideal', 'nomenclator', 'dubluri-ideal'].filter((f) => existsSync(`${DIR}/${f}.json`))
    .map((f) => [f, createHash('md5').update(readFileSync(`${DIR}/${f}.json`)).digest('hex')])),
  timp_liber: L.timp_liber,
  control: { probe: Object.fromEntries(Object.entries(Pr).filter(([k]) => /^P[1-9]/.test(k)).map(([k, v]) => [k, { conditie: v.conditie, trec: v.trec, pica: v.pica }])),
    P10: { masini: L.p10.masini, pica: L.p10.pica, picaC: L.p10.picaC, pasi: L.p10.pasi,
      scoasDePrioritateaF2: { liber: r1(L.p10.suprapusInainte.liber), brambura: r1(L.p10.suprapusInainte.brambura) } },
    bilant: C.bilant ?? null, schimb3: C.schimb3 ? { inAfaraFerestrelor: C.schimb3.inAfaraFerestrelor } : null },
};
// alarma §11 nu vine pe mașinile «de lămurit» (verdictul 4)
// alarma §11: liber.mjs a scos deja din §11 doar zilele «alarma» din de-lamurit.json (km-ii lor în km_de_lamurit, pe pagină); restul alarmează
// invarianți la scriere
const sb = r1(date.masini.reduce((a, m) => a + (m.liber?.km_brambura ?? 0), 0));
if (Math.abs(sb - date.timp_liber.km_brambura_total) > 0.5) { console.error(`invariant: Σ brambura pe rânduri ${sb} ≠ total ${date.timp_liber.km_brambura_total}`); process.exit(1); }
for (const m of date.masini) { const s = r1(m.nelamuritLista.filter((q) => !q.exclus).reduce((a, q) => a + q.km, 0));
  if (Math.abs(s - (m.economie.nelamurit ?? 0)) > 0.3) { console.error(`invariant: ${m.m} Σ nelamuritLista ${s} ≠ nelamurit ${m.economie.nelamurit}`); process.exit(1); } }
// invariant la scriere (B-N2): fiecare card = Σ rândurilor afișate ± 1 km
for (const k of ['R1a', 'R1b', 'R3', 'B']) { const x = r1(date.masini.reduce((a, m) => a + (m.extrapolat[k] ?? 0), 0));
  if (Math.abs(x - date.economie.carduri[k]) > 1) { console.error(`invariant: cardul ${k} ${date.economie.carduri[k]} ≠ Σ rânduri ${x}`); process.exit(1); } }
for (const m of date.masini) { const zb = r1(m.detalii.reduce((a, d) => a + d.brambura, 0)), mb = r1(m.liber?.km_brambura ?? 0);
  if (Math.abs(zb - mb) > 0.5) { console.error(`invariant: ${m.m} Σ brambura pe zile ${zb} ≠ mașină ${mb}`); process.exit(1); } }
const s = JSON.stringify(date);
// P10 / P10c picat = rândul NU se scrie (eroare zgomotoasă; paznicul vede lipsa rândului); diagnosticul rămâne în dosar
if (L.p10.pica.length || L.p10.picaC.length) { writeFileSync(`${DIR}/analiza-respinsa.json`, s);
  console.error(`P10 picat: ${L.p10.pica.length} pe sume, ${L.p10.picaC.length} pe pași — rândul NU se scrie (${DIR}/analiza-respinsa.json)`); process.exit(1); }
writeFileSync(`${DIR}/analiza.json`, s);
rmSync(`${DIR}/analiza-respinsa.json`, { force: true });   // o respingere veche nu mai e valabilă
const note = `${masini.length} mașini · carduri (Σ rânduri): B ${carduri.B} · R1b+R3 ${carduri.R1bR3} (referință F2: B ${t.extrapolare.B})${saptAtipica ? ' · SĂPTĂMÂNĂ ATIPICĂ' : ''} · măsurat B ${t.masurat.B} km (cost de azi) pe ${t.esantion}/${t.zileLV} zile · R1b ${t.masurat.R1b} · liber ${L.timp_liber.km_total} · brambura ${L.timp_liber.km_brambura_total} · indicații ${indicatii.peste_prag} peste prag · P10 ${L.p10.masini - L.p10.pica.length}/${L.p10.masini} · bilanț ${date.zileBilantOk}/${date.zile}`;
console.log(`${luni} → ${dum}: ${note} · top: ${indicatii.top.map((x) => `${x.m} ${x.R1bR3}`).join(', ') || '—'} · date ${(s.length / 1024).toFixed(0)} KB`);
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc (--env-file=/root/lde-worker/.env)'); process.exit(1); }
const r = await fetch(`${SB}/rest/v1/lde_analiza_reguli?on_conflict=uzina,saptamina`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ uzina: 'DRAXELMAIER', saptamina: luni, rulat_la: new Date().toISOString(), date, note }),
});
if (!r.ok) { console.error(`lde_analiza_reguli: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
console.log(`scris: lde_analiza_reguli DRAXELMAIER ${luni}`);
