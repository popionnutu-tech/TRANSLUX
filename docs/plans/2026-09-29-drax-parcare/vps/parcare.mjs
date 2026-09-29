// ION-136 (Ion, 29.09.2026): «hai maximele teoretice să le scoatem, ele nu pot fi realizate în realitate»; «cum putem aceste reguli aplica
// pentru toate mașinile cu 2 rute capăt diferit?»; «poți oferi 2 locuri propuneri, pe hartă ele să fie evidențiate clar».
// Economia REALISTĂ: fiecare mașină primește unul sau două locuri de parcare (oraș / sat în zona rutelor, parcul Bălți sau casa). Între două
// curse din locuri diferite (> 3 km) și noaptea, mașina merge de la capătul cursei la un loc de parcare și de acolo la plecarea următoare;
// cursele din același loc (tur și retur la uzină) nu cer drum. Plimbatul pe loc rămâne muncă (ION-133), km obligatorii rămân ca în ziua ideală.
//
//   node parcare.mjs <dosarul săptămânii>          → <dosar>/parcare.json (nimic în bază; scrie-parcare.mjs scrie)
//
// Drumul pe șosea = Valhalla × 1,05 (ca legăturile fără observații GPS din ziua ideală). Noaptea se împarte pe jumătate între cele două zile.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { hav, kmDrum, salveazaCache, PARC, PORTI } = C;
const laUzina = (p) => hav(p, PARC) <= 3 || PORTI.some((q) => hav(p, q) <= 3);   // zona uzinei (PR.ZONA_KM)
const W = process.argv[2];
if (!W || !existsSync(`${W}/ziua-ideala.json`)) { console.error('parcare.mjs <dosarul săptămânii> (lipsește ziua-ideala.json)'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const Z = J(`${W}/economie-zile.json`), EC = J(`${W}/economie.json`), ZI = J(`${W}/ziua-ideala.json`);
const r1 = (x) => Math.round(x * 10) / 10, P = (a) => (a ? (Array.isArray(a) ? { lat: a[0], lon: a[1] } : { lat: a.lat, lon: a.lon }) : null);
const ACELASI_KM = 1.5, RAZA_CAND = 15, PRAG_AL_DOILEA = 20, MIN_DRUMURI = 3, TOLERANTA = 20, OPRIRE_LUNGA_MIN = 60, VAL_F = 1.05;
const PARAM = { NOAPTE: 'legătura nopții (ideal, E → S) + ocolul prin loc între aceleași ancore E / S + legăturile interne ale jumătăților', FARA_UZINA: 'Bălți / parcul Bălți doar dacă mașina deja stă acolo', ACELASI_KM, RAZA_CAND, PRAG_AL_DOILEA, MIN_DRUMURI, TOLERANTA, OPRIRE_LUNGA_MIN, VAL_F };

const LOC = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  if (!/^(village|town|city)$/.test(g.properties?.place ?? '')) continue;
  const [lon, lat] = g.geometry.coordinates; if (lat > 46.9 && lat < 48.6 && lon > 26.6 && lon < 29.2) LOC.push({ n: g.properties.name, lat, lon, fel: g.properties.place });
}
const RZ = new Map(ZI.randuri.map((r) => [`${r.m}|${r.z}`, r]));
// Codex r4 C2: fără ancorele nopții (ziua ideală de dinainte de ION-136) calculul NU pornește — nu există rezervă pe capetele curselor
if (!ZI.randuri.some((r) => r.ancore)) { console.error('ziua-ideala.json fără ancore (E / S) — rulează întâi ziua-ideala.mjs (ION-136); parcarea NU se calculează'); process.exit(3); }
const DOAR = process.env.PARCARE_DOAR ? new Set(process.env.PARCARE_DOAR.split(',')) : null;   // pentru probe
const ZIM = new Map(ZI.masini.map((x) => [x.m, x]));
const casaDe = new Map(EC.masini.map((x) => [x.m, x.casa ? { ...P(x.casa), n: x.casaNume ?? null } : null]));
const numeCasa = new Map((J(`${W}/analiza.json`).masini ?? []).map((x) => [x.m, x.casa]));
const drumCache = new Map();
const drum = async (a, b) => { const k = `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
  if (!drumCache.has(k)) { const d = hav(a, b) < 0.3 ? hav(a, b) : ((await kmDrum(a, b)) ?? hav(a, b) * 1.4) * VAL_F; drumCache.set(k, d); } return drumCache.get(k); };

// capetele curselor din urma GPS (primul punct ≥ t0, ultimul ≤ t1; staționările au ora în t0/t1 — ION-128)
function urma(dev, z) {
  const f = `${W}/economie-urme/${dev}/${z}.json`; if (!existsSync(f)) return [];
  const Q = []; for (const p of J(f).pts ?? []) { if (p.mut || p.lat == null) continue;
    if (p.t == null && p.t0 != null) { Q.push({ lat: p.lat, lon: p.lon, t: p.t0, st: 1, t1: p.t1 }); if (p.t1 > p.t0) Q.push({ lat: p.lat, lon: p.lon, t: p.t1 }); } else if (p.t != null) Q.push(p); }
  return Q.sort((a, b) => a.t - b.t);
}
const peM = new Map(); for (const d of Z.zile) (peM.get(d.m) ?? peM.set(d.m, []).get(d.m)).push(d);
const masini = [];
for (const [m, zile] of peM) {
  if (DOAR && !DOAR.has(m)) continue;
  zile.sort((a, b) => a.z.localeCompare(b.z));
  const Z2 = zile.map((d) => {
    const Q = urma(d.dev ?? d.m, d.z);
    const curse = d.seg.filter((s) => s.cat === 'cuOameni').sort((a, b) => a.t0 - b.t0).map((s) => {
      const a = Q.find((p) => p.t >= s.t0) ?? null, b = [...Q].reverse().find((p) => p.t <= s.t1) ?? null;
      return { t0: s.t0, t1: s.t1, ora: s.ora, de: a, pana: b, deN: s.de, panaN: s.pana };
    }).filter((c) => c.de && c.pana);
    const golDupa = (t) => d.seg.find((s) => s.cat !== 'cuOameni' && s.t0 === t)?.ora ?? null;
    const golInainte = (t) => d.seg.find((s) => s.cat !== 'cuOameni' && s.t1 === t)?.ora ?? null;
    const lungi = Q.filter((p) => p.st === 1 && p.t1 - p.t >= OPRIRE_LUNGA_MIN * 60e3);
    return { d, curse, golDupa, golInainte, lungi, r: RZ.get(`${d.m}|${d.z}`) };
  }).filter((x) => x.curse.length);
  if (!Z2.length) continue;
  const masurat = (z) => { const r = RZ.get(`${m}|${z}`); return !!(r && r.esant && !r.sep); };
  const pondM = (l) => Object.entries(l.pondere).reduce((s, [z, w]) => s + (masurat(z) ? w : 0), 0);
  // drumurile de acoperit: între curse din locuri diferite (> 1,5 km, ca LOC_KM al zilei ideale) și noaptea (ultimul capăt → primul capăt al zilei
  // următoare cu curse, circular ca ziua ideală). Nopțile în Bălți și pauzele > 1 zi (separat în ziua ideală) nu intră.
  const legi = [], fixe = [];   // fixe = legăturile interne ale nopților (Codex r2 C2), aceleași oricare ar fi locul
  Z2.forEach((x, k) => {
    for (let i = 0; i + 1 < x.curse.length; i++) { const a = x.curse[i], b = x.curse[i + 1];
      const oraG = x.golDupa(a.t1), ivI = x.r?.intervale?.find((v) => v.ora === oraG);
      // golul fără km neobligatorii în ziua ideală (lângă uzină, între uzine, parc — muncă) și golul cu ambele capete în zona uzinei nu e drum de acoperit
      const doarMunca = (ivI && !(ivI.neobl > 0)) || (laUzina(a.pana) && laUzina(b.de));
      if (!doarMunca && hav(a.pana, b.de) > ACELASI_KM) legi.push({ z: x.d.z, parte: 'intre', direct: ivI ? ivI.leg : null, ora: oraG ?? `${a.ora.slice(-5)}–${b.ora.slice(0, 5)}`, a: a.pana, b: b.de, aN: a.panaN, bN: b.deN, pondere: { [x.d.z]: 1 } }); }
    const u = Z2[(k + 1) % Z2.length], a = x.curse.at(-1), b = u.curse[0];
    // Codex r3 C2: ocolul nopții între ACELEAȘI ancore ca legătura ideală — E = sfârșitul ultimei deplasări obligatorii, S = începutul primei (ziua ideală)
    const aE = P(x.r?.ancore?.E), bS = P(u.r?.ancore?.S), faraAncore = !aE || !bS;
    const jS = x.r?.jumatati?.find((j) => j.part === 'seara'), jD = u.r?.jumatati?.find((j) => j.part === 'dim');
    const catN = jS?.cat ?? null, separat = catN === 'balti' || catN === 'pauza';
    // cota nopții pe zile ca în ziua ideală (partNoapte = legătura × km reali ai jumătății / km reali ai nopții; fără km → ½)
    const rs = jS?.real ?? 0, rd = jD?.real ?? 0, ws = rs + rd > 0 ? rs / (rs + rd) : 0.5;
    if (!separat) { if (jS?.legaturaInterna > 0) fixe.push({ z: x.d.z, km: jS.legaturaInterna }); if (jD?.legaturaInterna > 0) fixe.push({ z: u.d.z, km: jD.legaturaInterna }); }
    legi.push({ z: x.d.z, zUrm: u.d.z, parte: 'noapte', catN, separat, direct: jS ? jS.legNoapte : null, ora: x.golDupa(a.t1), oraDim: u.golInainte(b.t0), a: aE ?? a.pana, b: bS ?? b.de, aN: a.panaN, bN: b.deN, ancore: !faraAncore,
      pondere: separat ? {} : (u.d.z === x.d.z ? { [x.d.z]: 1 } : { [x.d.z]: ws, [u.d.z]: 1 - ws }) });
  });
  const M0 = Z2.filter((x) => masurat(x.d.z)).length, zm = ZIM.get(m), zileLV = zm?.zileLV ?? M0, wF = M0 ? zileLV / M0 : 1;
  const sepMasina = Z2.some((x) => x.r?.sep);
  // candidații: TOATE satele / orașele la ≤ 15 km de un capăt, parcul Bălți, casa (candidat obișnuit — runda 1, auditorul Claude: fără preselecție)
  const capete = Z2.flatMap((x) => x.curse.flatMap((c) => [c.de, c.pana]));
  const casa = casaDe.get(m);
  const cand = LOC.filter((L) => capete.some((p) => hav(p, L) <= RAZA_CAND)).map((L) => ({ n: L.n, lat: L.lat, lon: L.lon, fel: L.fel }));
  cand.push({ n: 'Parcul Bălți', lat: PARC.lat, lon: PARC.lon, fel: 'parc' });
  if (casa) cand.push({ n: `acasă (${numeCasa.get(m) ?? 'casa șoferului'})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
  // preferința la scor apropiat: locul unde mașina deja stă ≥ 60 min (urma) > oraș > sat
  const opriri = Z2.flatMap((x) => x.lungi);
  for (const c of cand) c.pref = opriri.some((o) => hav(o, c) <= 1) ? 2 : (c.fel === 'town' || c.fel === 'city') ? 1 : 0;
  // Ion, 28.09.2026 (ION-120): «scoate regula 2 în general» — «rămâne la uzină» nu se propune: Bălți și parcul Bălți (zona uzinei, ≤ 3 km de porți /
  // parc, sau orașul Bălți) sunt candidați doar pentru mașina care DEJA stă acolo ≥ 60 min
  for (let q = cand.length - 1; q >= 0; q--) { const c = cand[q]; if ((laUzina(c) || c.n === 'Bălți') && c.pref !== 2) cand.splice(q, 1); }
  // costul prin loc = drumul direct al zilei ideale + ocolul prin loc (Valhalla × 1,05)
  const cost = []; for (const l of legi) { const dAB = await drum(l.a, l.b); const baza = l.direct ?? dAB; l.dirSrc = l.direct != null ? 'ideal' : 'valhalla';
    const row = []; for (const L of cand) row.push(baza + Math.max(0, (await drum(l.a, L)) + (await drum(L, l.b)) - dAB)); cost.push(row); }
  const alege = (idx, i) => idx.reduce((bj, jj) => (cost[i][jj] < cost[i][bj] ? jj : bj), idx[0]);
  const totalCu = (idx) => legi.reduce((s, l, i) => s + pondM(l) * cost[i][alege(idx, i)], 0);
  const folosit = (idx, j) => legi.filter((l, i) => pondM(l) > 0 && alege(idx, i) === j).length;
  let ales = null, b1 = null, b2 = null, motivFara = null;
  if (!M0) motivFara = 'nicio zi măsurată';
  else if (legi.some((l) => l.parte === 'noapte' && !l.separat && !l.ancore)) motivFara = 'lipsesc ancorele nopții în ziua ideală — se rulează întâi ziua-ideala.mjs';
  else if (sepMasina) motivFara = 'în afara totalului (posibilă cursă nedetectată)';
  else {
    for (let j = 0; j < cand.length; j++) { const t = totalCu([j]); if (!b1 || t < b1.t) b1 = { idx: [j], t }; }
    // al doilea loc (Codex r2 C1): doar perechile ELIGIBILE — câștig ≥ PRAG_AL_DOILEA km/săpt. (adus la 5 zile) față de cel mai bun loc unic
    // și fiecare loc folosit la ≥ MIN_DRUMURI drumuri; b2 = cea mai bună pereche fără condiții, doar pentru raport
    const elig = (idx) => idx.length === 1 || ((b1.t - totalCu(idx)) * wF >= PRAG_AL_DOILEA && idx.every((j) => folosit(idx, j) >= MIN_DRUMURI));
    let b2e = null;
    for (let j = 0; j < cand.length; j++) for (let k = j + 1; k < cand.length; k++) { const t = totalCu([j, k]); if (!b2 || t < b2.t) b2 = { idx: [j, k], t };
      if ((!b2e || t < b2e.t) && elig([j, k])) b2e = { idx: [j, k], t }; }
    ales = { idx: [...(b2e ?? b1).idx], t: (b2e ?? b1).t };
    // preferința (toleranță TOLERANTA km/săpt. în total): se înlocuiește un loc cu unul mai preferat, dacă totalul crește puțin
    let buget = TOLERANTA / wF;
    for (let p = 0; p < ales.idx.length; p++) {
      let best = null;
      for (let q = 0; q < cand.length; q++) { if (ales.idx.includes(q) || cand[q].pref <= cand[ales.idx[p]].pref) continue;
        const idx = ales.idx.map((j, n) => (n === p ? q : j)); if (!elig(idx)) continue; const t = totalCu(idx);
        if (t - ales.t <= buget && (!best || cand[q].pref > cand[best.q].pref || (cand[q].pref === cand[best.q].pref && t < best.t))) best = { q, t, idx }; }
      if (best) { buget -= best.t - ales.t; ales = { idx: best.idx, t: best.t }; }
    }
  }
  // pe zile: real (gps − obligatorii − nopțile separate, ca ziua ideală) față de propus (drumurile prin parcare + plimbatul pe loc, muncă)
  const zileOut = Z2.map((x) => {
    const r = x.r; const drumuri = ales ? legi.reduce((s, l, i) => s + (l.pondere[x.d.z] ?? 0) * cost[i][alege(ales.idx, i)], 0) + fixe.filter((f) => f.z === x.d.z).reduce((s, f) => s + f.km, 0) : null;
    const sepReal = (r?.jumatati ?? []).filter((j) => j.cat === 'balti' || j.cat === 'pauza').reduce((a, j) => a + j.real, 0);
    const real = r ? r.gps - r.obligatorii - sepReal : null, propus = r && drumuri != null ? drumuri + (r.plimbat ?? 0) : null;
    return { z: x.d.z, dow: x.d.dow, masurata: masurat(x.d.z), separatKm: r1(sepReal), motiv: r?.motiv ?? (r?.sep ? 'separat' : null), real: r1(real), drumuri: drumuri == null ? null : r1(drumuri),
      plimbat: r1(r?.plimbat ?? 0), propus: propus == null ? null : r1(propus), economie: real == null || propus == null ? null : r1(real - propus) };
  });
  const M = zileOut.filter((x) => x.masurata && x.propus != null);
  const real = M.reduce((s, x) => s + x.real, 0), propus = M.reduce((s, x) => s + x.propus, 0);
  let econM = Math.max(0, real - propus);
  // propunerea care nu scade nimic nu se arată: «rămâne cum e» (runda 1, pct. 4)
  if (ales && econM < 0.5) { motivFara = 'propunerea nu scade km — rămâne cum e'; econM = 0; }
  const areLoc = ales && !motivFara;
  const econS = M.length ? econM * wF : 0;
  const locuri = areLoc ? ales.idx.map((j, n) => ({ nr: n + 1, n: cand[j].n, fel: cand[j].fel, pref: cand[j].pref, c: [r1(cand[j].lat * 1e4) / 1e4, r1(cand[j].lon * 1e4) / 1e4], drumuri: folosit(ales.idx, j) })) : [];
  const legiOut = areLoc ? legi.map((l, i) => { const j = alege(ales.idx, i);
    return { z: l.z, zUrm: l.zUrm ?? null, parte: l.parte, ora: l.ora, oraDim: l.oraDim ?? null, a: [r1(l.a.lat * 1e5) / 1e5, r1(l.a.lon * 1e5) / 1e5], b: [r1(l.b.lat * 1e5) / 1e5, r1(l.b.lon * 1e5) / 1e5],
      aN: l.aN, bN: l.bN, loc: ales.idx.indexOf(j) + 1, km: r1(cost[i][j]), separat: !!l.separat, catN: l.catN ?? null, ancore: l.parte === 'noapte' ? !!l.ancore : null }; }) : [];
  const castigAlDoilea = locuri.length === 2 ? r1((b1.t - ales.t) * wF) : null;
  masini.push({ m, locuri, motivFara, castigAlDoilea, unLoc: b1 ? { n: cand[b1.idx[0]].n, kmSapt: r1(b1.t * wF) } : null,
    doiLocuri: b2 ? { n: b2.idx.map((j) => cand[j].n), kmSapt: r1(b2.t * wF), castig: r1((b1.t - b2.t) * wF) } : null,
    zileMasurate: M.length, zileLV, real: r1(real), propus: r1(propus), economieMasurata: r1(econM), economieSapt: r1(econS),
    idealSapt: zm && !zm.separat ? zm.kmSapt12_2 ?? null : null, zile: zileOut, legi: legiOut });
}
masini.sort((a, b) => b.economieSapt - a.economieSapt);
const flota = { masini: masini.length, economieMasurata: r1(masini.reduce((s, x) => s + x.economieMasurata, 0)), economieSapt: r1(masini.reduce((s, x) => s + x.economieSapt, 0)),
  idealSapt: r1(masini.reduce((s, x) => s + (x.idealSapt ?? 0), 0)), faraPropunere: masini.filter((x) => !x.locuri.length).map((x) => `${x.m}: ${x.motivFara}`), doiLocuri: masini.filter((x) => x.locuri.length === 2).length, pestePrag: masini.filter((x) => x.economieSapt >= 100).length };
writeFileSync(`${W}/parcare.json`, JSON.stringify({ rulat: new Date().toISOString(), parametri: PARAM, flota, masini }));
salveazaCache();
console.log(`parcare: ${flota.masini} mașini · de tăiat ${flota.economieMasurata} km măsurat (${flota.economieSapt} adus la 5 zile; ideal ${flota.idealSapt}) · două locuri ${flota.doiLocuri} · peste 100 km ${flota.pestePrag}`);
for (const x of masini.slice(0, 40)) console.log(`  ${x.m.padEnd(8)} ${String(x.economieSapt).padStart(6)} (ideal ${x.idealSapt ?? '—'}) · ${x.locuri.length ? x.locuri.map((l) => `P${l.nr} ${l.n}${['', '·oraș', '·deja'][l.pref]} (${l.drumuri})`).join(' + ') : x.motivFara}${x.doiLocuri ? ` · 2 locuri −${x.doiLocuri.castig}` : ''}`);
