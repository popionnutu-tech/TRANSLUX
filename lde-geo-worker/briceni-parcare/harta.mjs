// ION-148 — harta mașinii și parcarea optimă P1/P2 pentru Briceni (Trox + suburban), pagina /lde/harta?uz=briceni.
// Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR».
// Variantele alese (Ion, 01.10: «adaugă toate direcțiile»), docs/plans/2026-09-30-briceni-parcare/raspunsuri.md:
//   1. plafonul golului de parcare 20 h (noaptea suburbană 14–17 h intră), weekendul (> 20 h) rămâne afară;
//   2. Trox între ture: podeaua = lungimea cursei Trox a zilei, ca raportul BRICENI (impartOcol / minDirect);
//   3. opririle scurte în sate din pauzele lungi NU taie drumul de parcare (rămân cum le socotește raportul);
//   4. autogara / orașul Briceni sunt candidați;  5. «gol forțat» separat de livrare;  6. doar pagina, fără poster;
//   7. 065LTL (o singură zi cu cursă Briceni) și 281BRAT (fără tracker) rămân în afara parcării, cu motivul scris.
//   Tehnic: fără migrație; lde_harta_zi uzina 'BRICENI' prin REST, ștergere + rescriere pe săptămână (ca ION-150);
//   controlul flotei în lde_analiza_reguli 'BRICENI_HARTA' (rândul «BRICENI» al analizei nu se atinge).
//
// Ziua (03:00 → 03:00, SEBN §2.4) se taie EXACT ca raportul BRICENI: aceleași funcții din briceni/cod/livrare.mjs (importate,
// neschimbate) — clasificaZi, impartOcol (ocolul pe acasă), brambura, golImpusDeTure. Pașii lui main() din livrare.mjs sunt
// reluați aici pe aceleași fișiere; controlul: km pe categorii = livrare<SUFIX>.json, zi cu zi (altfel nu se scrie nimic).
// Parcarea = metoda cercetării (masoara.mjs, ION-148) cu alegeLocuri din lear-parcare (ION-143), importat.
//
//   node --env-file=/root/lde-worker/.env harta.mjs --sapt=AAAA-LL-ZZ --sufix=-parcare [--write]
// Intrările: briceni/date/{nomenclator,curse-trox,curse-sub,livrare}<SUFIX>.json (lant.sh le face cu SUFIX propriu) + date/zile.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { hav, GARA, POARTA, localToUtc, localMin, hhmm, zileIntre } from '/root/lde-worker/briceni/cod/geo.mjs';
import { evenimente, bucata, tIn, tOut } from '/root/lde-worker/briceni/cod/evenimente.mjs';
import { clasificaZi, impartOcol, golImpusDeTure, bramburaBucata, celula, loculNoptii, PR, CAT } from '/root/lde-worker/briceni/cod/livrare.mjs';
import { alegeLocuri } from '/root/lde-worker/lear-parcare/lear-parcare-alege.mjs';
import { tipInterval, linieSchelet, dp, economieZile } from './harta-core.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const WRITE = process.argv.includes('--write');
const SAPT = arg('sapt'), SUFIX = arg('sufix') ?? '-parcare';
if (!/^\d{4}-\d{2}-\d{2}$/.test(SAPT ?? '') || new Date(`${SAPT}T12:00:00Z`).getUTCDay() !== 1) { console.error('--sapt=AAAA-LL-ZZ (o zi de luni)'); process.exit(2); }
if (SUFIX === '-sapt' || SUFIX === '') { console.error('--sufix: fișierele -sapt / fără sufix sunt ale lanțului de luni și ale scheletului'); process.exit(2); }
const B = '/root/lde-worker/briceni/date/';
const AICI = new URL('.', import.meta.url).pathname;
const N = JSON.parse(readFileSync(`${B}nomenclator${SUFIX}.json`, 'utf8'));
const CT = JSON.parse(readFileSync(`${B}curse-trox${SUFIX}.json`, 'utf8'));
const CS = JSON.parse(readFileSync(`${B}curse-sub${SUFIX}.json`, 'utf8')).curse;
const LS = JSON.parse(readFileSync(`${B}livrare${SUFIX}.json`, 'utf8'));
if (N.FROM !== SAPT || LS.saptamina !== SAPT) { console.error(`fișierele ${SUFIX} sunt pentru ${N.FROM} / ${LS.saptamina}, nu ${SAPT}`); process.exit(2); }

