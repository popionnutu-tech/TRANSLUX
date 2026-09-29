// ION-130 (Ion, 28.09.2026): «ar fi bine să putem fiecare mașină s-o vizualizăm pe schelet, să fie o pagină separată în LDE, în care
// drumurile se arată detaliat la fiecare mașină pe hartă». Pasul scrie, pe mașină și zi, urma GPS a zilei tăiată pe aceleași intervale ca
// «Ziua făcută, drum cu drum» (seg din economie-zile.json), plus opririle ≥ 5 min, casa și locurile nopții → tabelul lde_harta_zi.
//
//   node --env-file=/root/lde-worker/.env harta-zi.mjs <dosarul săptămânii> [--write]
//
// Urma: punctele {t,lat,lon,v} și staționările {stat,t0,t1,lat,lon} (ora în t0/t1 — ION-128), simplificate Douglas–Peucker la 15 m.
// Fără --write doar numără și verifică: fiecare interval are urmă, km pe intervale = total zi (bilanțul din economie-zile).
import { readFileSync, existsSync } from 'node:fs';
import { valideazaParcare } from './parcare-valid.mjs';
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { hav, PORTI, PARC } = C;
const W = process.argv[2], WRITE = process.argv.includes('--write');
if (!W || !existsSync(`${W}/economie-zile.json`)) { console.error('harta-zi.mjs <dosarul săptămânii> [--write]'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const Z = J(`${W}/economie-zile.json`), A = J(`${W}/analiza.json`), EC = J(`${W}/economie.json`);
const ZI = existsSync(`${W}/ziua-ideala.json`) ? J(`${W}/ziua-ideala.json`) : { randuri: [] };
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const P = (a) => (a ? (Array.isArray(a) ? { lat: a[0], lon: a[1] } : { lat: a.lat, lon: a.lon }) : null);

// satele (OSM) pentru numele opririlor
const SATE = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue;
  let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  if (!/^(village|town|city|hamlet|suburb)$/.test(g.properties?.place ?? '')) continue;
  const [lon, lat] = g.geometry.coordinates; if (lat > 46.9 && lat < 48.6 && lon > 26.6 && lon < 29.2) SATE.push({ n: g.properties.name, lat, lon });
}
const ZONE = [...PORTI.map((g) => ({ n: `poarta ${g.n}`, lat: g.lat, lon: g.lon, r: g.r + 0.3 })), { n: 'Parcul Bălți', lat: PARC.lat, lon: PARC.lon, r: PARC.r + 0.2 }];
function numeLoc(p) {
  const z = ZONE.find((q) => hav(p, q) <= q.r); if (z) return z.n;
  let b = null, d = 1e9; for (const s of SATE) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } }
  return d <= 2 ? b : `${b} (${r1(d)} km)`;
}

function dp(Pt, eps) {   // Douglas–Peucker în metri, proiecție plană locală
  if (Pt.length < 3) return Pt;
  const k = 111320, c = Math.cos(Pt[0].lat * Math.PI / 180), X = Pt.map((p) => [p.lon * k * c, p.lat * k]);
  const keep = new Uint8Array(Pt.length); keep[0] = keep[Pt.length - 1] = 1; const st = [[0, Pt.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let m = -1, md = 0; const [x1, y1] = X[a], [x2, y2] = X[b], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - X[i][1]) - (x1 - X[i][0]) * (y2 - y1)) / L; if (d > md) { md = d; m = i; } }
    if (md > eps) { keep[m] = 1; st.push([a, m], [m, b]); }
  }
  return Pt.filter((_, i) => keep[i]);
}

const MUNCA = new Set(['intreUzine', 'deplasare', 'service']), UZINA = new Set(['parc', 'golTure']);
const tipIv = (cats) => (cats.cuOameni ? 'cursa' : Object.keys(cats).every((c) => MUNCA.has(c)) ? 'munca'
  : Object.keys(cats).every((c) => UZINA.has(c) || MUNCA.has(c)) ? 'uzina' : 'gol');
