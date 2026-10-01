// ION-148 cercetare (DOAR CITIRE): golurile dintre curse ale flotei Briceni (Trox + suburban), noaptea, capetele, candidații de
// parcare și km de tăiat estimați cu metoda LEAR ION-143 (alegeLocuri importat, nu copiat). Nu scrie nimic în afara acestui dosar.
//   cd /root/lde-worker/briceni-parcare/cercetare && node masoara.mjs [GOL_MAX_H=12] > rulare.txt
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { hav, GARA, POARTA, localToUtc, localMin } from '../../briceni/cod/geo.mjs';
import { evenimente, tIn, tOut } from '../../briceni/cod/evenimente.mjs';
import { clasificaZi, PR, loculNoptii } from '../../briceni/cod/livrare.mjs';
import { alegeLocuri } from '../../lear-parcare/lear-parcare-alege.mjs';

const B = '/root/lde-worker/briceni/date/';
const FLOOR = process.argv[3] !== 'fara-podea';
const GOL_MAX_H = +(process.argv[2] ?? 12), GOL_MIN_MIN = 60, IESIRE_KM = 2, R_BALTI = 4, RAZA_CAND = 15, VAL_F = 1.05, SALT_KM = 5;
const N = JSON.parse(readFileSync(B + 'nomenclator-sapt.json', 'utf8'));
const CT = JSON.parse(readFileSync(B + 'curse-trox-sapt.json', 'utf8'));
const CS = JSON.parse(readFileSync(B + 'curse-sub-sapt.json', 'utf8')).curse;
const LS = JSON.parse(readFileSync(B + 'livrare-sapt.json', 'utf8'));
const r1 = (x) => Math.round(x * 10) / 10;
const ziua = (z, d) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const ora = (t) => { const m = localMin(t); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const zl = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).slice(5, 10);

// satele din nomenclator + act (ca livrare.mjs)
const LOCM = new Map();
for (const r of N.suburban) for (const s of r.lant) if (s.loc && s.loc.key !== GARA.key) LOCM.set(s.loc.key, s.loc);
for (const r of N.trox) for (const s of r.sate) if (s.loc) LOCM.set(s.loc.key, s.loc);
const LOCV = [...LOCM.values()];
const troxSate = new Set(N.trox.flatMap((r) => r.sate.map((s) => s.loc?.key).filter(Boolean)));
const sateRuta = new Map([...N.suburban.map((r) => [String(r.id), r.lant.map((s) => s.loc).filter((l) => l && l.key !== GARA.key)]),
  ...N.trox.map((r) => [r.id, r.sate.map((s) => s.loc).filter(Boolean)])]);
// OSM (ca lear-parcare.mjs): candidații și numele
const OSM = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  const fel = g.properties?.place ?? ''; if (!/^(village|town|city)$/.test(fel)) continue;
  const [lon, lat] = g.geometry.coordinates; if (!(lat > 47.9 && lat < 48.7 && lon > 26.4 && lon < 27.8)) continue;
  OSM.push({ n: g.properties['name:ro'] || g.properties.name, lat, lon, fel });
}
const numeLoc = (p) => { if (!p) return '—'; if (hav(p, POARTA) <= POARTA.r + 0.1) return 'poarta Trox'; if (hav(p, GARA) <= GARA.r + 0.1) return 'gara Briceni';
  let b = null, d = 1e9; for (const s of OSM) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 1.5 ? b : `${b} (${r1(d)} km)`; };

