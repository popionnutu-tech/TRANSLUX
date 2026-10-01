// ION-147 (Ion, 30.09.2026): «creează-le hărțile la toate direcțiile cu punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR».
// Harta fiecărei mașini SEBN Orhei + Strășeni pe zi, în lde_harta_zi (uzina 'SEBN'), după lear-harta.mjs (ION-143): urma zilei de lucru
// (03:00–03:00, §2.4) tăiată pe cursele cu oameni (din sebn-parcare.mjs), golurile, așteptarea la poartă, BUCLA LA PREDAREA TUREI (răspunsul 2:
// categorie separată, fără km de tăiat), Parcul Bălți, opririle ≥ 5 min, casa, locurile P1 / P2 și drumurile propuse.
//
//   node sebn-harta.mjs <dump.json> <parcare.json> <harta.json> [--write]
//
// Fără --write: doar fișierul și probele. Cu --write: rândurile săptămânii se șterg și se rescriu prin REST (ca la camioane ION-150; fără
// migrație și fără RPC — răspunsul «Tehnic»). Totul se construiește și se verifică ÎNAINTE de ștergere; o probă picată = nu se atinge baza.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { offsetLocal } from '../ora-locala.mjs';
import { valideazaParcareLear, valideazaHartaLear } from '../lear-parcare/lear-parcare-valid.mjs';
import { clasaGol } from './sebn-harta-core.mjs';

const argv = process.argv.slice(2), WRITE = argv.includes('--write');
const [DF, PF, OUT] = argv.filter((a) => !a.startsWith('--'));
if (!DF || !PF || !OUT || !existsSync(DF) || !existsSync(PF)) { console.error('sebn-harta.mjs <dump.json> <parcare.json> <harta.json> [--write]'); process.exit(2); }
const D = JSON.parse(readFileSync(DF, 'utf8')), PK = JSON.parse(readFileSync(PF, 'utf8'));
if (D.uzina !== 'SEBN' || PK.uzina !== D.uzina || PK.saptamina !== D.saptamina) { console.error(`parcare.json (${PK.uzina} ${PK.saptamina}) ≠ dump (${D.uzina} ${D.saptamina})`); process.exit(2); }
const rele = valideazaParcareLear(PK); if (rele.length) { console.error(`parcare.json respins: ${rele.join('; ')} — harta NU se scrie`); process.exit(1); }
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const PORTI = Object.values(D.porti).map((u) => ({ lat: u.poarta.lat, lon: u.poarta.lon, r: u.rPoarta, n: u.nume }));
const PARC = D.parc, SALT_KM = 5, R_PARC = 0.5;   // §11.4: Parcul Bălți la 0,5 km (capătul R23 e la ~0,9 km de el)
const SATE = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  if (!/^(village|town|city|hamlet|suburb)$/.test(g.properties?.place ?? '')) continue;
  const [lon, lat] = g.geometry.coordinates; if (lat > 45.3 && lat < 48.7 && lon > 26.4 && lon < 30.3) SATE.push({ n: g.properties.name, lat, lon });
}
const numeLoc = (p) => { const g = PORTI.find((x) => hav(p, x) <= x.r + 0.3); if (g) return `poarta SEBN ${g.n}`; if (hav(p, PARC) <= 0.8) return 'Parcul Bălți';
  let b = null, d = 1e9; for (const s of SATE) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 2 ? b : `${b} (${r1(d)} km)`; };
function dp(Pt, eps) {   // Douglas–Peucker în metri (ca lear-harta.mjs)
  if (Pt.length < 3) return Pt;
  const k = 111320, c = Math.cos(Pt[0].lat * Math.PI / 180), X = Pt.map((p) => [p.lon * k * c, p.lat * k]);
  const keep = new Uint8Array(Pt.length); keep[0] = keep[Pt.length - 1] = 1; const st = [[0, Pt.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = -1, md = 0; const [x1, y1] = X[a], [x2, y2] = X[b], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - X[i][1]) - (x1 - X[i][0]) * (y2 - y1)) / L; if (d > md) { md = d; m = i; } }
    if (md > eps) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return Pt.filter((_, i) => keep[i]);
}
const km = (Q) => { let s = 0; for (let i = 1; i < Q.length; i++) { const a = Q[i - 1], b = Q[i]; const d = hav(a, b); if (d < SALT_KM && !(a.v <= 1 && b.v <= 1)) s += d; } return s; };
const t03 = (z) => { const u = Date.parse(`${z}T03:00:00Z`); return u - offsetLocal(u - 3 * 3600e3); };
const FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
const ora = (t) => FMT.format(new Date(t));
const pkM = new Map(PK.masini.map((x) => [x.m, x]));
const CAT = { cursa: 'cuOameni', uzina: 'golTure', munca: 'service', bucla: 'buclaPredare', gol: 'gol' };