// parametrii (răspunsurile lui Ion, 01.10)
const GOL_MAX_H = 20, GOL_MIN_MIN = 60, IESIRE_KM = 2, R_BALTI = 4, RAZA_CAND = 15, VAL_F = 1.05, SALT_KM = 5, ZILE_MIN_PARCARE = 2;
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const ziua = (z, d) => { const x = new Date(z + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const zl = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Chisinau' }).slice(0, 10);
const ZILE = zileIntre(N.FROM, N.TO);

// ── satele (ca livrare.mjs) ──
const LOC = new Map();
for (const r of N.suburban) for (const s of r.lant) if (s.loc && s.loc.key !== GARA.key) LOC.set(s.loc.key, s.loc);
for (const r of N.trox) for (const s of r.sate) if (s.loc) LOC.set(s.loc.key, s.loc);
const LOCV = [...LOC.values()];
const troxSate = new Set(N.trox.flatMap((r) => r.sate.map((s) => s.loc?.key).filter(Boolean)));
const sateRuta = new Map([...N.suburban.map((r) => [String(r.id), r.lant.map((s) => s.loc).filter((l) => l && l.key !== GARA.key)]),
  ...N.trox.map((r) => [r.id, r.sate.map((s) => s.loc).filter(Boolean)])]);
// OSM: candidații și numele (ca masoara.mjs)
const OSM = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  const fel = g.properties?.place ?? ''; if (!/^(village|town|city)$/.test(fel)) continue;
  const [lon, lat] = g.geometry.coordinates; if (!(lat > 47.9 && lat < 48.7 && lon > 26.4 && lon < 27.8)) continue;
  OSM.push({ n: g.properties['name:ro'] || g.properties.name, lat, lon, fel });
}
const numeLoc = (p, casa) => {
  if (!p) return null;
  if (hav(p, POARTA) <= POARTA.r + 0.1) return 'poarta Trox';
  if (hav(p, GARA) <= GARA.r + 0.1) return 'autogara Briceni';
  if (casa && hav(p, casa) <= 0.5) return `acasă (${casa.n})`;
  let b = null, d = 1e9; for (const s of OSM) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } }
  return d <= 1.5 ? b : `${b} (${r1(d)} km)`;
};