const casaDe = new Map(EC.masini.map((x) => [x.m, x.casa ? P(x.casa) : null]));
const masA = new Map(A.masini.map((x) => [x.m, x]));
const ecZi = new Map((ZI.randuri ?? []).map((r) => [`${r.m}|${r.z}`, r]));
// cifra săptămânii, aceeași ca în raport («Economie față de ziua ideală»): doar zilele măsurate, fără Bălți/pauză (separat)
// ION-136: parcarea propusă (1–2 locuri) — cifra din raport în locul zilei ideale; pe zi, locurile și drumurile propuse ale zilei
const PK = existsSync(`${W}/parcare.json`) ? J(`${W}/parcare.json`) : null;
// Codex r5 C2: aceeași validare ca scrie-parcare.mjs, ÎNAINTE de orice scriere (și de DELETE) — propunerea respinsă nu ajunge pe hartă
if (PK) { const rele = valideazaParcare(PK); if (rele.length) { console.error(`parcare.json respins: ${rele.join('; ')} — harta NU se scrie`); process.exit(1); } }
const pkM = new Map((PK?.masini ?? []).map((x) => [x.m, x]));
const ecSapt = new Map((ZI.masini ?? []).map((x) => [x.m, x.kmSapt12_2 ?? x.economieMasurata ?? null]));