const randuri = [], probe = { zile: 0, difKm: [], faraRand: [], kmBucla: 0, bucle: 0 };
for (const M of D.masini) {
  const pk = pkM.get(M.m); if (!pk) { probe.faraRand.push(`${M.m}: lipsește din parcare`); continue; }
  const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v })).sort((a, b) => a.t - b.t);
  const G = M.poarta, buc = pk.bucati ?? [], linii = pk.linii ?? [];
  let zileScrise = 0;
  for (const z of M.zile.filter((x) => t03(x) + 24 * 3600e3 <= Date.parse(PK.rulat))) {
    const t00 = t03(z), t11 = t00 + 24 * 3600e3, Q = P.filter((p) => p.t >= t00 && p.t < t11);
    if (Q.length < 2) continue;
    const iv = []; let t = t00;
    const adauga = (a, b, tip) => { if (b - a < 60e3) return; const S = P.filter((p) => p.t >= a && p.t <= b); if (S.length < 2) return;
      const tipF = tip === 'gol' ? clasaGol(S, { G, rPoarta: M.rPoarta ?? 0.7, porti: PORTI, parc: PARC, rParc: R_PARC, hav }) : tip;
      const k = r1(km(S));
      if (tipF === 'bucla') { probe.kmBucla += k; probe.bucle++; }
      iv.push({ ora: `${ora(a)}–${ora(b)}`, t0: Math.round((a - t00) / 1000), t1: Math.round((b - t00) / 1000), tip: tipF, cats: { [CAT[tipF]]: k }, km: k,
        de: numeLoc(S[0]), pana: numeLoc(S.at(-1)), ocol: false, lin: null, prelungit: null,
        s: dp(S, 15).map((p) => [r5(p.lat), r5(p.lon), Math.round((p.t - t00) / 1000)]) }); };
    for (const b of buc.filter((x) => x.t1 > t00 && x.t0 < t11).sort((x, y) => x.t0 - y.t0)) {
      const a0 = Math.max(b.t0, t00), a1 = Math.min(b.t1, t11);
      if (a0 > t) adauga(t, a0, 'gol');
      adauga(Math.max(a0, t), a1, 'cursa'); t = Math.max(t, a1);
    }
    if (t < t11) adauga(t, Math.min(t11, Q.at(-1).t), 'gol');
    if (!iv.length) continue;
    const kmZi = km(Q), kmIv = iv.reduce((s, v) => s + v.km, 0);
    if (Math.abs(kmIv - kmZi) > Math.max(3, kmZi * 0.05)) probe.difKm.push(`${M.m} ${z} ${r1(kmIv)}/${r1(kmZi)}`);
    const stai = []; let a0 = null, prev = null;
    for (const p of Q) { if (!a0 || hav(a0, p) > 0.3) { if (a0 && prev.t - a0.t >= 5 * 60e3) stai.push([r5(a0.lat), r5(a0.lon), Math.round((a0.t - t00) / 1000), Math.round((prev.t - t00) / 1000), numeLoc(a0)]); a0 = p; } prev = p; }
    if (a0 && prev.t - a0.t >= 5 * 60e3) stai.push([r5(a0.lat), r5(a0.lon), Math.round((a0.t - t00) / 1000), Math.round((prev.t - t00) / 1000), numeLoc(a0)]);
    const zp = (pk.zile ?? []).find((x) => x.z === z) ?? null;
    const suma = (tip) => r1(iv.filter((v) => v.tip === tip).reduce((s, v) => s + v.km, 0));
    const legi = pk.locuri.length ? (pk.legi ?? []).filter((l) => l.z === z).map((l) => ({ z: l.z, zUrm: null, parte: 'intre', ora: l.ora, oraDim: null, a: l.a, b: l.b, aN: l.aN, bN: l.bN, loc: l.loc, km: l.km, separat: false, real: l.real, acum: l.acum?.n ?? null })) : [];
    randuri.push({ uzina: 'SEBN', saptamina: D.saptamina, m: M.m, z,
      sumar: { dow: new Date(`${z}T12:00:00Z`).getUTCDay(), total: r1(kmZi), cuOameni: suma('cursa'), gol: suma('gol'), bucla: suma('bucla'),
        economie: pk.locuri.length && zp ? zp.economie : null, ideal: null, motivAfara: pk.locuri.length ? null : pk.motivFara ?? null,
        economieSapt: pk.economieSapt ?? 0, locuri: pk.locuri.map((l) => l.n), sursaEconomie: 'parcare', linii, ruteGps: !!pk.ruteGps, poarta: pk.poarta ?? null },
      date: { t00, casa: M.casaC ? { n: M.casa, c: [r5(M.casaC[0]), r5(M.casaC[1])] } : null, noapteA: null, noapteB: null, linii, iv, stai, zi: null, ideal: null,
        parcare: { locuri: pk.locuri, economieSapt: pk.economieSapt ?? 0, idealSapt: null, zi: zp ? { z, masurata: true, motiv: null, real: zp.real, propus: zp.propus, economie: zp.economie } : null, legi } } });
    probe.zile++; zileScrise++;
  }
  if (!zileScrise) probe.faraRand.push(`${M.m}: nicio zi încheiată cu urmă (${M.zile.length} zile în dump)`);
}
const kb = Math.round(JSON.stringify(randuri).length / 1024);
console.log(`harta ${D.nume} ${D.saptamina}: ${D.masini.length} mașini în flotă · ${new Set(randuri.map((r) => r.m)).size} pe hartă · ${randuri.length} rânduri · ${kb} KB · km diferiți ${probe.difKm.length} · bucle la predare ${probe.bucle} / ${r1(probe.kmBucla)} km`);
if (probe.faraRand.length) console.log('  fără hartă:', probe.faraRand.join('; '));
if (probe.difKm.length) console.log('  intervale ≠ km zilei (> 5 %):', probe.difKm.slice(0, 12).join(', '));
if (probe.difKm.length > randuri.length * 0.05) { console.error('prea multe zile cu km diferiți — harta NU se scrie'); process.exit(3); }
const releH = valideazaHartaLear({ randuri }, PK); if (releH.length) { console.error(`harta respinsă: ${releH.slice(0, 8).join('; ')} — NU se scrie`); process.exit(3); }
writeFileSync(OUT, JSON.stringify({ uzina: 'SEBN', saptamina: D.saptamina, randuri }));
console.log(`scris ${OUT}`);

if (WRITE) {
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB || !KEY) { console.error('lipsesc SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(4); }
  const HJ = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  const del = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.SEBN&saptamina=eq.${D.saptamina}`, { method: 'DELETE', headers: HJ });
  if (!del.ok) { console.error(`DELETE ${del.status} ${await del.text()}`); process.exit(5); }
  for (let i = 0; i < randuri.length; i += 20) {
    const x = await fetch(`${SB}/rest/v1/lde_harta_zi`, { method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify(randuri.slice(i, i + 20)) });
    if (!x.ok) { console.error(`POST rândurile ${i}–${i + 19}: ${x.status} ${await x.text()} — săptămâna e incompletă, rulează din nou lant.sh`); process.exit(6); }
  }
  const n = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.SEBN&saptamina=eq.${D.saptamina}&select=m`, { headers: { ...HJ, Prefer: 'count=exact', Range: '0-0' } });
  const tot = Number((n.headers.get('content-range') ?? '').split('/')[1]);
  if (tot !== randuri.length) { console.error(`după scriere: ${tot} rânduri în bază ≠ ${randuri.length}`); process.exit(7); }
  console.log(`scris: ${randuri.length} rânduri în lde_harta_zi SEBN ${D.saptamina} (verificat: ${tot})`);
}