// ── fișierele zilelor ──
const cache = new Map();
const ziFis = (m, z) => { const k = `${m}|${z}`; if (cache.has(k)) return cache.get(k); const f = `${B}zile/${m}/${z}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; cache.set(k, v); return v; };
const noapte = (m, z) => {   // ca livrare.mjs: locul nopții care se termină dimineața zilei z
  const ta = localToUtc(ziua(z, -1), PR.NOAPTE[0]).getTime(), tb = localToUtc(ziua(z, -1), PR.NOAPTE[1]).getTime();
  const pts = []; for (const zz of [ziua(z, -1), z]) { const d = ziFis(m, zz); if (d) pts.push(...evenimente(d, []).pts); }
  const n = loculNoptii(pts, ta, tb); if (!n) return null;
  const s = LOCV.reduce((b, x) => (hav(n, x) < hav(n, b) ? x : b), LOCV[0]);
  return { ...n, n: hav(n, GARA) <= 2 ? 'Briceni' : hav(n, s) <= 2 ? s.n : `${n.lat.toFixed(3)},${n.lon.toFixed(3)}` };
};
function urma(m) {   // urma continuă a săptămânii: fiecare fișier dă doar [z 03:00, z+1 03:00)
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

// ── Valhalla: /route (ca livrare.mjs, pentru impartOcol) și matrice bus (parcarea), cache pe disc propriu ──
const CF = `${AICI}drum-cache.json`;
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
const kmRuta = new Map();
const kmDrum = async (a, b) => {   // identic cu livrare.mjs (cache în memorie, ca rezultatul să fie același)
  const k = kc(a, b); if (kmRuta.has(k)) return kmRuta.get(k);
  let v = null;
  if (hav(a, b) < 0.05) v = 0;
  else try {
    const r = await fetch('http://localhost:8002/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: 'bus', units: 'kilometers' }) });
    const j = await r.json(); v = j?.trip?.summary?.length ?? null;
  } catch { v = null; }
  kmRuta.set(k, v); return v;
};

// ════════ 1. ziua fiecărei mașini, tăiată ca raportul BRICENI ════════
const troxK = (k) => k === 'trox' || k === 'predare';
const DET = new Map(LS.masini.flatMap((M) => M.detalii.map((d) => [`${M.m}|${d.z}`, d])));
const ZI = [];
const zileCelula = new Map();
for (const M of LS.masini) for (const det of M.detalii) {
  const m = M.m, z = det.z;
  const day = ziFis(m, z); if (!day || !day.pts.length) { console.error(`${m} ${z}: fișierul zilei lipsește, dar e în livrare${SUFIX}.json`); process.exit(1); }
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
    if (ult) legs.push({ t0: c.t0, t1: ult.tin, kind: 'trox', dir: 'retur', r: rutaZilei, faraCapat: true });
  }
  for (const p of CT.predari.filter((p) => p.m === m && p.z === z && p.t0 && p.capKey && LOC.has(p.capKey))) {
    const cap = LOC.get(p.capKey), urm = Math.min(...legs.filter((l) => l.t0 > p.t0).map((l) => l.t0), p.t0 + PR.PREDARE_MAX_MIN * 60e3);
    const x = E.pts.find((q) => !q.mut && tIn(q) > p.t0 && tIn(q) <= urm && hav(q, cap) <= PR.PREDARE_CAPAT_KM);
    if (x) legs.push({ t0: p.t0, t1: tIn(x), kind: 'predare', dir: 'retur', r: p.ruta });
  }
  const sateMasina = [...new Set(legs.map((l) => l.r))].flatMap((r) => sateRuta.get(r) ?? []);
  const noapteA = noapte(m, z), noapteB = noapte(m, ziua(z, 1));
  const seg0 = clasificaZi({ pts: E.pts, opriri: day.opriri, legs, ta, tb, noapteA, noapteB, sateMasina, sate: LOCV });
  seg0.forEach((s, i) => { s._i = i; });
  const cm = zileCelula.get(m) ?? new Map(); zileCelula.set(m, cm);
  for (const s of seg0) for (const p of s.bpts ?? []) { const c = celula(p); (cm.get(c) ?? cm.set(c, new Set()).get(c)).add(z); }
  ZI.push({ m, z, ta, tb, E, day, legs, noapteA, noapteB, seg0: seg0.map((s) => ({ t0: s.t0, t1: s.t1, cat: s.cat, km: s.km, bpts: s.bpts, r: s.r, kind: s.kind, leg: s.leg, motiv: s.motiv, ocol: false })), seg: seg0, det });
}
// impartOcol (ocolul pe acasă între curse) — ca livrare.mjs
const lungimeTrox = (seg) => { const k = seg.filter((s) => s.leg && troxK(s.kind) && s.km > 5).map((s) => s.km).sort((a, b) => a - b); return k.length ? k[Math.floor(k.length / 2)] : null; };
for (const d of ZI) {
  const nou = [], L = lungimeTrox(d.seg);
  for (const s of d.seg) {
    if (!s.intre || !s.bpts?.length) { nou.push(s); continue; }
    const se = await kmDrum(s.bpts[0], s.bpts.at(-1));
    if (se == null) { nou.push(s); continue; }
    const laPoarta = (p) => hav(p, POARTA) <= POARTA.r + 0.1;
    const minDirect = troxK(s.intre.prev) && troxK(s.intre.next) && (laPoarta(s.bpts[0]) || laPoarta(s.bpts.at(-1))) ? L ?? 0 : 0;
    nou.push(...impartOcol(s, { se, minDirect }));
  }
  d.seg = nou;
}
for (const d of ZI) {   // brambura
  const cm = new Map([...zileCelula.get(d.m)].map(([c, s]) => [c, s.size]));
  const acasa = (p) => p && [d.noapteA, d.noapteB].some((n) => n && hav(p, n) <= 1);
  for (const s of d.seg) if (['livrare', 'legatura', 'deplasare'].includes(s.cat) && !s.direct
    && !(s.cat === 'livrare' && (s.intre || acasa(s.bpts?.[0]) || acasa(s.bpts?.at(-1))))) {
    const b = bramburaBucata(s.bpts, cm); if (b) { s.brambura = Math.min(b, s.km); s.km = +(s.km - s.brambura).toFixed(2); }
  }
}
const IDEAL = JSON.parse(readFileSync(`${B}ideal.json`, 'utf8')).unitati;   // golul impus de ture
const COTEALA_ID = ['46', '52', '53', '54'];
const indes = (sh) => { const o = [];
  for (let i = 1; i < sh.length; i++) { const [a1, o1] = sh[i - 1], [a2, o2] = sh[i]; const n = Math.max(1, Math.ceil(hav({ lat: a1, lon: o1 }, { lat: a2, lon: o2 }) / 0.3));
    for (let k = 0; k < n; k++) o.push({ lat: a1 + (a2 - a1) * k / n, lon: o1 + (o2 - o1) * k / n }); }
  if (sh.length) o.push({ lat: sh.at(-1)[0], lon: sh.at(-1)[1] }); return o; };
const coridorRuta = new Map(IDEAL.filter((u) => !u.slab).map((u) => [u.id, [u.shape, ...(u.variante ?? []).map((v) => v.shape)].flatMap(indes)]));
const coridorDe = (r) => coridorRuta.get(COTEALA_ID.includes(r) ? 'COTEALA' : r) ?? [];
for (const d of ZI) {
  const kms = d.seg.filter((s) => s.leg && troxK(s.kind) && s.km > 5).map((s) => s.km).sort((a, b) => a - b);
  if (!kms.length) continue;
  const L = kms[Math.floor(kms.length / 2)];
  const coridor = [...new Set(d.legs.filter((l) => troxK(l.kind)).map((l) => l.r).filter(Boolean))].flatMap(coridorDe);
  golImpusDeTure(d.seg, coridor, 2 * L); d.lungimeTrox = L;
}
// controlul: km pe categorii = raportul (livrare<SUFIX>.json), zi cu zi
const suma = (seg, cat) => (cat === 'golTure' ? seg.reduce((a, s) => a + (s.golTure ?? 0), 0) : 0) + seg.filter((s) => s.cat === cat).reduce((a, s) => a + s.km, 0);
const difRaport = [];
for (const d of ZI) for (const c of CAT) { const a = +suma(d.seg, c).toFixed(1), b = d.det.km[c]; if (Math.abs(a - b) > 0.15) difRaport.push(`${d.m} ${d.z} ${c} ${a}/${b}`); }

// ════════ 2. parcarea P1/P2 (metoda cercetării, răspunsurile 1–4, 7) ════════
const PARC = new Map(), GOLURI_SCOASE = {};
for (const M of LS.masini) {
  const m = M.m, zile = ZI.filter((d) => d.m === m);
  const { P, O } = urma(m);
  const munca = [], nopti = [];
  for (const d of zile) {
    if (d.noapteA) nopti.push({ z: d.z, ...d.noapteA });
    for (const s of d.seg0) if ((s.leg && s.cat === 'cuOameni') || s.cat === 'nepotrivita') munca.push({ t0: s.t0, t1: s.t1, kind: s.kind ?? 'nepotr', r: s.r, z: d.z });
  }
  munca.sort((a, b) => a.t0 - b.t0);
  const W = []; for (const w of munca) { const u = W.at(-1); if (u && w.t0 - u.t1 < 60e3) { u.t1 = Math.max(u.t1, w.t1); u.kinds.add(w.kind); } else W.push({ ...w, kinds: new Set([w.kind]) }); }
  let casa = null, bc = 0; for (const n of nopti) { const c = nopti.filter((x) => hav(x, n) <= 1).length; if (c > bc) { bc = c; casa = n; } }
  const legi = [];
  for (let i = 1; i < W.length; i++) {
    const a = W[i - 1], b = W[i], t0 = a.t1, t1 = b.t0, min = (t1 - t0) / 60e3;
    const E = pozLa(P, t0), S = pozLa(P, t1); if (!E || !S) continue;
    const { km } = kmIntre(P, t0, t1);
    const pts = P.filter((p) => !p.mut && tIn(p) >= t0 && tIn(p) <= t1);
    const iesire = pts.length ? Math.max(...pts.map((p) => Math.min(hav(p, GARA), hav(p, POARTA)))) : 0;
    const balti = pts.some((p) => hav(p, PR.PARC) <= R_BALTI);
    let acum = null, ad = 0; for (const x of P) if (x.stat) { const dd = Math.min(tOut(x), t1) - Math.max(tIn(x), t0); if (dd > ad) { ad = dd; acum = x; } }
    const tip = `${[...a.kinds].some(troxK) ? 'T' : 'S'}${[...b.kinds].some(troxK) ? 'T' : 'S'}`;
    let scos = null;
    if (min < GOL_MIN_MIN) scos = 'sub 60 min'; else if (min > GOL_MAX_H * 60) scos = 'peste 20 h (weekend / pauză)'; else if (iesire <= IESIRE_KM) scos = 'stă la autogară / poartă';
    else if (balti) scos = 'Parcul Bălți (service)';
    if (scos) { GOLURI_SCOASE[scos] = (GOLURI_SCOASE[scos] ?? 0) + 1; continue; }
    legi.push({ z: a.z, t0, t1, tip, noapte: a.z !== b.z, min, real: km, E, S, aN: numeLoc(E, casa), bN: numeLoc(S, casa),
      acum: acum && ad >= 20 * 60e3 ? { lat: acum.lat, lon: acum.lon, n: numeLoc(acum, casa) } : null });
  }
  const casaN = casa ? numeLoc(casa) : null;
  const rez = { m, casa: casa ? { ...casa, n: casaN } : null, locuri: [], legi: [], economieSapt: 0, real: 0, propus: 0, motivFara: null };
  if (M.zile < ZILE_MIN_PARCARE) rez.motivFara = `${M.zile === 1 ? 'o singură zi' : `${M.zile} zile`} cu cursă Briceni în săptămână — rămâne în afara parcării (Ion, 01.10, întrebarea 7)`;
  else if (!legi.length) rez.motivFara = 'niciun gol între curse de 1–20 h în care să plece de la autogară / poartă (mașina stă la capătul cursei sau pauzele sunt scurte)';
  else {
    const capL = legi.flatMap((l) => [l.E, l.S]);
    const cand = OSM.filter((L) => capL.some((p) => hav(p, L) <= RAZA_CAND) && hav(L, PR.PARC) > 3).map((L) => ({ ...L }));
    cand.push({ n: 'autogara Briceni', lat: GARA.lat, lon: GARA.lon, fel: 'gara' }, { n: 'poarta Trox', lat: POARTA.lat, lon: POARTA.lon, fel: 'uzina' });
    if (casa) cand.push({ n: `acasă (${casaN})`, lat: casa.lat, lon: casa.lon, fel: 'casa' });
    for (const c of cand) c.pref = new Set(legi.filter((l) => l.acum && hav(l.acum, c) <= 1).map((l) => l.z)).size >= 2 ? 2 : (c.fel === 'town' || c.fel === 'city') ? 1 : 0;
    await matrice(legi.map((l) => l.E), cand); await matrice(cand, legi.map((l) => l.S));
    for (let q = cand.length - 1; q >= 0; q--) if (!legi.every((l) => areDrum(l.E, cand[q]) && areDrum(cand[q], l.S))) cand.splice(q, 1);
    // răspunsul 2: Trox → Trox cu poarta la un capăt — golul impus de ture nu iese sub lungimea cursei Trox a zilei
    const laP = (p) => hav(p, POARTA) <= POARTA.r + 0.1;
    for (const l of legi) { l.podea = l.tip === 'TT' && (laP(l.E) || laP(l.S)) ? (DET.get(`${m}|${l.z}`)?.lungimeTrox ?? 0) : 0; if (l.real < l.podea) l.podea = l.real; }
    const cost = legi.map((l) => cand.map((c) => Math.max(V(l.E, c) + V(c, l.S), l.podea)));
    const { ales, alege, costAles, folosit } = alegeLocuri({ legi, cand, cost, hav, P: {} });
    legi.forEach((l, i) => { l.prop = costAles(ales.idx, i); const j = alege(ales.idx, i); l.loc = j < 0 ? 0 : ales.idx.indexOf(j) + 1; });
    const real = legi.reduce((s, l) => s + l.real, 0), economie = Math.max(0, real - ales.t);
    // un loc pe care nu-l folosește niciun drum nu se arată (rămâne cum e peste tot)
    const folosite = ales.idx.filter((j) => folosit(ales.idx, j) > 0);
    rez.real = r1(real); rez.propus = r1(ales.t); rez.economieSapt = r1(economie); rez.legi = legi;
    if (!folosite.length || economie < 0.5) rez.motivFara = 'rămâne cum e: pe fiecare drum stă deja la ≤ 4 km de locul cel mai bun sau câștigul e sub max(2 km, 5 %)';
    else {
      rez.locuri = ales.idx.map((j, k) => ({ nr: k + 1, n: cand[j].n, fel: cand[j].fel, c: [r5(cand[j].lat), r5(cand[j].lon)], drumuri: folosit(ales.idx, j), pref: cand[j].pref }))
        .filter((l) => l.drumuri > 0);
      // renumerotare dacă primul loc nu e folosit
      const map = new Map(rez.locuri.map((l, k) => [l.nr, k + 1])); rez.locuri.forEach((l) => { l.nr = map.get(l.nr); }); legi.forEach((l) => { l.loc = l.loc ? map.get(l.loc) ?? 0 : 0; });
    }
  }
  if (rez.motivFara) rez.economieSapt = 0;
  PARC.set(m, rez);
}
writeFileSync(CF, JSON.stringify(Object.fromEntries(VC)));

// ════════ 3. rândurile lde_harta_zi ════════
const randuri = [], difKm = [];
for (const d of ZI) {
  const pk = PARC.get(d.m), casa = pk.casa;
  const t00 = d.ta;
  // intervalele = bucățile lui clasificaZi; km pe categorii din bucățile finale (ocol / drum direct / brambura / gol impus)
  const cats = d.seg0.map(() => ({}));
  for (const s of d.seg) {
    const c = cats[s._i]; if (!c) continue;
    if (s.km) c[s.cat] = (c[s.cat] ?? 0) + s.km;
    if (s.golTure) c.golTure = (c.golTure ?? 0) + s.golTure;
    if (s.brambura) c.brambura = (c.brambura ?? 0) + s.brambura;
  }
  const motive = d.seg0.map(() => []);
  for (const s of d.seg) if (s.motiv && motive[s._i] && !motive[s._i].includes(s.motiv)) motive[s._i].push(s.motiv);
  const iv = [];
  d.seg0.forEach((s, i) => {
    const c = Object.fromEntries(Object.entries(cats[i]).map(([k, v]) => [k, r1(v)]).filter(([, v]) => v > 0));
    const km = r1(s.km);
    if (!Object.keys(c).length) c[s.cat === 'stat' ? 'stat' : s.cat] = km;
    const Q = (s.bpts ?? []).filter((p) => p.lat != null);
    const tip = tipInterval(c);
    const t1 = Math.min(s.t1, d.tb);
    iv.push({ ora: `${hhmm(s.t0)}–${t1 >= d.tb ? '03:00' : hhmm(t1)}`, t0: Math.round((s.t0 - t00) / 1000), t1: Math.round((t1 - t00) / 1000), tip, cats: c, km,
      de: numeLoc(Q[0], casa) ?? null, pana: numeLoc(Q.at(-1), casa) ?? null, ocol: d.seg.some((x) => x._i === i && x.ocol), lin: linieSchelet(s.r), prelungit: null,
      s: dp(Q, 15).map((p) => [r5(p.lat), r5(p.lon), Math.round((p.t - t00) / 1000)]), nota: motive[i].join('; ') || null });
  });
  // lipim intervalele vecine «stă» cu același loc (km < 0,2), ca lista să nu se umple de rânduri de 0 km
  const ivL = [];
  for (const v of iv) { const u = ivL.at(-1); if (u && u.tip === 'parcare' && v.tip === 'parcare') { u.t1 = v.t1; u.ora = `${u.ora.slice(0, 5)}–${v.ora.slice(6)}`; u.km = r1(u.km + v.km); u.cats.stat = r1((u.cats.stat ?? 0) + v.km); u.s.push(...v.s.slice(-1)); u.pana = v.pana; } else ivL.push(v); }
  const kmZi = r1(bucata(d.E.pts, d.ta, d.tb).km), kmIv = r1(ivL.reduce((a, v) => a + v.km, 0));
  if (Math.abs(kmIv - kmZi) > Math.max(1, kmZi * 0.03)) difKm.push(`${d.m} ${d.z} ${kmIv}/${kmZi}`);
  // opririle ≥ 5 min (staționările punctelor zilei)
  const stai = d.E.pts.filter((x) => x.stat && Math.min(x.t1, d.tb) - Math.max(x.t0, d.ta) >= 5 * 60e3)
    .map((x) => [r5(x.lat), r5(x.lon), Math.round((Math.max(x.t0, d.ta) - t00) / 1000), Math.round((Math.min(x.t1, d.tb) - t00) / 1000), numeLoc(x, casa)]);
  const linii = [...new Set(d.legs.map((l) => linieSchelet(l.r)).filter(Boolean))];
  const legiZi = pk.legi.filter((l) => l.z === d.z);
  const ecZ = pk.locuri.length ? r1(economieZile(legiZi).get(d.z) ?? 0) : null;
  const loc = (n) => (n ? { c: [r5(n.lat), r5(n.lon)], n: n.n, min: n.min } : null);
  randuri.push({
    uzina: 'BRICENI', saptamina: SAPT, m: d.m, z: d.z,
    // cifrele zilei = raportul BRICENI pe categorii (culoarea unui interval amestecat — ocolul pe acasă + drumul impus — e a părții mai mari,
    // deci suma culorilor nu e cifra raportului); «gol» = livrarea, «fortat» = gol pe rută + gol între ture + legătură
    sumar: { dow: new Date(`${d.z}T12:00:00Z`).getUTCDay(), total: kmZi, cuOameni: r1(d.det.km.cuOameni + d.det.km.nepotrivita), gol: d.det.km.livrare,
      fortat: r1(d.det.km.golRuta + d.det.km.golTure + d.det.km.legatura), livrare: d.det.km.livrare, brambura: d.det.brambura, economie: ecZ, ideal: null, linii, motivAfara: pk.locuri.length ? null : pk.motivFara,
      economieSapt: pk.economieSapt, locuri: pk.locuri.map((l) => l.n), sursaEconomie: 'parcare' },
    date: {
      t00, casa: casa ? { c: [r5(casa.lat), r5(casa.lon)], n: casa.n } : null, noapteA: loc(d.noapteA), noapteB: loc(d.noapteB), linii, iv: ivL, stai, zi: null, ideal: null,
      parcare: { locuri: pk.locuri, economieSapt: pk.economieSapt, idealSapt: null, motivFara: pk.motivFara,
        zi: { z: d.z, masurata: !!pk.locuri.length, motiv: pk.motivFara, real: r1(legiZi.reduce((a, l) => a + l.real, 0)), propus: r1(legiZi.reduce((a, l) => a + (l.prop ?? l.real), 0)), economie: ecZ },
        legi: pk.locuri.length ? legiZi.map((l) => ({ z: l.z, zUrm: null, parte: 'intre', ora: `${hhmm(l.t0)}–${hhmm(l.t1)}${l.noapte ? ' (noaptea)' : ''}`, oraDim: null,
          a: [r5(l.E.lat), r5(l.E.lon)], b: [r5(l.S.lat), r5(l.S.lon)], aN: l.aN, bN: l.bN, loc: l.loc, km: r1(l.prop), separat: false, real: r1(l.real), acum: l.acum?.n ?? null, tip: l.tip, podea: l.podea ? r1(l.podea) : null })) : [] },
    },
  });
}

// ════════ 4. controlul pe toată flota ════════
const inAnaliza = new Set(LS.masini.map((x) => x.m));
const inter = new Map(); for (const k of LS.zileInterurban ?? []) { const [m, z] = k.split('|'); inter.set(m, [...(inter.get(m) ?? []), z]); }
const cuUrma = readdirSync(`${B}zile`).filter((m) => ZILE.some((z) => existsSync(`${B}zile/${m}/${z}.json`)));
const atribuite = new Set(N.atribuiri.filter((a) => a.z >= N.FROM && a.z <= N.TO).map((a) => a.m));
const control = [];
for (const M of LS.masini) {
  const pk = PARC.get(M.m);
  control.push({ m: M.m, pe: true, zile: M.zile, km: Math.round(M.total), livrare: M.km.livrare, real: pk.real, propus: pk.propus, economieSapt: pk.economieSapt,
    locuri: pk.locuri.map((l) => `P${l.nr} ${l.n} (${l.drumuri} drumuri)`), drumuri: pk.legi.length, casa: pk.casa?.n ?? null,
    motiv: pk.locuri.length ? null : pk.motivFara, interurban: inter.get(M.m) ?? [] });
}
for (const m of [...new Set([...cuUrma, ...atribuite, ...inter.keys()])].sort()) {
  if (inAnaliza.has(m)) continue;
  let km = 0; for (const z of ZILE) { const d = ziFis(m, z); if (d) km += bucata(evenimente(d, []).pts, localToUtc(z, 180).getTime(), localToUtc(ziua(z, 1), 180).getTime()).km; }
  const motiv = inter.has(m) ? `zile cu cursă interurbană (Chișinău ↔ nord: ${inter.get(m).join(', ')}) — țin de analiza mejgorod, nu de Briceni`
    : !existsSync(`${B}zile/${m}`) || km < 1 ? `fără urmă GPS în săptămână${atribuite.has(m) ? ' (atribuită în grafic; fără tracker)' : ''} — în afara parcării (Ion, 01.10, întrebarea 7)`
    : `urmă GPS ${Math.round(km)} km, dar nicio cursă Trox pe rută și nicio cursă suburbană din orar${atribuite.has(m) ? ' (atribuită în grafic)' : ''}`;
  control.push({ m, pe: false, km: Math.round(km), motiv });
}
const flota = { masini: LS.masini.length, cuParcare: [...PARC.values()].filter((p) => p.locuri.length).length,
  economieSapt: r1([...PARC.values()].reduce((a, p) => a + p.economieSapt, 0)), livrareR1: LS.total.livrare, goluriScoase: GOLURI_SCOASE };

const kb = Math.round(JSON.stringify(randuri).length / 1024);
console.log(`harta BRICENI ${SAPT}: ${randuri.length} rânduri · ${kb} KB · mașini ${LS.masini.length} (cu parcare ${flota.cuParcare}) · de tăiat ${flota.economieSapt} km/săpt. · livrare R1 ${flota.livrareR1}`);
console.log(`  goluri scoase: ${JSON.stringify(GOLURI_SCOASE)}`);
for (const c of control) console.log(`  ${c.pe ? '✓' : '·'} ${c.m.padEnd(8)} ${c.pe ? `${c.zile} zile · ${c.km} km · real ${c.real} → ${c.propus} = −${c.economieSapt} · ${c.drumuri} drumuri · ${c.locuri.join(' + ') || '—'}` : `${c.km} km`} ${c.motiv ?? ''}`);
for (const p of PARC.values()) for (const l of p.legi) if (l.prop != null && l.prop > l.real + 0.05) { console.error(`${p.m} ${l.z}: propus ${l.prop} > real ${l.real}`); process.exit(3); }
if (difRaport.length) console.log(`  km pe categorii ≠ raport (${difRaport.length}):`, difRaport.slice(0, 12).join(', '));
if (difKm.length) console.log(`  Σ intervale ≠ km zilei (> 3 %, ${difKm.length}):`, difKm.slice(0, 12).join(', '));
if (difRaport.length > ZI.length * 0.05 * CAT.length) { console.error('prea multe zile diferite de raportul BRICENI — harta NU se scrie'); process.exit(3); }
if (difKm.length > randuri.length * 0.05) { console.error('prea multe zile cu Σ intervale ≠ km zilei — harta NU se scrie'); process.exit(3); }
const mare = randuri.filter((x) => JSON.stringify(x).length > 400 * 1024).map((x) => `${x.m} ${x.z}`);
if (mare.length) { console.error(`rânduri peste 400 KB: ${mare.join(', ')} — harta NU se scrie`); process.exit(3); }
if (!WRITE) process.exit(0);

const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc (--env-file)'); process.exit(1); }
const HJ = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const del = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.BRICENI&saptamina=eq.${SAPT}`, { method: 'DELETE', headers: HJ });
if (!del.ok) { console.error('DELETE', del.status, await del.text()); process.exit(1); }
for (let i = 0; i < randuri.length; i += 20) {
  const x = await fetch(`${SB}/rest/v1/lde_harta_zi`, { method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify(randuri.slice(i, i + 20)) });
  if (!x.ok) { console.error('POST', x.status, await x.text()); process.exit(1); }
}
const rap = { tip: 'harta_briceni', saptamina: SAPT, pana_la: N.TO, rulat: new Date().toISOString(), control, flota,
  parametri: { GOL_MAX_H, GOL_MIN_MIN, IESIRE_KM, RAZA_CAND, VAL_F, ZILE_MIN_PARCARE, podeaTrox: true },
  regula: 'Ion, 01.10.2026 («adaugă toate direcțiile»): plafon 20 h, podeaua Trox, opririle scurte nu taie drumul, autogara/Briceni candidați, gol forțat separat, doar pagina; 065LTL / 281BRAT afară cu motiv.' };
const up = await fetch(`${SB}/rest/v1/lde_analiza_reguli?on_conflict=uzina,saptamina`, { method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{ uzina: 'BRICENI_HARTA', saptamina: SAPT, rulat_la: new Date().toISOString(), date: rap }]) });
if (!up.ok) { console.error('lde_analiza_reguli', up.status, await up.text()); process.exit(1); }
console.log(`scris: ${randuri.length} rânduri în lde_harta_zi BRICENI ${SAPT} + controlul flotei în lde_analiza_reguli BRICENI_HARTA`);
