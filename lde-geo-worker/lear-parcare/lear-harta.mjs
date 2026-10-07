// ION-143 (Ion, 29.09.2026): «aplică pe pagina hartă și LEAR cu punctele optimale». Harta fiecărei mașini LEAR (Ungheni / Florești) pe zi,
// în același tabel ca Drăxlmaier (lde_harta_zi, ION-130): urma zilei de lucru (03:00–03:00) tăiată pe cursele cu oameni (tur / retur, din
// lear-parcare.mjs), golurile, așteptarea la poartă și drumul la parcul Bălți; opririle ≥ 5 min, casa, locurile P1 / P2 și drumurile propuse.
//
//   node lear-harta.mjs <dump.json> <parcare.json> <harta.json>
//
// Scrie doar fișierul; publicarea în bază e atomică, împreună cu date.parcare (publica-lear-parcare.mjs, Codex r1 C1). Verifică km pe intervale = km zilei.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { offsetLocal, ziLucru } from '/root/lde-worker/ora-locala.mjs';
import { valideazaParcareLear } from './lear-parcare-valid.mjs';

const [DF, PF, OUT] = process.argv.slice(2);
if (!DF || !PF || !OUT || !existsSync(DF) || !existsSync(PF)) { console.error('lear-harta.mjs <dump.json> <parcare.json> <harta.json>'); process.exit(2); }
const D = JSON.parse(readFileSync(DF, 'utf8')), PK = JSON.parse(readFileSync(PF, 'utf8'));
if (PK.uzina !== D.uzina || PK.saptamina !== D.saptamina) { console.error(`parcare.json (${PK.uzina} ${PK.saptamina}) ≠ dump (${D.uzina} ${D.saptamina})`); process.exit(2); }
const rele = valideazaParcareLear(PK); if (rele.length) { console.error(`parcare.json respins: ${rele.join('; ')} — harta NU se scrie`); process.exit(1); }
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const G = D.poarta, PARC = D.parc, SALT_KM = 5, R_PARC_ZONA = 3;
const SATE = [];
for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
  if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
  if (!/^(village|town|city|hamlet|suburb)$/.test(g.properties?.place ?? '')) continue;
  const [lon, lat] = g.geometry.coordinates; if (lat > 45.3 && lat < 48.7 && lon > 26.4 && lon < 30.3) SATE.push({ n: g.properties.name, lat, lon });
}
const numeLoc = (p) => { if (hav(p, G) <= 1) return 'poarta LEAR'; if (hav(p, PARC) <= 0.8) return 'Parcul Bălți';
  let b = null, d = 1e9; for (const s of SATE) { const k = hav(p, s); if (k < d) { d = k; b = s.n; } } return d <= 2 ? b : `${b} (${r1(d)} km)`; };