const pkZi = (m, z) => { const x = pkM.get(m)?.zile.find((q) => q.z === z); return x && x.masurata ? x.economie : null; };
const randuri = []; const probe = { zile: 0, faraUrma: [], intervaleFaraPuncte: 0, difKm: [] };
for (const d of Z.zile) {
  const ma = masA.get(d.m); const det = ma?.detalii.find((x) => x.z === d.z);
  const f = `${W}/economie-urme/${d.dev ?? d.m}/${d.z}.json`;
  if (!existsSync(f)) { probe.faraUrma.push(`${d.m} ${d.z}`); continue; }
  const u = J(f); const pts = [];
  for (const p of u.pts ?? []) {
    if (p.mut || p.lat == null) continue;
    if (p.t == null && p.t0 != null) { pts.push({ lat: p.lat, lon: p.lon, t: p.t0, st: 1 }); if (p.t1 > p.t0) pts.push({ lat: p.lat, lon: p.lon, t: p.t1, st: 1 }); }
    else if (p.t != null) pts.push({ lat: p.lat, lon: p.lon, t: p.t });
  }
  pts.sort((a, b) => a.t - b.t);
  const t00 = Math.min(...d.seg.map((s) => s.t0));
  // intervalele zilei, în ordine (aceleași ca «Ziua făcută»: grupate pe t0–t1)
  const iv = new Map();
  for (const s of d.seg) {
    const k = `${s.t0}-${s.t1}`;
    if (!iv.has(k)) iv.set(k, { t0: s.t0, t1: s.t1, ora: s.ora, cats: {}, de: null, pana: null, ocol: false, lin: null, prelungit: null });
    const v = iv.get(k); v.cats[s.cat] = r1((v.cats[s.cat] ?? 0) + s.km);
    if (s.cat === 'cuOameni' || !v.de) { v.de = s.de ?? v.de; v.pana = s.pana ?? v.pana; }
    if (s.ocol) v.ocol = true; if (s.lin) v.lin = s.lin; if (s.prelungit) v.prelungit = s.prelungit.oras;
  }
  const IV = [...iv.values()].sort((a, b) => a.t0 - b.t0).map((v) => {
    const Q = pts.filter((p) => p.t >= v.t0 && p.t <= v.t1); const S = dp(Q, 15);
    if (Q.length < 2) probe.intervaleFaraPuncte++;
    return { ora: v.ora, t0: Math.round((v.t0 - t00) / 1000), t1: Math.round((v.t1 - t00) / 1000), tip: tipIv(v.cats), cats: v.cats,
      km: r1(Object.values(v.cats).reduce((a, b) => a + b, 0)), de: v.de, pana: v.pana, ocol: v.ocol, lin: v.lin, prelungit: v.prelungit,
      s: S.map((p) => [r5(p.lat), r5(p.lon), Math.round((p.t - t00) / 1000)]) };
  });
  // controlul: km-ii urmei (toate punctele, nu cele simplificate) față de totalul zilei; zilele cu «jumătăți» au golul de rută în afara
  // intervalelor (d.km.golRuta fără seg), deci km-ii intervalelor pot fi mai mici decât totalul — urma îl acoperă oricum
  const t11 = Math.max(...d.seg.map((s) => s.t1)), inZi = pts.filter((p) => p.t >= t00 && p.t <= t11);   // fișierul ține 00:00–28:00, ziua e 03:00–03:00
  let kmGps = 0; for (let i = 1; i < inZi.length; i++) kmGps += hav(inZi[i - 1], inZi[i]);
  if (Math.abs(kmGps - d.total) > Math.max(3, d.total * 0.05)) probe.difKm.push(`${d.m} ${d.z} GPS ${r1(kmGps)}/${d.total}`);
  // opririle ≥ 5 min (staționările), cu numele locului
  const stai = (u.pts ?? []).filter((p) => p.stat && p.t1 - p.t0 >= 5 * 60e3 && p.lat != null)
    .map((p) => [r5(p.lat), r5(p.lon), Math.round((p.t0 - t00) / 1000), Math.round((p.t1 - t00) / 1000), numeLoc(p)]);
  const casa = casaDe.get(d.m);
  const e = ecZi.get(`${d.m}|${d.z}`);
  randuri.push({
    uzina: 'DRAXELMAIER', saptamina: A.saptamina, m: d.m, z: d.z,
    sumar: { dow: d.dow, total: r1(d.total), cuOameni: r1(d.km.cuOameni ?? 0), gol: r1(d.total - (d.km.cuOameni ?? 0) - (d.km.intreUzine ?? 0)),
      // ziua intră în cifra săptămânii doar dacă e măsurată (luni–vineri, în eșantion, nu separată) — ca în raport; din ION-136 cifra = parcarea propusă
      economie: pkZi(d.m, d.z) ?? (PK ? null : (e && e.esant && !e.sep ? r1(e.economie) : null)), economieIdeal: e && e.esant && !e.sep ? r1(e.economie) : null, ideal: e ? r1(e.ideal) : null, motivAfara: e ? (e.motiv ?? (e.sep ? 'separat' : null)) : 'weekend',
      economieSapt: pkM.get(d.m)?.economieSapt ?? (PK ? 0 : ecSapt.get(d.m) ?? null), economieIdealSapt: ecSapt.get(d.m) ?? null, sursaEconomie: PK ? 'parcare' : 'ideal', locuri: (pkM.get(d.m)?.locuri ?? []).map((l) => l.n), linii: d.linii ?? [] },
    date: {
      t00, casa: casa ? { n: ma?.casa ?? numeLoc(casa), c: [r5(casa.lat), r5(casa.lon)] } : null,
      noapteA: d.noapteA ? { c: [r5(d.noapteA.lat), r5(d.noapteA.lon)], n: numeLoc(d.noapteA), min: d.noapteA.min } : null,
      noapteB: d.noapteB ? { c: [r5(d.noapteB.lat), r5(d.noapteB.lon)], n: numeLoc(d.noapteB), min: d.noapteB.min } : null,
      linii: d.linii ?? [], iv: IV, stai, zi: det ?? null,
      ideal: e ? { economie: r1(e.economie), cauze: e.cauze, intervale: e.intervale, jumatati: e.jumatati } : null,
      parcare: pkM.has(d.m) ? { locuri: pkM.get(d.m).locuri, economieSapt: pkM.get(d.m).economieSapt, idealSapt: pkM.get(d.m).idealSapt,
        zi: pkM.get(d.m).zile.find((x) => x.z === d.z) ?? null,
        // drumurile propuse ale zilei: golurile ei, noaptea care pleacă seara și noaptea care ajunge dimineața
        legi: pkM.get(d.m).legi.filter((l) => l.z === d.z || l.zUrm === d.z).map((l) => ({ ...l, seara: l.z === d.z, dimineata: l.parte === 'noapte' && l.zUrm === d.z })) } : null,
    },
  });
  probe.zile++;
}
const kb = Math.round(JSON.stringify(randuri).length / 1024);
console.log(`harta: ${probe.zile} zile · ${randuri.length} rânduri · ${kb} KB · fără urmă ${probe.faraUrma.length} · intervale fără puncte ${probe.intervaleFaraPuncte} · km diferiți ${probe.difKm.length}`);
if (probe.faraUrma.length) console.log('  fără urmă:', probe.faraUrma.join(', '));
if (probe.difKm.length) console.log("  urma GPS ≠ totalul zilei (> 5 %):", probe.difKm.slice(0, 12).join(", "));
if (probe.faraUrma.length > Z.zile.length * 0.05) { console.error("prea multe zile fără urmă"); process.exit(3); }
if (!WRITE) process.exit(0);

const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
// rerularea săptămânii înlocuiește tot: întâi se șterg rândurile ei (o mașină care a dispărut nu rămâne cu harta veche)
const del = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.DRAXELMAIER&saptamina=eq.${A.saptamina}`, { method: 'DELETE', headers: H });
if (!del.ok) { console.error('DELETE', del.status, await del.text()); process.exit(1); }
for (let i = 0; i < randuri.length; i += 40) {
  const r = await fetch(`${SB}/rest/v1/lde_harta_zi`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(randuri.slice(i, i + 40)) });
  if (!r.ok) { console.error('POST', r.status, await r.text()); process.exit(1); }
}
console.log(`scris: ${randuri.length} rânduri în lde_harta_zi DRAXELMAIER ${A.saptamina}`);
