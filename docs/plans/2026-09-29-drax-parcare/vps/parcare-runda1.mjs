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
const { hav, kmDrum, salveazaCache, PARC } = C;
const W = process.argv[2];
if (!W || !existsSync(`${W}/ziua-ideala.json`)) { console.error('parcare.mjs <dosarul săptămânii> (lipsește ziua-ideala.json)'); process.exit(2); }
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const Z = J(`${W}/economie-zile.json`), EC = J(`${W}/economie.json`), ZI = J(`${W}/ziua-ideala.json`);
const r1 = (x) => Math.round(x * 10) / 10, P = (a) => (a ? (Array.isArray(a) ? { lat: a[0], lon: a[1] } : { lat: a.lat, lon: a.lon }) : null);
const ACELASI_KM = 3, RAZA_CAND = 15, CAND_MAX = 10, PRAG_AL_DOILEA = 20, VAL_F = 1.05;
const PARAM = { ACELASI_KM, RAZA_CAND, CAND_MAX, PRAG_AL_DOILEA, VAL_F };

const LOC = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  if (!/^(village|town|city)$/.test(g.properties?.place ?? '')) continue;
  const [lon, lat] = g.geometry.coordinates; if (lat > 46.9 && lat < 48.6 && lon > 26.6 && lon < 29.2) LOC.push({ n: g.properties.name, lat, lon, fel: g.properties.place });
}
const RZ = new Map(ZI.randuri.map((r) => [`${r.m}|${r.z}`, r]));
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
    if (p.t == null && p.t0 != null) { Q.push({ lat: p.lat, lon: p.lon, t: p.t0 }); if (p.t1 > p.t0) Q.push({ lat: p.lat, lon: p.lon, t: p.t1 }); } else if (p.t != null) Q.push(p); }
  return Q.sort((a, b) => a.t - b.t);
}
const peM = new Map(); for (const d of Z.zile) (peM.get(d.m) ?? peM.set(d.m, []).get(d.m)).push(d);
const masini = [];
for (const [m, zile] of peM) {
  zile.sort((a, b) => a.z.localeCompare(b.z));
  const Z2 = zile.map((d) => {
    const Q = urma(d.dev ?? d.m, d.z);
    const curse = d.seg.filter((s) => s.cat === 'cuOameni').sort((a, b) => a.t0 - b.t0).map((s) => {
      const a = Q.find((p) => p.t >= s.t0) ?? null, b = [...Q].reverse().find((p) => p.t <= s.t1) ?? null;
      return { t0: s.t0, t1: s.t1, ora: s.ora, de: a, pana: b, deN: s.de, panaN: s.pana };
    }).filter((c) => c.de && c.pana);
    const golDupa = (t) => d.seg.find((s) => s.cat !== 'cuOameni' && s.t0 === t)?.ora ?? null;
    const golInainte = (t) => d.seg.find((s) => s.cat !== 'cuOameni' && s.t1 === t)?.ora ?? null;
    return { d, curse, golDupa, golInainte, r: RZ.get(`${d.m}|${d.z}`) };
  }).filter((x) => x.curse.length);
  if (!Z2.length) continue;
  // drumurile de acoperit: între curse din locuri diferite (aceeași zi) și noaptea (ultimul capăt → primul capăt al zilei următoare cu curse, circular)
  const legi = [];
  Z2.forEach((x, k) => {
    for (let i = 0; i + 1 < x.curse.length; i++) { const a = x.curse[i], b = x.curse[i + 1];
      const oraG = x.golDupa(a.t1), ivI = x.r?.intervale?.find((v) => v.ora === oraG);
      if (hav(a.pana, b.de) > ACELASI_KM) legi.push({ z: x.d.z, parte: 'intre', direct: ivI ? ivI.leg : null, ora: oraG ?? `${a.ora.slice(-5)}–${b.ora.slice(0, 5)}`, a: a.pana, b: b.de, aN: a.panaN, bN: b.deN, pondere: { [x.d.z]: 1 } }); }
    const u = Z2[(k + 1) % Z2.length], a = x.curse.at(-1), b = u.curse[0];
    const catN = x.r?.jumatati?.find((j) => j.part === 'seara')?.cat ?? null, separat = catN === 'balti' || catN === 'pauza';
    const jS = x.r?.jumatati?.find((j) => j.part === 'seara');
    legi.push({ z: x.d.z, zUrm: u.d.z, parte: 'noapte', catN, separat, direct: jS ? jS.legNoapte : null, ora: x.golDupa(a.t1), oraDim: u.golInainte(b.t0), a: a.pana, b: b.de, aN: a.panaN, bN: b.deN, pondere: separat ? {} : { [x.d.z]: 0.5, [u.d.z]: (u.d.z === x.d.z ? 1 : 0.5) } });
  });
  const masurat = (z) => { const r = RZ.get(`${m}|${z}`); return !!(r && r.esant && !r.sep); };
  const pondM = (l) => Object.entries(l.pondere).reduce((s, [z, w]) => s + (masurat(z) ? w : 0), 0);
  // candidații
  const capete = Z2.flatMap((x) => x.curse.flatMap((c) => [c.de, c.pana]));
  const casa = casaDe.get(m);
  let cand = LOC.filter((L) => capete.some((p) => hav(p, L) <= RAZA_CAND)).map((L) => ({ n: L.n, lat: L.lat, lon: L.lon, fel: L.fel }));
  cand.push({ n: 'Parcul Bălți', lat: PARC.lat, lon: PARC.lon, fel: 'parc' });
  if (casa) cand.push({ n: `acasă (${numeCasa.get(m) ?? 'casa șoferului'})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
  const est = (L) => legi.reduce((s, l) => s + pondM(l) * (hav(l.a, L) + hav(L, l.b)), 0);
  cand = cand.sort((a, b) => est(a) - est(b)).slice(0, CAND_MAX);
  if (casa && !cand.some((c) => c.fel === 'casa')) cand.push({ n: `acasă (${numeCasa.get(m) ?? 'casa șoferului'})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
  // costul fiecărui drum prin fiecare candidat
  // costul prin loc = drumul direct al zilei ideale + ocolul prin loc (Valhalla × 1,05, diferența anulează abaterea modelului de drum)
  const cost = []; for (const l of legi) { const dAB = await drum(l.a, l.b); const baza = l.direct ?? dAB; l.dirSrc = l.direct != null ? 'ideal' : 'valhalla';
    const row = []; for (const L of cand) row.push(baza + Math.max(0, (await drum(l.a, L)) + (await drum(L, l.b)) - dAB)); cost.push(row); }
  const totalCu = (idx) => legi.reduce((s, l, i) => s + pondM(l) * Math.min(...idx.map((j) => cost[i][j])), 0);
  let b1 = null; for (let j = 0; j < cand.length; j++) { const t = totalCu([j]); if (!b1 || t < b1.t) b1 = { idx: [j], t }; }
  let b2 = null; for (let j = 0; j < cand.length; j++) for (let k = j + 1; k < cand.length; k++) { const t = totalCu([j, k]); if (!b2 || t < b2.t) b2 = { idx: [j, k], t }; }
  const ales = b2 && b1.t - b2.t >= PRAG_AL_DOILEA ? b2 : b1;
  // pe zile: real (gps − obligatorii, din ziua ideală) față de propus (drumurile prin parcare + plimbatul pe loc, muncă)
  const zileOut = Z2.map((x) => {
    const r = x.r; const drumuri = legi.reduce((s, l, i) => s + (l.pondere[x.d.z] ?? 0) * Math.min(...ales.idx.map((j) => cost[i][j])), 0);
    const sepReal = (r?.jumatati ?? []).filter((j) => j.cat === 'balti' || j.cat === 'pauza').reduce((a, j) => a + j.real, 0);   // ca în ziua ideală: separat
    const real = r ? r.gps - r.obligatorii - sepReal : null, propus = r ? drumuri + (r.plimbat ?? 0) : null;
    return { z: x.d.z, dow: x.d.dow, masurata: masurat(x.d.z), separatKm: r1(sepReal), motiv: r?.motiv ?? (r?.sep ? 'separat' : null), real: r1(real), drumuri: r1(drumuri), plimbat: r1(r?.plimbat ?? 0),
      propus: r1(propus), economie: real == null ? null : r1(real - propus) };
  });
  const M = zileOut.filter((x) => x.masurata);
  const real = M.reduce((s, x) => s + x.real, 0), propus = M.reduce((s, x) => s + x.propus, 0);
  const zm = ZIM.get(m); const zileLV = zm?.zileLV ?? M.length;
  const econM = Math.max(0, real - propus), econS = M.length ? econM * zileLV / M.length : 0;
  const locuri = ales.idx.map((j, n) => ({ nr: n + 1, n: cand[j].n, fel: cand[j].fel, c: [r1(cand[j].lat * 1e4) / 1e4, r1(cand[j].lon * 1e4) / 1e4],
    drumuri: legi.filter((l, i) => ales.idx.reduce((bj, jj) => (cost[i][jj] < cost[i][bj] ? jj : bj), ales.idx[0]) === j).length }));
  const legiOut = legi.map((l, i) => { const j = ales.idx.reduce((bj, jj) => (cost[i][jj] < cost[i][bj] ? jj : bj), ales.idx[0]);
    return { z: l.z, zUrm: l.zUrm ?? null, parte: l.parte, ora: l.ora, oraDim: l.oraDim ?? null, a: [r1(l.a.lat * 1e5) / 1e5, r1(l.a.lon * 1e5) / 1e5], b: [r1(l.b.lat * 1e5) / 1e5, r1(l.b.lon * 1e5) / 1e5],
      aN: l.aN, bN: l.bN, loc: ales.idx.indexOf(j) + 1, km: r1(cost[i][j]), separat: !!l.separat, catN: l.catN ?? null }; });
  masini.push({ m, locuri, unLoc: { n: cand[b1.idx[0]].n, kmSapt: r1(b1.t) }, doiLocuri: b2 ? { n: b2.idx.map((j) => cand[j].n), kmSapt: r1(b2.t), castig: r1(b1.t - b2.t) } : null,
    zileMasurate: M.length, zileLV, real: r1(real), propus: r1(propus), economieMasurata: r1(econM), economieSapt: r1(econS),
    idealSapt: zm ? zm.kmSapt12_2 ?? null : null, zile: zileOut, legi: legiOut });
}
masini.sort((a, b) => b.economieSapt - a.economieSapt);
const flota = { masini: masini.length, economieMasurata: r1(masini.reduce((s, x) => s + x.economieMasurata, 0)), economieSapt: r1(masini.reduce((s, x) => s + x.economieSapt, 0)),
  idealSapt: r1(masini.reduce((s, x) => s + (x.idealSapt ?? 0), 0)), doiLocuri: masini.filter((x) => x.locuri.length === 2).length, pestePrag: masini.filter((x) => x.economieSapt >= 100).length };
writeFileSync(`${W}/parcare.json`, JSON.stringify({ rulat: new Date().toISOString(), parametri: PARAM, flota, masini }));
salveazaCache();
console.log(`parcare: ${flota.masini} mașini · de tăiat ${flota.economieMasurata} km măsurat (${flota.economieSapt} adus la 5 zile; ideal ${flota.idealSapt}) · două locuri ${flota.doiLocuri} · peste 100 km ${flota.pestePrag}`);
for (const x of masini.slice(0, 40)) console.log(`  ${x.m.padEnd(8)} ${String(x.economieSapt).padStart(6)} (ideal ${x.idealSapt ?? '—'}) · ${x.locuri.map((l) => `P${l.nr} ${l.n} (${l.drumuri})`).join(' + ')}${x.doiLocuri ? ` · 2 locuri −${x.doiLocuri.castig}` : ''}`);
