// ION-124 r1 · s3b: săptămâna 14–20.09 (lanțul de luni: economie-zile.json + economie-urme/) — câți km ne-«cuOameni» sunt de fapt
// drumul cu urcări / coborâri prin orașul din actul rutei, legat de o cursă a liniei. Doar citire.
// Rulare pe VPS: node /tmp/ion124-s3b.mjs > s3b-saptamana.json
// Oprire scurtă = puncte consecutive < 10 km/h, 15 s – 5 min (durata = de la punctul dinainte la cel de după, golurile tăiate la 120 s).
// Casa = ≤ 0,4 km de locul nopții (noapteA/noapteB). Zona orașului = cel mai apropiat loc OSM city/town/village (≤ 3 km) e orașul.
// Legătura cu cursa: înaintea unui TUR «cuOameni» — urma de la ultima oprire > 5 min / oprire acasă / sfârșitul cursei precedente
// (cel mult 60 min) până la începutul turului; după un RETUR — de la sfârșitul returului până la prima oprire > 5 min / acasă /
// cursa următoare (cel mult 60 min). ≥ 2 opriri scurte distincte (≥ 150 m) în oraș = urcări → km de la prima urcare la tur /
// de la retur la ultima coborâre ar fi «cuOameni»; se scad pro-rata din categoriile segmentelor peste care cad.
import fs from 'fs';
const D = '/root/lde-worker/drax/date/saptamanal/2026-09-14/';
const J = (f) => JSON.parse(fs.readFileSync(D + f, 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const nk = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ORASE = { R19: ['Sîngerei'], R9: ['Glodeni'], R3: ['Rîșcani'], R16: ['Florești', 'Mărculești'], R17: ['Mărculești'], R23: ['Fălești'],
  R21: ['Biruința'], R15: ['Drochia'], R31: ['Ghindești'], R8: ['Costești'] };
const PL = [];
for (const line of fs.readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  const cl = line.replace(/\x1e/g, '').trim(); if (!cl) continue; let f; try { f = JSON.parse(cl); } catch { continue; }
  const pl = f.properties?.place; if (!['city', 'town', 'village'].includes(pl)) continue;
  const [lon, lat] = f.geometry.coordinates; if (lat < 47.3 || lat > 48.4 || lon < 27 || lon > 28.8) continue;
  PL.push({ n: f.properties['name:ro'] ?? f.properties.name, lat, lon, pl });
}
const loc = (p) => { let b = null, bd = 9; for (const q of PL) { const d = hav(p, q); if (d < bd) { bd = d; b = q; } } return b && bd <= 3 ? b : null; };
const MASINI = ['830MUM', '725CWN', '744ARF', '435ASB', '518MHD', '350KAJ', '925FTI', '446ASB', '457BRAX', '345KAJ', '186OMM', '402VKV', '388ASB', '024XKY', '715IZX', '713IZX', '763LYY', '293QVT'];
const EZ = J('economie-zile.json'); const A = J('analiza.json');
const hm = (t) => new Intl.DateTimeFormat('ro', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
const kat = (s) => s.cat === 'livrare' ? (s.ocol ? 'acasa(ocol)' : /nop/.test(s.motiv ?? '') ? 'livrare(noapte)' : 'livrare') : s.cat;
const out = { rulat: new Date().toISOString(), masini: {}, total: {}, peDrum: {} };
for (const m of MASINI) {
  const am = A.masini.find((x) => x.m === m);
  const R = { casa: am?.casa ?? null, zile: 0, kmAnaliza: am?.km ?? null, mutat: {}, cazuri: [], peDrum: {}, faraLegatura: 0 };
  for (const z of EZ.zile.filter((z) => z.m === m)) {
    let U; try { U = JSON.parse(fs.readFileSync(`${D}economie-urme/${m}/${z.z}.json`, 'utf8')); } catch { continue; }
    R.zile++;
    const P = U.pts.filter((p) => p.t != null && p.lat != null);
    const cum = [0]; for (let i = 1; i < P.length; i++) { const d = hav(P[i - 1], P[i]); cum.push(cum[i - 1] + (d < 5 ? d : 0)); }
    const idx = (t) => { let lo = 0, hi = P.length - 1; while (lo < hi) { const q = (lo + hi) >> 1; if (P[q].t < t) lo = q + 1; else hi = q; } return lo; };
    const noapte = [z.noapteA, z.noapteB].filter(Boolean);
    const rute = new Set((z.linii ?? []).map((l) => l.split('|')[0]));
    const orase = [...rute].flatMap((r) => ORASE[r] ?? []);
    if (!orase.length) continue;
    const halts = [];
    for (let i = 0; i < P.length;) { if (!(P[i].v < 10)) { i++; continue; } let j = i; while (j + 1 < P.length && P[j + 1].v < 10) j++;
      let dur = 0; for (let k = Math.max(i, 1); k <= Math.min(j + 1, P.length - 1); k++) dur += Math.min((P[k].t - P[k - 1].t) / 1000, 120);
      const mid = P[(i + j) >> 1]; const l = loc(mid);
      halts.push({ t0: P[i].t, t1: P[j].t, dur, lat: mid.lat, lon: mid.lon, casa: noapte.some((q) => hav(mid, q) <= 0.4),
        oras: l && l.pl === 'town' && orase.some((n) => nk(n) === nk(l.n)) ? l.n : null });
      i = j + 1; }
    const segs = z.seg.filter((s) => s.t1 > s.t0);
    const cuO = segs.filter((s) => s.cat === 'cuOameni');
    const lung = (h) => h.casa || h.dur > 300;
    for (const s of cuO) for (const h of halts) if (h.oras && !h.casa && h.dur >= 15 && h.dur <= 300 && h.t0 >= s.t0 && h.t1 <= s.t1) { const k = `${s.lin} ${s.sens} · ${h.oras}`; R.peDrum[k] = (R.peDrum[k] ?? 0) + 1; }
    const distinct = (a) => { const r = []; for (const h of a) if (!r.some((x) => hav(x, h) < 0.15)) r.push(h); return r; };
    const muta = (a, b, caz) => { // km GPS între a și b, repartizați pe segmentele ne-cuOameni peste care cad, scalați la km-ul segmentului
      const parti = {}; let tot = 0;
      for (const s of segs.filter((s) => s.cat !== 'cuOameni' && s.t1 > a && s.t0 < b)) {
        const x = Math.max(a, s.t0), y = Math.min(b, s.t1); const gSeg = (cum[idx(s.t1)] - cum[idx(s.t0)]) || 1;
        const frate = segs.filter((q) => q.t0 === s.t0 && q.t1 === s.t1); const kmFer = frate.reduce((u, q) => u + q.km, 0);
        const km = (cum[idx(y)] - cum[idx(x)]) * (kmFer / gSeg) * (s.km / (kmFer || 1));
        parti[kat(s)] = +((parti[kat(s)] ?? 0) + km).toFixed(1); tot += km; }
      for (const [c, v] of Object.entries(parti)) R.mutat[c] = +((R.mutat[c] ?? 0) + v).toFixed(1);
      R.cazuri.push({ ...caz, km: +tot.toFixed(1), parti });
    };
    for (const s of cuO) {
      if (s.sens === 'tur') {
        const prev = cuO.filter((q) => q.t1 <= s.t0).at(-1); let a = Math.max(s.t0 - 3600e3, prev ? prev.t1 : 0);
        for (const h of halts) if (h.t1 <= s.t0 && h.t1 > a && lung(h)) a = h.t1;
        const u = distinct(halts.filter((h) => h.oras && !h.casa && h.dur >= 15 && h.dur <= 300 && h.t0 >= a && h.t1 <= s.t0));
        if (u.length >= 2) muta(u[0].t0, s.t0, { zi: z.z, lin: s.lin, sens: 'tur', oras: u[0].oras, urcari: u.length, de: hm(u[0].t0), pana: hm(s.t0), dupa: prev ? 'cursă' : 'oprire lungă/acasă' });
      } else {
        const next = cuO.find((q) => q.t0 >= s.t1); let b = Math.min(s.t1 + 3600e3, next ? next.t0 : Infinity);
        for (const h of halts) if (h.t0 >= s.t1 && h.t0 < b && lung(h)) { b = h.t0; break; }
        const u = distinct(halts.filter((h) => h.oras && !h.casa && h.dur >= 15 && h.dur <= 300 && h.t0 >= s.t1 && h.t1 <= b));
        if (u.length >= 2) muta(s.t1, u.at(-1).t1, { zi: z.z, lin: s.lin, sens: 'retur', oras: u[0].oras, coborari: u.length, de: hm(s.t1), pana: hm(u.at(-1).t1) });
      }
    }
  }
  R.mutatTotal = +Object.values(R.mutat).reduce((a, b) => a + b, 0).toFixed(1);
  out.masini[m] = R;
  for (const [c, v] of Object.entries(R.mutat)) out.total[c] = +((out.total[c] ?? 0) + v).toFixed(1);
  for (const [k, v] of Object.entries(R.peDrum)) out.peDrum[k] = (out.peDrum[k] ?? 0) + v;
}
out.totalKm = +Object.values(out.total).reduce((a, b) => a + b, 0).toFixed(1);
console.log(JSON.stringify(out, null, 1));