// fișierele zilelor
const cache = new Map();
const ziFis = (m, z) => { const k = `${m}|${z}`; if (cache.has(k)) return cache.get(k); const f = `${B}zile/${m}/${z}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; cache.set(k, v); return v; };
const noapte = (m, z) => {
  const ta = localToUtc(ziua(z, -1), PR.NOAPTE[0]).getTime(), tb = localToUtc(ziua(z, -1), PR.NOAPTE[1]).getTime();
  const pts = []; for (const zz of [ziua(z, -1), z]) { const d = ziFis(m, zz); if (d) pts.push(...evenimente(d, []).pts); }
  return loculNoptii(pts, ta, tb);
};
// urma continuă a săptămânii pe mașină: fiecare fișier dă doar [z 03:00, z+1 03:00)
function urma(m) {
  const P = [], O = [];
  for (let z = ziua(N.FROM, -1); z <= ziua(N.TO, 1); z = ziua(z, 1)) {
    const d = ziFis(m, z); if (!d) continue; const a = localToUtc(z, 180).getTime(), b = localToUtc(ziua(z, 1), 180).getTime();
    for (const x of evenimente(d, []).pts) if (tIn(x) >= a && tIn(x) < b) P.push(x);
    for (const o of d.opriri) if (o.t0 >= a && o.t0 < b) O.push(o);
  }
  P.sort((x, y) => tIn(x) - tIn(y)); return { P, O };
}
const pozLa = (P, t) => { let b = null; for (const p of P) { if (p.mut) continue; if (tIn(p) > t) break; b = p; } return b ?? P.find((p) => !p.mut); };
function kmIntre(P, t0, t1) { let s = 0, q = null, salt = 0; for (const p of P) { if (p.mut) continue; if (tOut(p) < t0 || tIn(p) > t1) continue;
  if (q) { const d = hav(q, p); if (d < SALT_KM) s += d; else salt += d; } q = p; } return { km: s, salt }; }

// Valhalla: matrice bus, cache propriu (nu atinge cache-ul LEAR)
const CF = './drum-cache.json';
const VC = existsSync(CF) ? new Map(Object.entries(JSON.parse(readFileSync(CF, 'utf8')))) : new Map();
const kc = (a, b) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}|${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
async function matrice(src, dst) {
  const lipsa = []; for (const a of src) for (const b of dst) if (hav(a, b) >= 0.3 && !VC.has(kc(a, b))) lipsa.push([a, b]);
  const S = [...new Map(lipsa.map(([a]) => [kc(a, a), a])).values()], T = [...new Map(lipsa.map(([, b]) => [kc(b, b), b])).values()];
  for (let i = 0; i < S.length; i += 40) for (let j = 0; j < T.length; j += 60) {
    const s = S.slice(i, i + 40), t = T.slice(j, j + 60);
    const r = await fetch('http://localhost:8002/sources_to_targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ sources: s.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), targets: t.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })), costing: 'bus', units: 'kilometers' }) });
    const j2 = await r.json();
    (j2.sources_to_targets ?? []).forEach((row, a) => row.forEach((c, b) => { if (c?.distance != null) VC.set(kc(s[a], t[b]), c.distance); }));
  }
}
const areDrum = (a, b) => hav(a, b) < 0.3 || VC.has(kc(a, b));
const V = (a, b) => (hav(a, b) < 0.3 ? hav(a, b) : VC.get(kc(a, b))) * VAL_F;

// ------------------------------------------------------------------ zilele analizei (aceleași (m, z) ca rândul BRICENI)
const troxK = (k) => k === 'trox' || k === 'predare';
const EXCL = [], REZ = [], GOLURI = [], CAPETE = new Map();
for (const MM of LS.masini) {
  const m = MM.m, zile = MM.detalii.map((d) => d.z);
  const { P, O } = urma(m);
  const munca = [], nopti = [];
  for (const z of zile) {
    const day = ziFis(m, z); if (!day) continue;
    const E = evenimente(day, LOCV);
    const ta = localToUtc(z, 180).getTime(), tb = localToUtc(ziua(z, 1), 180).getTime();
    const legs = [
      ...CT.curse.filter((c) => c.m === m && c.z === z && c.ruta).map((c) => ({ t0: c.t0, t1: c.t1, kind: 'trox', dir: c.sens, r: c.ruta })),
      ...CS.filter((c) => c.m === m && c.z === z && (c.tip === 'orar' || c.tip === 'neprog')).map((c) => ({ t0: c.t0, t1: c.t1, kind: c.tip, dir: c.dir, r: String(c.r) })),
    ];
    const rutaZilei = (() => { const f = {}; for (const c of CT.curse.filter((c) => c.m === m && c.z === z && c.ruta)) f[c.ruta] = (f[c.ruta] || 0) + 1;
      return Object.entries(f).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; })();
    for (const c of CT.curse.filter((c) => c.m === m && c.z === z && !c.ruta && c.sens === 'retur')) {
      const ult = E.sate.filter((s) => troxSate.has(s.key) && s.tin >= c.t0 && s.tin <= c.t1).at(-1);
      if (ult) legs.push({ t0: c.t0, t1: ult.tin, kind: 'trox', dir: 'retur', r: rutaZilei });
    }
    for (const p of CT.predari.filter((p) => p.m === m && p.z === z && p.t0 && p.capKey && LOCM.has(p.capKey))) {
      const cap = LOCM.get(p.capKey), urm = Math.min(...legs.filter((l) => l.t0 > p.t0).map((l) => l.t0), p.t0 + PR.PREDARE_MAX_MIN * 60e3);
      const x = E.pts.find((q) => !q.mut && tIn(q) > p.t0 && tIn(q) <= urm && hav(q, cap) <= PR.PREDARE_CAPAT_KM);
      if (x) legs.push({ t0: p.t0, t1: tIn(x), kind: 'predare', dir: 'retur', r: p.ruta });
    }
    for (const c of CT.curse.filter((c) => c.m === m && c.z === z && c.ruta)) { const k = `${c.ruta}|${c.capat ?? c.capKey ?? '?'}`; CAPETE.set(k, (CAPETE.get(k) ?? 0) + 1); }
    for (const c of CS.filter((c) => c.m === m && c.z === z && c.tip === 'orar')) { const k = `${c.r}|${c.capat ?? c.capKey ?? '?'}`; CAPETE.set(k, (CAPETE.get(k) ?? 0) + 1); }
    const sateMasina = [...new Set(legs.map((l) => l.r))].flatMap((r) => sateRuta.get(r) ?? []);
    const noapteA = noapte(m, z), noapteB = noapte(m, ziua(z, 1));
    if (noapteA) nopti.push({ z, ...noapteA });
    const seg = clasificaZi({ pts: E.pts, opriri: day.opriri, legs, ta, tb, noapteA, noapteB, sateMasina, sate: LOCV });
    for (const s of seg) if ((s.leg && s.cat === 'cuOameni') || s.cat === 'nepotrivita') munca.push({ t0: s.t0, t1: s.t1, kind: s.kind ?? 'nepotr', r: s.r, z });
  }
  munca.sort((a, b) => a.t0 - b.t0);
  const W = []; for (const w of munca) { const u = W.at(-1); if (u && w.t0 - u.t1 < 60e3) { u.t1 = Math.max(u.t1, w.t1); u.kinds.add(w.kind); } else W.push({ ...w, kinds: new Set([w.kind]) }); }
  // casa = locul nopții cel mai des (≤ 1 km)
  let casa = null, bc = 0; for (const n of nopti) { const c = nopti.filter((x) => hav(x, n) <= 1).length; if (c > bc) { bc = c; casa = n; } }
  const esteTrox = W.some((w) => [...w.kinds].some(troxK)), esteSub = W.some((w) => [...w.kinds].some((k) => !troxK(k)));
  const legi = [];
  for (let i = 1; i < W.length; i++) {
    const a = W[i - 1], b = W[i], t0 = a.t1, t1 = b.t0, min = (t1 - t0) / 60e3;
    const E = pozLa(P, t0), S = pozLa(P, t1);
    const { km, salt } = kmIntre(P, t0, t1);
    const pts = P.filter((p) => !p.mut && tIn(p) >= t0 && tIn(p) <= t1);
    const iesire = pts.length ? Math.max(...pts.map((p) => Math.min(hav(p, GARA), hav(p, POARTA)))) : 0;
    const balti = pts.some((p) => hav(p, PR.PARC) <= R_BALTI);
    let acum = null, ad = 0; for (const x of P) if (x.stat) { const d = Math.min(tOut(x), t1) - Math.max(tIn(x), t0); if (d > ad) { ad = d; acum = x; } }
    const opriri = O.filter((o) => o.t0 >= t0 && o.t1 <= t1 && o.sec >= 30 && o.sec < 300 && !(casa && hav(o, casa) <= 0.5) && LOCV.some((s) => hav(o, s) <= 1)).length;
    const noapteG = a.z !== b.z;
    const tip = `${[...a.kinds].some(troxK) ? 'T' : 'S'}${[...b.kinds].some(troxK) ? 'T' : 'S'}`;
    const acasa = !!(casa && acum && hav(acum, casa) <= 1);
    let scos = null;
    if (min < GOL_MIN_MIN) scos = '<60 min'; else if (min > GOL_MAX_H * 60) scos = `>${GOL_MAX_H} h`; else if (iesire <= IESIRE_KM) scos = 'stă la gară/poartă';
    else if (balti) scos = 'Bălți (service)';
    const g = { m, tip, noapte: noapteG, z: a.z, ora: `${zl(t0)} ${ora(t0)}–${ora(t1)}`, min: Math.round(min), km: r1(km), salt: r1(salt), E, S, aN: numeLoc(E), bN: numeLoc(S),
      acum: acum && ad >= 20 * 60e3 ? { lat: acum.lat, lon: acum.lon, n: numeLoc(acum), min: Math.round(ad / 60e3) } : null, acasa, opriri, iesire: r1(iesire), scos };
    GOLURI.push(g); if (!scos) legi.push({ ...g, real: km }); else if (scos.startsWith('>')) EXCL.push(g);
  }
  // candidați: OSM ≤ 15 km de E/S (fără zona Bălți), gara, poarta, casa
  const capL = legi.flatMap((l) => [l.E, l.S]);
  const cand = OSM.filter((L) => capL.some((p) => hav(p, L) <= RAZA_CAND) && hav(L, PR.PARC) > 3).map((L) => ({ ...L }));
  cand.push({ n: 'gara Briceni', lat: GARA.lat, lon: GARA.lon, fel: 'gara' }, { n: 'poarta Trox', lat: POARTA.lat, lon: POARTA.lon, fel: 'uzina' });
  if (casa) cand.push({ n: `acasă (${numeLoc(casa)})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
  for (const c of cand) c.pref = new Set(legi.filter((l) => l.acum && hav(l.acum, c) <= 1).map((l) => l.z)).size >= 2 ? 2 : (c.fel === 'town' || c.fel === 'city') ? 1 : 0;
  let rez = { m, trox: esteTrox, sub: esteSub, zile: zile.length, total: MM.total, livrare: MM.km.livrare, golTure: MM.km.golTure, legatura: MM.km.legatura, golRuta: MM.km.golRuta,
    casa: casa ? numeLoc(casa) : null, nopti: nopti.map((n) => numeLoc(n)).join(','), munca: W.length, legi: legi.length, cand: cand.length };
  if (legi.length) {
    await matrice(legi.map((l) => l.E), cand); await matrice(cand, legi.map((l) => l.S));
    for (let q = cand.length - 1; q >= 0; q--) if (!legi.every((l) => areDrum(l.E, cand[q]) && areDrum(cand[q], l.S))) cand.splice(q, 1);
    // Trox → Trox cu poarta la un capăt: drumul gol impus merge pe traseul rutei (ION-73, impartOcol minDirect = lungimea cursei Trox)
    const laP = (p) => hav(p, POARTA) <= POARTA.r + 0.1;
    for (const l of legi) { l.podea = FLOOR && l.tip === 'TT' && (laP(l.E) || laP(l.S)) ? (MM.detalii.find((d) => d.z === l.z)?.lungimeTrox ?? 0) : 0; if (l.real < l.podea) l.podea = l.real; }
    const cost = legi.map((l) => cand.map((c) => Math.max(V(l.E, c) + V(c, l.S), l.podea)));
    const { ales, b1, alege, costAles, folosit } = alegeLocuri({ legi, cand, cost, hav, P: {} });
    const real = legi.reduce((s, l) => s + l.real, 0);
    const pe = { T: [0, 0], S: [0, 0], M: [0, 0] }; // [real, propus] pe tipul golului: T = Trox→Trox, S = sub→sub, M = amestec
    legi.forEach((l, i) => { const k = l.tip === 'TT' ? 'T' : l.tip === 'SS' ? 'S' : 'M'; pe[k][0] += l.real; pe[k][1] += costAles(ales.idx, i); l.prop = costAles(ales.idx, i); l.loc = alege(ales.idx, i); });
    rez = { ...rez, real: r1(real), propus: r1(ales.t), economie: r1(Math.max(0, real - ales.t)), unLoc: cand[b1.idx[0]].n, unLocKm: r1(real - b1.t),
      locuri: ales.idx.map((j) => `${cand[j].n}(${folosit(ales.idx, j)})`), pe: Object.fromEntries(Object.entries(pe).map(([k, v]) => [k, [r1(v[0]), r1(v[1])]])) };
    rez.drumuri = legi.map((l) => ({ ora: l.ora, tip: l.tip, noapte: l.noapte, min: l.min, de: l.aN, spre: l.bN, acum: l.acum?.n ?? '—', real: l.real.toFixed(1), prop: l.prop.toFixed(1), loc: l.loc < 0 ? 'rămâne' : cand[l.loc].n, opriri: l.opriri }));
  }
  REZ.push(rez);
}
writeFileSync(CF, JSON.stringify(Object.fromEntries(VC)));