function dp(Pt, eps) {   // Douglas–Peucker în metri (ca harta-zi.mjs Drăxlmaier)
  if (Pt.length < 3) return Pt;
  const k = 111320, c = Math.cos(Pt[0].lat * Math.PI / 180), X = Pt.map((p) => [p.lon * k * c, p.lat * k]);
  const keep = new Uint8Array(Pt.length); keep[0] = keep[Pt.length - 1] = 1; const st = [[0, Pt.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = -1, md = 0; const [x1, y1] = X[a], [x2, y2] = X[b], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((x2 - x1) * (y1 - X[i][1]) - (x1 - X[i][0]) * (y2 - y1)) / L; if (d > md) { md = d; m = i; } }
    if (md > eps) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return Pt.filter((_, i) => keep[i]);
}
const km = (Q) => { let s = 0; for (let i = 1; i < Q.length; i++) { const a = Q[i - 1], b = Q[i]; const d = hav(a, b); if (d < SALT_KM && !(a.v <= 1 && b.v <= 1)) s += d; } return s; };
// 03:00 locală a zilei de lucru z, în ms UTC
const t03 = (z) => { const u = Date.parse(`${z}T03:00:00Z`); return u - offsetLocal(u - 3 * 3600e3); };
const FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
const ora = (t) => FMT.format(new Date(t));
const pkM = new Map(PK.masini.map((x) => [x.m, x]));
// ION-268: eticheta unei curse din plan, în cuvinte (pagina /lde/harta o arată pe rândul cursei)
const numeR = (id) => { const r = (PK.ruteCapat ?? {})[id]; return id ? `${id}${r ? ` ${r}` : ''}` : '?'; };
function etRol(r) {
  if (r.tip === 'plus' && r.statut === 's3') return `Posibil cursă schimbul 3${r.sensPlus ? ` (${r.sensPlus})` : ''} · ${numeR(r.ruta)} — de confirmat`;
  if (r.tip === 'plus') return `Cursă în plus${r.sensPlus ? ` (${r.sensPlus})` : ''} · ${numeR(r.ruta)} — de confirmat`;
  const baza = `${r.tip === 'tur' ? 'Tur' : 'Retur'} s${r.schimb ?? '?'} · ${numeR(r.rutaPlan ?? r.ruta)}`;
  if (r.statut === 'facuta' && r.schimbCu) return `${r.tip === 'tur' ? 'Tur' : 'Retur'} s${r.schimb ?? '?'} · ${numeR(r.ruta)} — schimb de rută cu ${r.schimbCu}`;
  if (r.statut === 'neconfirmata' && r.rutaUrma) return `${baza} — neconfirmată (urma arată ruta ${r.rutaUrma})`;
  if (r.statut === 'neconfirmata') return `${baza} — neconfirmată (capăt atins, fără drumul rutei și fără urcări)`;
  return baza;
}
const ID = D.uzina;   // LEAR_UNGHENI / LEAR_FLORESTI

const randuri = [], probe = { zile: 0, difKm: [] };
for (const M of D.masini) {
  const pk = pkM.get(M.m); if (!pk) continue;
  const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v })).sort((a, b) => a.t - b.t);
  const buc = (pk.bucati ?? []).map((b) => ({ ...b }));
  const linii = M.rute.map((r) => r.id);
  for (const z of M.zile) {
    const t00 = t03(z), t11 = t00 + 24 * 3600e3, Q = P.filter((p) => p.t >= t00 && p.t < t11);
    if (Q.length < 2) continue;
    // intervalele: cursele (tur / retur) ale zilei, tăiate la fereastra zilei; între ele golurile
    const iv = []; let t = t00;
    const adauga = (a, b, tip, buc) => { if (b - a < 60e3) return; const S = P.filter((p) => p.t >= a && p.t <= b); if (S.length < 2) return;
      let tipF = tip;
      if (tip === 'gol') { if (S.every((p) => hav(p, G) <= 1.5)) tipF = 'uzina'; else if (S.some((p) => hav(p, PARC) <= R_PARC_ZONA)) tipF = 'munca'; }
      const k = r1(km(S)); const cat = tipF === 'cursa' ? 'cuOameni' : tipF === 'uzina' ? 'golTure' : tipF === 'munca' ? 'service' : 'gol';
      iv.push({ ora: `${ora(a)}–${ora(b)}`, t0: Math.round((a - t00) / 1000), t1: Math.round((b - t00) / 1000), tip: tipF, cats: { [cat]: k }, km: k,
        de: numeLoc(S[0]), pana: numeLoc(S.at(-1)), ocol: false, lin: null, prelungit: null,
        // ION-268: rolul cursei din PLANUL zilei (schelet întâi) — Tur/Retur · schimb · rută, statutul (făcută / neconfirmată / în plus / posibil schimbul 3)
        ...(tipF === 'cursa' && buc?.roluri?.length ? { rol: buc.roluri[0], roluri: buc.roluri, eticheta: buc.roluri.map(etRol).join(' + ') } : {}),
        ...(tipF === 'cursa' && buc?.roluri?.every((r) => r.statut !== 'facuta') ? { cats: { neconfirmat: k } } : {}),
        s: dp(S, 15).map((p) => [r5(p.lat), r5(p.lon), Math.round((p.t - t00) / 1000)]) });
      // T.1–T.3 (TUR = RETUR): cursa făcută arată km din schelet ai rutei — aceiași la tur și la retur; km GPS ai bucății rămân informativi (kmGps)
      const fac = tipF === 'cursa' ? (buc?.roluri ?? []).filter((r) => r.statut === 'facuta' && r.kmS != null) : [];
      if (fac.length) { const v = iv.at(-1), kS = r1(fac.reduce((q, r) => q + r.kmS, 0)); v.kmGps = k; v.km = kS; v.cats = { cuOameni: kS }; } };
    for (const b of buc.filter((x) => x.t1 > t00 && x.t0 < t11 && x.fel !== 'poarta').sort((x, y) => x.t0 - y.t0)) {
      const a0 = Math.max(b.t0, t00), a1 = Math.min(b.t1, t11);
      if (a0 > t) adauga(t, a0, 'gol');
      adauga(Math.max(a0, t), a1, 'cursa', b); t = Math.max(t, a1);
    }
    if (t < t11) adauga(t, Math.min(t11, Q.at(-1).t), 'gol');
    // ION-268: rezumatul zilei = PLANUL (schelet + listă + rotație) față de ce a confirmat GPS-ul; «lipsă» = cursele din plan nefăcute
    const zp = (pk.plan?.zile ?? []).find((x) => x.z === z) ?? null;
    const SIMB = { facuta: '✓', neconfirmata: '?', lipsa: '✗' };
    const rez = [], lipsa = [];
    if (zp) {
      for (const sc of [1, 2]) { const L = zp.curse.filter((c) => c.schimb === sc); if (!L.length) continue;
        rez.push(`s${sc}: ${L.map((c) => `${c.sens} ${c.ruta ?? '—'}${c.schimbCu ? ` (schimb de rută cu ${c.schimbCu})` : ''} ${SIMB[c.statut] ?? ''}`).join(' · ')}`);
        for (const c of L) if (c.statut === 'lipsa' || c.statut === 'neconfirmata') lipsa.push(`${c.sens} s${sc} ${c.ruta ?? '—'}${c.statut === 'neconfirmata' ? ' (neconfirmată)' : ''}`); }
      const pl = zp.plus.filter((x) => !x.s3), s3 = zp.plus.filter((x) => x.s3);
      if (pl.length) rez.push(`în plus: ${pl.map((x) => `${x.ruta} ${ora(x.t0)}`).join(', ')}`);
      if (s3.length) rez.push(`posibil schimbul 3: ${s3.map((x) => `${x.ruta} ${ora(x.t0)}`).join(', ')}`);
      if (zp.faraPoarta) rez.push('ziua fără poartă');
    }
    const rezumat = rez.join('; ');
    const kmZi = km(Q), kmIv = iv.reduce((s, v) => s + (v.kmGps ?? v.km), 0);   // controlul pe km GPS (cursa făcută arată km din schelet)
    if (Math.abs(kmIv - kmZi) > Math.max(3, kmZi * 0.05)) probe.difKm.push(`${M.m} ${z} ${r1(kmIv)}/${r1(kmZi)}`);
    // opririle ≥ 5 min
    const stai = []; let a0 = null, prev = null;
    for (const p of Q) { if (!a0 || hav(a0, p) > 0.3) { if (a0 && prev.t - a0.t >= 5 * 60e3) stai.push([r5(a0.lat), r5(a0.lon), Math.round((a0.t - t00) / 1000), Math.round((prev.t - t00) / 1000), numeLoc(a0)]); a0 = p; } prev = p; }
    if (a0 && prev.t - a0.t >= 5 * 60e3) stai.push([r5(a0.lat), r5(a0.lon), Math.round((a0.t - t00) / 1000), Math.round((prev.t - t00) / 1000), numeLoc(a0)]);
    const necalc = pk.real == null && !!pk.motivFara && !/^niciun gol/.test(pk.motivFara);
    const zpk = (pk.zile ?? []).find((x) => x.z === z) ?? null, cuOameni = iv.filter((v) => v.tip === 'cursa' && !v.cats.neconfirmat).reduce((s, v) => s + v.km, 0);
    const legi = pk.locuri.length ? (pk.legi ?? []).filter((l) => l.z === z).map((l) => ({ z: l.z, zUrm: null, parte: 'intre', ora: l.ora, oraDim: null, a: l.a, b: l.b, aN: l.aN, bN: l.bN, loc: l.loc, km: l.km, separat: false, real: l.real, acum: l.acum?.n ?? null, ocol: l.ocol ?? 0, explicatie: l.explicatie ?? null })) : [];
    const dow = new Date(`${z}T12:00:00Z`).getUTCDay();
    randuri.push({ uzina: ID, saptamina: D.saptamina, m: M.m, z,
      sumar: { dow, total: r1(kmZi), cuOameni: r1(cuOameni), gol: r1(iv.filter((v) => v.tip === 'gol').reduce((s, v) => s + v.km, 0)),
        economie: pk.locuri.length && zpk ? zpk.economie : null, ideal: null, motivAfara: pk.locuri.length ? null : pk.motivFara ?? null,
        // ION-263: mașina scoasă din calcul (motivFara fără cifre) are economia «necalculat» (null), nu 0 km de tăiat
        economieSapt: necalc ? null : pk.economieSapt ?? 0, locuri: pk.locuri.map((l) => l.n), sursaEconomie: 'parcare', linii, rezumat, lipsa, plan: zp ? { planificate: zp.faraPoarta ? 0 : zp.curse.length, facute: zp.curse.filter((c) => c.statut === 'facuta').length,  neconfirmate: zp.curse.filter((c) => c.statut === 'neconfirmata').length, lipsa: zp.curse.filter((c) => c.statut === 'lipsa').length, plus: zp.plus.length } : null },
      date: { t00, casa: M.casaC ? { n: M.casa, c: [r5(M.casaC[0]), r5(M.casaC[1])] } : null, noapteA: null, noapteB: null, linii, iv, stai, zi: null, ideal: null,
        parcare: { locuri: pk.locuri, economieSapt: necalc ? null : pk.economieSapt ?? 0, idealSapt: null, zi: zpk ? { z, masurata: true, motiv: null, real: zpk.real, propus: zpk.propus, economie: zpk.economie } : null, legi },
        // ION-268: planul zilei din schelet și ce a confirmat GPS-ul
        plan: zp } });
    probe.zile++;
  }
}
const kb = Math.round(JSON.stringify(randuri).length / 1024);
console.log(`harta ${D.nume} ${D.saptamina}: ${probe.zile} zile · ${randuri.length} rânduri · ${kb} KB · km diferiți ${probe.difKm.length}`);
if (probe.difKm.length) console.log('  intervale ≠ km zilei (> 5 %):', probe.difKm.slice(0, 12).join(', '));
if (probe.difKm.length > randuri.length * 0.05) { console.error('prea multe zile cu km diferiți — harta NU se scrie'); process.exit(3); }
writeFileSync(OUT, JSON.stringify({ uzina: ID, saptamina: D.saptamina, randuri }));
console.log(`scris ${OUT}`);