// ------------------------------------------------------------------ ieșirea
console.log(`Briceni ${N.FROM} → ${N.TO} · GOL_MAX ${GOL_MAX_H} h · mașini în analiză ${LS.masini.length} · zile ${LS.zile} · interurban scoase ${LS.zileInterurban.length}`);
console.log('\n== capetele pe rută (curse Trox cu rută + suburban din orar): ruta|capăt → curse');
console.log([...CAPETE].sort().map(([k, v]) => `${k}:${v}`).join(' · '));
const bin = (g) => (g.min < 60 ? 'a <60' : g.min < 180 ? 'b 1–3h' : g.min < 360 ? 'c 3–6h' : g.min < 720 ? 'd 6–12h' : g.min < 1200 ? 'e 12–20h' : 'f >20h');
console.log('\n== golurile dintre curse (toată flota), pe durată × zi/noapte × tip (T=Trox, S=suburban): număr / km GPS');
const T = new Map(); for (const g of GOLURI) { const k = `${bin(g)} ${g.noapte ? 'noapte' : 'zi    '} ${g.tip}`; const x = T.get(k) ?? [0, 0]; x[0]++; x[1] += g.km; T.set(k, x); }
for (const [k, v] of [...T].sort()) console.log(`  ${k}: ${v[0]} goluri, ${r1(v[1])} km`);
console.log('\n== motive de scoatere: ' + JSON.stringify(GOLURI.reduce((a, g) => { const k = g.scos ?? 'INTRĂ'; a[k] = (a[k] ?? 0) + 1; return a; }, {})));
const intra = GOLURI.filter((g) => !g.scos);
console.log(`   intră: ${intra.length} goluri, ${r1(intra.reduce((s, g) => s + g.km, 0))} km · cu opriri în sate în gol: ${intra.filter((g) => g.opriri).length} · stau acasă: ${intra.filter((g) => g.acasa).length} · salt GPS > 5 km: ${intra.filter((g) => g.salt).length}`);
console.log('\n== pe mașină');
for (const r of REZ.sort((a, b) => (b.economie ?? 0) - (a.economie ?? 0))) {
  console.log(`${r.m} ${r.trox ? (r.sub ? 'Trox+sub' : 'Trox') : 'sub'} · ${r.zile} zile · total ${r.total} · livrare(R1) ${r.livrare} · golTure ${r.golTure} · legătură ${r.legatura} · golRută ${r.golRuta} · casa ${r.casa} [nopți ${r.nopti}]`);
  console.log(`   curse ${r.munca} · drumuri de parcare ${r.legi} · candidați ${r.cand} · real ${r.real ?? 0} → propus ${r.propus ?? 0} = de tăiat ${r.economie ?? 0} km/săpt. · un loc: ${r.unLoc ?? '—'} (${r.unLocKm ?? 0}) · ales: ${(r.locuri ?? []).join(' + ')} · pe tip ${JSON.stringify(r.pe ?? {})}`);
  for (const d of r.drumuri ?? []) console.log(`     ${d.ora} ${d.tip}${d.noapte ? ' N' : ''} ${d.min}′ ${d.de} → ${d.spre} · stă: ${d.acum} · ${d.real} → ${d.prop} (${d.loc})${d.opriri ? ` · opriri ${d.opriri}` : ''}`);
}
const tot = REZ.reduce((s, r) => s + (r.economie ?? 0), 0);
const sp = (f) => r1(REZ.reduce((s, r) => s + (r.pe?.[f] ? r.pe[f][0] - r.pe[f][1] : 0), 0));
console.log(`\nFLOTA: de tăiat ${r1(tot)} km/săpt. · pe tip: Trox→Trox ${sp('T')} · sub→sub ${sp('S')} · amestec ${sp('M')} · livrare R1 (rândul BRICENI) ${LS.total.livrare}`);
console.log('\n== goluri scoase ca prea lungi (> GOL_MAX)');
for (const g of EXCL) console.log(`  ${g.m} ${g.ora} ${g.tip}${g.noapte ? " N" : ""} ${g.min}′ ${g.aN} → ${g.bN} · stă: ${g.acum?.n ?? "—"} · ${g.km} km`);
