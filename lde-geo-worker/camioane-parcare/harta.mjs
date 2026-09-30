// ION-150 — harta cisternelor pe zi (pagina /lde/harta?uz=camioane). Ion, 30.09.2026: «creează-le hărțile la toate direcțiile cu
// punctele optimale de dormit cum ai făcut la Drăxlmaier și LEAR» → răspunsul la întrebarea 1: «drumul față de schelet, P1/P2 doar informativ».
//
// Pentru fiecare zi a săptămânii (00:00–24:00, ora Moldovei) și fiecare cisternă cu urme scrie un rând lde_harta_zi (uzina 'CAMIOANE'):
//   • intervalele zilei, fiecare cu UN fel: plin (cu marfă) · gol · la punct (încărcare / descărcare / bază / vamă) · parcare (≥ 60 min);
//     cursele se taie cu seg-core.mjs (ION-69/144, importat, neschimbat), km din urma GPS (calculeaza), Σ intervale = km-ul zilei;
//   • drumurile zilei față de schelet (idealul din verificare-schelet.json, ca ION-144) și cheia liniei din public/lde/schelet-camioane.json;
//   • abaterile din lde_truck_route_checks (ION-144) ale drumurilor care ating ziua;
//   • casa șoferului (parcarea ≥ 8 h cea mai folosită în Moldova, 45 de zile), noaptea, opririle ≥ 5 min;
//   • locurile de stat P1/P2 ale săptămânii — DOAR INFORMATIV, fără km de tăiat (Ion, 30.09).
// Controlul flotei (fiecare placă Wialon + fiecare cisternă din lde_truck_profile: pe hartă sau motivul) → lde_analiza_reguli 'CAMIOANE'.
//
//   node --env-file=/root/lde-worker/.env harta.mjs --sapt=AAAA-LL-ZZ (luni) [--placi=A,B] [--write]
// Fără --write doar calculează și tipărește controlul.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  adaugaZile, casaDin, cheieBiodiesel, cheieMotorina, distLaLinie, dp, hav, judecaStationare, locuriSaptamana, miezulNoptii,
  odihnaBuna, oraLoc, scurt, taieZiua, ziLocala, ODIHNA_BUNA, R_LINIE_KM,
} from './harta-core.mjs';

const V = '/root/lde-worker/camioane/verif';
const { calculeaza, grupeazaOpriri, punctLa } = await import(`${V}/lib.mjs`);
const { configureaza, segmenteazaPlaca } = await import(`${V}/seg-core.mjs`);
const { taraDinPozitie } = await import(`${V}/vendor/tara.mjs`);
const URME = process.env.CAMIOANE_URME || '/root/lde-worker/camioane/date/urme';
const AICI = path.dirname(new URL(import.meta.url).pathname);

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const WRITE = process.argv.includes('--write');
const SAPT = arg('sapt');
if (!/^\d{4}-\d{2}-\d{2}$/.test(SAPT ?? '') || new Date(`${SAPT}T12:00:00Z`).getUTCDay() !== 1) { console.error('--sapt=AAAA-LL-ZZ (o zi de luni)'); process.exit(2); }
const ZILE = Array.from({ length: 7 }, (_, k) => adaugaZile(SAPT, k));
const D = [...ZILE, adaugaZile(SAPT, 7)].map(miezulNoptii);          // D[k] = 00:00 ora Moldovei a zilei k
const FEREASTRA = [adaugaZile(SAPT, -45), adaugaZile(SAPT, 8)];       // cursele începute înainte + casa din 45 de zile

const SK = JSON.parse(fs.readFileSync(`${V}/date/verificare-schelet.json`, 'utf8'));
configureaza({ lista: SK.puncte, vami: SK.vami, versiunePuncte: SK.versiune });
const PUB = JSON.parse(fs.readFileSync(path.join(AICI, 'date', 'schelet-camioane.json'), 'utf8'));
const R = SK.repere;
const ARE_MARFA = new Set(['Giurgiulești', 'Albița']);
const r1 = (x) => Math.round(x * 10) / 10, r5 = (x) => Math.round(x * 1e5) / 1e5;

// ── numele locurilor: punctul de dispecerat; altfel localitatea OSM cea mai apropiată (MD + RO + UA + BG, date/loc-4tari.json
// din loc-compact.mjs), pe o grilă de 0,1° ──
const GRILA = new Map();
for (const [n, lat, lon] of JSON.parse(fs.readFileSync(path.join(AICI, 'date', 'loc-4tari.json'), 'utf8'))) {
  const k = `${Math.floor(lat * 10)},${Math.floor(lon * 10)}`; if (!GRILA.has(k)) GRILA.set(k, []); GRILA.get(k).push({ n, lat, lon });
}
const TARA = new Map();
const taraDe = (p) => { const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`; if (!TARA.has(k)) TARA.set(k, taraDinPozitie(p.lat, p.lon)); return TARA.get(k); };
const ZEL = SK.puncte.find((p) => p.name.startsWith('ZEL Ungheni'));
function numeLoc(p) {
  const pu = punctLa(SK.puncte, p); if (pu) return scurt(pu.name);
  const bun = odihnaBuna(p); if (bun && hav(p, bun) <= 3) return bun.n;
  let b = null, d = Infinity;
  for (let raza = 1; raza <= 6 && !b; raza += 2) {       // inele de 0,1° până se găsește o localitate (≈ 0,5 … 0,6° = 60 km)
    const la = Math.floor(p.lat * 10), lo = Math.floor(p.lon * 10);
    for (let i = la - raza; i <= la + raza; i++) for (let j = lo - raza; j <= lo + raza; j++) for (const s of GRILA.get(`${i},${j}`) ?? []) { const x = hav(p, s); if (x < d) { d = x; b = s; } }
  }
  if (!b) return `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
  return d <= 2 ? b.n : `${b.n} (${Math.round(d)} km)`;
}

// ── urmele unei plăci din fereastră (fișier pe zi UTC) ──
function urme(placa) {
  const dir = path.join(URME, placa); if (!fs.existsSync(dir)) return null;
  const pts = []; let ultimT = -Infinity;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz')).sort()) {
    const z = f.slice(0, 10); if (z < FEREASTRA[0] || z > FEREASTRA[1]) continue;
    for (const [t, lat, lon, sp] of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8'))) {
      if (t <= ultimT) continue; ultimT = t; pts.push({ t: new Date(t * 1000), lat, lon, sp });
    }
  }
  return pts;
}

// ── vămile trecute pe un interval (copie din verifica-zi.mjs, ION-144: țara pe punctele acceptate, șederile < 5 km contopite) ──
function vamiPe(pts, calc, i0, i1) {
  const siruri = [];
  for (let i = i0; i <= i1; i++) {
    if (!calc.stepAccepted[i]) continue;
    const t = taraDe(pts[i]); if (!t) continue;
    const u = siruri[siruri.length - 1];
    if (u && u.tara === t) { u.km += hav(pts[u.iLast], pts[i]); u.iLast = i; } else siruri.push({ tara: t, iFirst: i, iLast: i, km: 0 });
  }
  for (let k = 1; k < siruri.length - 1; k++) {
    if (siruri[k].km < 5 && siruri[k - 1].tara === siruri[k + 1].tara) { siruri[k - 1].iLast = siruri[k + 1].iLast; siruri[k - 1].km += siruri[k].km + siruri[k + 1].km; siruri.splice(k, 2); k--; }
  }
  const out = [];
  for (let k = 1; k < siruri.length; k++) {
    const a = pts[siruri[k - 1].iLast], b = pts[siruri[k].iFirst];
    const m = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    let best = null, d = Infinity; for (const v of SK.treceri) { const x = hav(v, m); if (x < d) { d = x; best = v; } }
    const pereche = [siruri[k - 1].tara, siruri[k].tara].sort().join('–');
    out.push({ nume: best && d <= 15 ? best.nume : `necunoscută (${pereche})`, mdRo: pereche === 'Moldova–România', i: siruri[k].iFirst });
  }
  return out;
}
const kmPe = (calc, i0, i1) => { let k = 0; for (let i = i0 + 1; i <= i1; i++) k += calc.stepKm[i] || 0; return k; };
const trece = (pts, calc, i0, i1, p, r) => { for (let i = i0; i <= i1; i++) if (calc.stepAccepted[i] && hav(pts[i], p) <= r) return i; return -1; };
const linieGol = (spre, deLa, vama) => (SK.motorina.find((m) => m.origine === spre && m.destinatie === deLa)?.linii?.[vama]) ?? SK.motorina.find((m) => m.origine === spre && m.linii?.[vama])?.linii[vama] ?? null;

// ── REST ──
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc (--env-file)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (q) => { const r = await fetch(`${SB}/rest/v1/${q}`, { headers: H }); if (!r.ok) throw new Error(`GET ${q.split('?')[0]} ${r.status} ${await r.text()}`); return r.json(); };
const norm = (s) => String(s ?? '').replace(/\s/g, '').toUpperCase();
const [veh, prof] = await Promise.all([get('vehicles?select=id,plate_number&limit=1000'), get('lde_truck_profile?select=vehicle_id,fleet_type&limit=1000')]);
const TIP = new Map(prof.map((p) => [norm(veh.find((v) => v.id === p.vehicle_id)?.plate_number), p.fleet_type]));
const VERIF = await get(`lde_truck_route_checks?select=cheie,zi,placa,tip,de,pana,inceput,sfarsit,vama,vama_ideala,km_gps,km_ideal,km_plus,lei_plus,ok,abateri&inceput=lt.${new Date(D[7]).toISOString()}&sfarsit=gte.${new Date(D[0] - 45 * 86400000).toISOString()}&order=inceput&limit=1000`);

const TOATE = [...new Set([
  ...fs.readdirSync(URME).filter((d) => !d.startsWith('_') && fs.statSync(path.join(URME, d)).isDirectory()),
  ...[...TIP.entries()].filter(([, t]) => t === 'cisterna').map(([p]) => p),
])].sort();
const PLACI = arg('placi')?.split(',') ?? TOATE;

const randuri = [], control = [], probe = { zile: 0, difKm: [], faraLinie: new Set(), abateriParcare: [] };
for (const placa of PLACI) {
  const tip = TIP.get(placa) ?? null;
  const pts = urme(placa);
  if (!pts || pts.length < 10) {
    if (tip !== 'zernovoz') control.push({ m: placa, pe: false, motiv: pts ? 'fără urmă Wialon în ultimele 45 de zile (unitate oprită / error 7)' : 'fără urmă Wialon (unitatea nu e trasă de trage.mjs)', tip });
    else control.push({ m: placa, pe: false, motiv: 'cereale (lde_truck_profile = zernovoz) — fără schelet, nu intră (Ion, 30.09)', tip });
    continue;
  }
  const calc = calculeaza(pts);
  const r = segmenteazaPlaca(placa, pts);
  // cisternă = lde_truck_profile 'cisterna' SAU măcar o încărcare de motorină / biodiesel în 45 de zile (RWN169 e «zernovoz» dar cară motorină)
  if (!r.curse.length && tip !== 'cisterna') {
    control.push({ m: placa, pe: false, motiv: tip === 'zernovoz' ? 'cereale (zernovoz, nicio încărcare de motorină/biodiesel) — nu intră (Ion, 30.09)'
      : 'fără nicio încărcare de motorină/biodiesel în 45 de zile — nu e cisternă (cereale)', tip });
    continue;
  }
  const ultima = pts.at(-1);
  let kmSapt = 0; for (let i = 1; i < pts.length; i++) if (pts[i].t >= D[0] && pts[i].t < D[7]) kmSapt += calc.stepKm[i] || 0;
  const idx = (t) => { const x = new Date(t).getTime(); let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t.getTime() < x) lo = m + 1; else hi = m; } return lo; };
  const opriri = grupeazaOpriri(pts, calc).map((s) => ({ ...s, punct: s.incert ? null : punctLa(SK.puncte, s), tara: taraDe(s), zel: hav(s, ZEL) <= 1.5 }));
  // așteptarea actelor la ZEL Ungheni cade la 0,6 km de punct (raza 300 m; se corectează în ION-152): nu e casa șoferului
  const casa = casaDin(opriri.filter((s) => !s.zel));

  // ── drumurile (legs): plin de la încărcare la prima descărcare (și între stații), gol de la ultima descărcare la încărcarea următoare ──
  const legs = [];
  const cheieVerif = (t, x) => `${placa}|${t}|${new Date(x).toISOString()}`;
  for (const [ci, c] of r.curse.entries()) {
    const i0 = c.iStart;
    if (c.marfa === 'biodiesel') {
      const nxt = r.curse[ci + 1];
      const i1 = c.iEnd ?? (nxt ? idx(nxt.incarcare.sosire) : pts.length - 1);
      const km = kmPe(calc, i0, i1);
      const cap = c.capatProvizoriu ?? (c.descarcari.at(-1) && c.iEnd != null ? { lat: pts[c.iEnd].lat, lon: pts[c.iEnd].lon } : null);
      const zel = !!c.treceZelUngheni;
      const zona = cap ? (R.destBio.find((z) => cap.lat >= z.box[0] && cap.lat <= z.box[2] && cap.lon >= z.box[1] && cap.lon <= z.box[3])?.zona
        ?? (hav(cap, SK.puncte.find((p) => p.name.startsWith('Bază Briceni'))) <= 5 ? 'Briceni' : hav(cap, R.chisinau) <= 20 ? 'Chișinău' : null)) : null;
      const cod = { Constanța: zel ? 'B7' : 'B1', Sofia: zel ? 'B3' : 'B2', Ruse: zel ? 'B8' : 'B4', Briceni: 'B5', 'Chișinău': 'B6' }[zona] ?? null;
      const b = SK.biodiesel.find((x) => x.cod === cod);
      const term = R.terminale.find((t) => opriri.some((s) => !s.incert && s.i0 >= i0 && s.i1 <= i1 && s.min >= 30 && hav(s, t) <= t.r))?.n ?? null;
      const ideal = b ? (zel ? (term === 'Vinița' && b.kmVinita ? b.kmVinita : b.km) : b.km + (term === 'Zviahel' ? 246 : 0)) : null;
      legs.push({ tip: 'plin', marfa: 'biodiesel', i0, i1, de: 'Berdichev', pana: zona ? `${zona}${zel ? ' (prin ZEL)' : ''}` : 'capăt necunoscut', km, ideal,
        linie: b?.linie ?? null, lin: cod ? cheieBiodiesel(PUB, cod) : null, vama: vamiPe(pts, calc, i0, i1).map((t) => t.nume).join(' → ') || null,
        provizoriu: !!c.capatProvizoriu || c.iEnd == null, cheie: cheieVerif('biodiesel', c.incarcare.plecare), t0: pts[i0].t, t1: pts[i1].t, nota: term ? `terminal ${term}` : null });
      continue;
    }
    if (c.descarcari.length) {
      const d0 = c.descarcari[0]; const i1 = idx(d0.sosire);
      const km = kmPe(calc, i0, i1);
      const md = vamiPe(pts, calc, i0, i1).filter((t) => t.mdRo);
      const folosita = md.length === 1 && ARE_MARFA.has(md[0].nume) ? md[0].nume : null;
      const reg = SK.motorina.find((m) => m.origine === c.incarcare.nume && m.destinatie === d0.nume);
      legs.push({ tip: 'plin', marfa: 'motorină', i0, i1, de: scurt(c.incarcare.nume), pana: scurt(d0.nume), km, ideal: reg?.idealKm ?? null,
        linie: reg?.linii?.[folosita ?? reg?.idealVama] ?? null, lin: cheieMotorina(PUB, scurt(c.incarcare.nume), scurt(d0.nume), folosita ?? reg?.idealVama),
        vama: md.map((t) => t.nume).join(' → ') || null, cheie: cheieVerif('incarcata', c.incarcare.plecare), t0: pts[i0].t, t1: pts[i1].t, nota: null });
      for (let k = 1; k < c.descarcari.length; k++) {
        const a = idx(c.descarcari[k - 1].plecare), b = idx(c.descarcari[k].sosire);
        legs.push({ tip: 'plin', marfa: 'motorină', i0: a, i1: b, de: scurt(c.descarcari[k - 1].nume), pana: scurt(c.descarcari[k].nume), km: kmPe(calc, a, b), ideal: null,
          linie: null, lin: null, vama: null, cheie: null, t0: pts[a].t, t1: pts[b].t, nota: 'între stații (livrare)' });
      }
    } else {
      const nxt = r.curse[ci + 1];
      const i1 = c.iEnd ?? (nxt ? idx(nxt.incarcare.sosire) : pts.length - 1);
      legs.push({ tip: 'plin', marfa: 'motorină', i0, i1, de: scurt(c.incarcare.nume), pana: 'capăt necunoscut', km: kmPe(calc, i0, i1), ideal: null, linie: null, lin: null,
        vama: null, cheie: null, provizoriu: true, t0: pts[i0].t, t1: pts[i1].t, nota: 'descărcarea nu e recunoscută (capăt provizoriu)' });
    }
  }
  for (const g of r.goluri) {
    const i0 = g.iStart, i1 = g.iEnd; const km = kmPe(calc, i0, i1);
    const ant = r.curse.find((c) => c.id === g.dupa); const deLa = ant?.descarcari.at(-1)?.nume ?? null;
    const md = vamiPe(pts, calc, i0, i1).filter((t) => t.mdRo);
    const mat = deLa ? SK.goale[deLa]?.[g.spre] : null;
    let ideal = null, vamaIdeala = null;
    if (mat) [vamaIdeala, ideal] = Object.entries(mat).sort((a, b) => a[1] - b[1])[0];
    const zileGol = (new Date(g.pana) - new Date(g.de)) / 86400000;
    const nejudecabil = zileGol > 5 && km > (ideal ? 2 * ideal : 2000);
    // opririle justificate (ca ION-144): parcare ≥ 8 h în afara vămii, livrări locale la puncte ≥ 15 min → idealul e altul, km nu se judecă
    const justificate = opriri.filter((s) => s.i0 > i0 && s.i1 < i1 && ((s.min >= 480 && !(s.punct && /^(vama|tranzit)/.test(s.punct.kind))) || (s.punct && !/^(vama|tranzit)/.test(s.punct.kind) && s.min >= 15))).length;
    const folosita = md.length === 1 && mat?.[md[0].nume] != null ? md[0].nume : null;
    legs.push({ tip: 'gol', marfa: null, i0, i1, de: scurt(deLa) || (ant?.capatProvizoriu ? 'capăt provizoriu' : null), pana: scurt(g.spre), km, ideal,
      linie: mat ? linieGol(g.spre, deLa, folosita ?? vamaIdeala) : null, lin: mat ? cheieMotorina(PUB, scurt(g.spre), scurt(deLa), folosita ?? vamaIdeala) : null,
      vama: md.map((t) => t.nume).join(' → ') || null, cheie: cheieVerif('goala', g.de), t0: pts[i0].t, t1: pts[i1].t,
      nota: nejudecabil ? `nejudecabil: ${Math.round(zileGol)} zile, cuprinde alte curse (ION-144)` : justificate ? 'cu opriri (livrări sau parcare) — km nu se judecă' : !mat ? 'drumul n-are ideal în schelet' : null,
      judecat: !!mat && !nejudecabil && !justificate });
  }
  legs.sort((a, b) => a.i0 - b.i0);
  for (const l of legs) if (l.lin == null && l.ideal != null) probe.faraLinie.add(`${l.de} → ${l.pana}`);
  const legLa = new Int32Array(pts.length).fill(-1);
  legs.forEach((l, k) => { for (let i = l.i0 + 1; i <= l.i1; i++) legLa[i] = k; });

  // ── staționările: la punct ≥ 15 min, în afara punctelor ≥ 60 min (și golurile de semnal ≥ 60 min) ──
  const stays = opriri.filter((s) => (s.punct && s.min >= 15) || (!s.punct && s.min >= 60)).map((s, k) => {
    const leg = legs[legLa[s.i0]] ?? legs[legLa[Math.min(s.i1, pts.length - 1)]] ?? null;
    if (s.punct) return { ...s, k, tip: 'punct', nume: scurt(s.punct.name), kind: s.punct.kind, leg };
    const bun = odihnaBuna(s);
    // golul nejudecabil (> 5 zile, > 2 × idealul: cuprinde alte curse) n-are drum ideal față de care să judeci locul
    const dLinie = leg?.linie && leg.judecat !== false || leg?.linie && leg.nota?.startsWith('cu opriri') ? distLaLinie(s, leg.linie) : null;
    // terminalul Vinița / Zviahel îl impune încărcătura (Ion, 29.09, ION-144): așteptarea acolo nu e abatere (Zarvanți = la 2 km de Vinița)
    const term = s.incert ? null : R.terminale.find((t) => hav(s, t) <= t.r + 1);
    const j = term ? { fel: 'terminal', nota: `la terminalul ${term.n} (îl impune încărcătura)` }
      : s.zel && !s.incert ? { fel: 'zel', nota: 'așteaptă la ZEL Ungheni (acte; punctul se corectează în ION-152)' }
      : judecaStationare({ min: s.min, incert: s.incert, dCasa: casa ? hav(s, casa) : null, dLinie, dBun: bun ? hav(s, bun) : null });
    let propus = null;
    if (j.fel === 'abatere' && leg?.linie) {
      // informativ: cel mai apropiat loc bun de odihnă (lista lui Ion) sau bază / vamă aflat pe linia ideală a drumului
      const cand = [...ODIHNA_BUNA, ...SK.puncte.filter((p) => /^(baza|vama)$/.test(p.kind)).map((p) => ({ n: scurt(p.name), lat: p.lat, lon: p.lon }))]
        .filter((q) => distLaLinie(q, leg.linie) <= R_LINIE_KM).sort((a, b) => hav(s, a) - hav(s, b))[0];
      if (cand) propus = { n: cand.n, c: [r5(cand.lat), r5(cand.lon)] };
      if (s.plecare > D[0] && s.sosire < D[7]) probe.abateriParcare.push(`${placa} ${ziLocala(s.sosire)} ${numeLoc(s)} ${Math.round(s.min / 60)} h, ${Math.round(dLinie)} km de linie${propus ? ` → ${propus.n}` : ''}`);
    }
    return { ...s, k, tip: 'parcare', nume: term ? `terminal ${term.n}` : numeLoc(s), fel: j.fel, nota: j.nota + (propus ? `; propus (informativ): odihna la ${propus.n}, pe drumul ideal` : ''), propus, dLinie, leg };
  });
  // încărcarea și descărcarea întregi (seg-core le unește; opririle lor sunt tăiate de manevrele din port): O staționare pe fiecare,
  // de la sosire la plecare, peste bucățile ei — altfel ziua s-ar rupe în «la punct / gol 0,2 km / la punct»
  const PUNCT_ID = new Map(SK.puncte.map((p) => [p.id, p]));
  for (const c of r.curse) {
    for (const [x, nota] of [[c.incarcare, c.marfa === 'biodiesel' ? 'încarcă biodiesel' : 'încarcă motorină'], ...c.descarcari.map((d) => [d, 'descarcă'])]) {
      const p = PUNCT_ID.get(x.id); if (!p) continue;
      const i0 = idx(x.sosire), i1 = Math.min(idx(x.plecare), pts.length - 1);
      stays.push({ i0, i1, lat: p.lat, lon: p.lon, sosire: new Date(x.sosire), plecare: new Date(x.plecare), min: (new Date(x.plecare) - new Date(x.sosire)) / 60000,
        incert: false, punct: p, k: stays.length, tip: 'punct', nume: scurt(p.name), kind: p.kind, notaPunct: nota, leg: null });
    }
  }
  const staLa = new Int32Array(pts.length).fill(-1);
  for (const s of stays) for (let i = s.i0; i <= s.i1; i++) staLa[i] = s.k;   // întregul (încărcare / descărcare) se scrie ultimul și acoperă bucățile
  const stayK = new Map(stays.map((s) => [s.k, s]));

  // locurile P1/P2 ale săptămânii (informativ): parcările ≥ 8 h care ating săptămâna, cu orele din săptămână
  const parcSapt = stays.filter((s) => s.tip === 'parcare' && s.plecare > D[0] && s.sosire < D[7])
    .map((s) => ({ lat: s.lat, lon: s.lon, incert: s.incert, fel: s.fel, nota: s.nota, min: s.min, minSapt: (Math.min(+s.plecare, D[7]) - Math.max(+s.sosire, D[0])) / 60000 }));
  const locuri = locuriSaptamana(parcSapt.map((x) => ({ ...x, minTot: x.min, min: x.minSapt })), (g) => { const t = R.terminale.find((q) => hav(g, q) <= q.r + 1); return t ? `terminal ${t.n}` : numeLoc(g); });

  const zileScrise = [];
  for (let k = 0; k < 7; k++) {
    const z = ZILE[k], A = D[k], B = D[k + 1];
    const iA = idx(A); const pasi = [];
    for (let i = iA; i < pts.length && pts[i].t.getTime() < B; i++) {
      if (pts[i].t.getTime() < A) continue;
      pasi.push({ i, t: pts[i].t.getTime(), km: calc.stepKm[i] || 0, sta: staLa[i] >= 0 ? staLa[i] : null, drum: legLa[i] >= 0 ? legLa[i] : null });
    }
    // ziua fără niciun punct: rând doar dacă o staționare o acoperă întreagă (mașina stă, trackerul tace)
    const acopera = stays.find((s) => +s.sosire <= A && +s.plecare >= B);
    if (!pasi.length && !acopera) continue;
    const bucati = pasi.length ? taieZiua(pasi) : [{ cheie: `s${acopera.k}`, sta: acopera.k, drum: null, i0: acopera.i0, i1: acopera.i1, t0: A, t1: B, km: 0, idx: [] }];
    const iv = bucati.map((b, j) => {
      const st = b.sta != null ? stayK.get(b.sta) : null;
      const t0 = st ? Math.max(+st.sosire, A) : (j > 0 ? bucati[j - 1].t1 : (b.i0 > 0 && +pts[b.i0 - 1].t >= A - 6 * 3600000 ? Math.max(+pts[b.i0 - 1].t, A) : b.t0));
      const t1 = st ? Math.min(+st.plecare, B) : b.t1;
      // urma: punctul de dinainte (legătura cu intervalul anterior) + punctele intervalului, simplificate la 25 m
      const ii = b.i0 > 0 && j > 0 ? [b.i0 - 1, ...b.idx] : b.idx;
      const Q = ii.filter((i) => calc.stepAccepted[i]).map((i) => ({ lat: pts[i].lat, lon: pts[i].lon, t: +pts[i].t }));
      const S = st ? (Q.length ? [{ lat: st.lat, lon: st.lon, t: Q[0].t }] : [{ lat: st.lat, lon: st.lon, t: t0 }]) : dp(Q, 25);
      const leg = b.drum != null ? legs[b.drum] : null;
      const tipIv = st ? st.tip : (leg?.tip ?? 'gol');
      const ora = `${oraLoc(t0)}–${t1 >= B ? '24:00' : oraLoc(t1)}`;
      const de = st ? st.nume : numeLoc(pts[ii[0]] ?? pts[b.i0]), pana = st ? st.nume : numeLoc(pts[b.i1]);
      const nota = st ? (st.tip === 'punct' && st.notaPunct ? st.notaPunct : st.tip === 'punct'
        ? ({ incarcare_diesel: 'încarcă motorină', incarcare_biodiesel: 'încarcă biodiesel', descarcare_diesel: 'descarcă', descarcare_biodiesel: 'descarcă biodiesel', baza: 'la bază / stație', vama: 'vama', tranzit_acte: 'acte / tranzit' }[st.kind] ?? st.kind)
        : st.nota) : leg ? `${leg.tip === 'plin' ? `cu ${leg.marfa ?? 'marfă'}` : 'gol'} ${leg.de ?? '?'} → ${leg.pana ?? '?'}${leg.nota ? ` (${leg.nota})` : ''}` : 'gol, fără cursă';
      return {
        ora, t0: Math.round((t0 - A) / 1000), t1: Math.round((t1 - A) / 1000), tip: tipIv, cats: { [tipIv]: r1(b.km) }, km: r1(b.km), de, pana,
        ocol: false, lin: leg?.lin ?? st?.leg?.lin ?? null, prelungit: null,
        s: S.map((p) => [r5(p.lat), r5(p.lon), Math.round((p.t - A) / 1000)]),
        nota, fel: st?.fel ?? null, abatere: st?.fel === 'abatere', propus: st?.propus ?? null, durataMin: st ? Math.round(st.min) : null,
      };
    });
    // livrarea locală de la bază: în golul pe care seg-core nu-l poate tăia (încărcarea la bază nu e «încărcare»), drumul de la o bază /
    // stație la o descărcare TLX e cu marfă — se arată «plin», cu nota că e dedus din opriri, nu din cursă
    for (let j = 0; j < iv.length; j++) {
      const v = iv[j], leg = bucati[j].drum != null ? legs[bucati[j].drum] : null;
      if (v.tip !== 'gol' || !leg || leg.judecat !== false) continue;
      const ant = [...bucati.slice(0, j)].reverse().find((b) => b.sta != null), urm = bucati.slice(j + 1).find((b) => b.sta != null);
      const sa = ant ? stayK.get(ant.sta) : null, su = urm ? stayK.get(urm.sta) : null;
      if (sa?.kind === 'baza' && su?.kind === 'descarcare_diesel') {
        v.tip = 'plin'; v.cats = { plin: v.km }; v.nota = `livrare de la bază ${sa.nume} → ${su.nume} (dedusă din opriri; seg-core n-o vede ca cursă)`;
      }
    }
    // controlul: Σ intervale = km-ul zilei (pașii acceptați); față de urma brută (haversine punct cu punct) abaterea > 3 % se raportează
    const kmZi = r1(pasi.reduce((a, p) => a + p.km, 0));
    let brut = 0; for (let j = 1; j < pasi.length; j++) brut += hav(pts[pasi[j - 1].i], pts[pasi[j].i]);
    const sumIv = r1(iv.reduce((a, v) => a + v.km, 0));
    if (Math.abs(sumIv - kmZi) > 0.5) throw new Error(`${placa} ${z}: Σ intervale ${sumIv} ≠ km zi ${kmZi}`);
    if (kmZi > 20 && Math.abs(brut - kmZi) > kmZi * 0.03) probe.difKm.push(`${placa} ${z} GPS ${r1(kmZi)} / brut ${r1(brut)}`);

    const plin = r1(iv.filter((v) => v.tip === 'plin').reduce((a, v) => a + v.km, 0));
    const verif = VERIF.filter((x) => x.placa === placa && (x.zi === z || (Date.parse(x.inceput) < B && Date.parse(x.sfarsit) >= A)));
    const verifZi = verif.filter((x) => x.zi === z && !x.ok);
    const drumuri = legs.filter((l) => +l.t0 < B && +l.t1 >= A).map((l) => {
      const ch = l.cheie ? VERIF.find((x) => x.cheie === l.cheie) : null;
      return { tip: l.tip, marfa: l.marfa, de: l.de, pana: l.pana, inceput: new Date(l.t0).toISOString(), sfarsit: new Date(l.t1).toISOString(), km: r1(l.km),
        ideal: l.ideal, plus: l.ideal != null && l.judecat !== false ? r1(l.km - l.ideal) : null, vama: l.vama, lin: l.lin, nota: l.nota ?? null,
        verif: ch ? { zi: ch.zi, ok: ch.ok, kmPlus: Number(ch.km_plus) } : null };
    });
    const noapte = (t) => { const s = stays.find((q) => +q.sosire <= t && +q.plecare >= t); return s ? { c: [r5(s.lat), r5(s.lon)], n: s.nume, min: Math.round(s.min) } : null; };
    const linii = [...new Set([...drumuri.map((d) => d.lin), ...iv.map((v) => v.lin)].filter(Boolean))];
    const stai = opriri.filter((s) => s.min >= 5 && +s.plecare > A && +s.sosire < B && !s.incert)
      .map((s) => [r5(s.lat), r5(s.lon), Math.round((Math.max(+s.sosire, A) - A) / 1000), Math.round((Math.min(+s.plecare, B) - A) / 1000), s.punct ? scurt(s.punct.name) : numeLoc(s)]);
    randuri.push({
      uzina: 'CAMIOANE', saptamina: SAPT, m: placa, z,
      sumar: { dow: new Date(`${z}T12:00:00Z`).getUTCDay(), total: kmZi, cuOameni: plin, plin, gol: r1(kmZi - plin), economie: null, ideal: null, linii,
        motivAfara: null, economieSapt: null, locuri: locuri.map((l) => l.n),
        kmPlus: r1(verifZi.reduce((a, x) => a + Number(x.km_plus || 0), 0)), nrAbateri: verifZi.length,
        opririAbatere: iv.filter((v) => v.abatere).length },
      date: {
        t00: A, casa: casa ? { c: [r5(casa.lat), r5(casa.lon)], n: numeLoc(casa) } : null, noapteA: noapte(A), noapteB: noapte(B - 1000), linii, iv, stai,
        zi: null, ideal: null,
        parcare: { locuri, economieSapt: 0, idealSapt: null, zi: null, legi: [], informativ: true },
        drumuri,
        verif: verif.map((x) => ({ cheie: x.cheie, zi: x.zi, tip: x.tip, de: x.de, pana: x.pana, inceput: x.inceput, sfarsit: x.sfarsit, vama: x.vama, vama_ideala: x.vama_ideala,
          km_gps: Number(x.km_gps), km_ideal: x.km_ideal == null ? null : Number(x.km_ideal), km_plus: Number(x.km_plus || 0), ok: x.ok, abateri: x.abateri })),
      },
    });
    zileScrise.push(z); probe.zile++;
  }
  if (!zileScrise.length) {
    const u = [...pts].reverse().find((p) => +p.t < D[7]) ?? ultima;
    control.push({ m: placa, pe: false, motiv: `nicio urmă în săptămână (tracker tăcut); ultima poziție ${ziLocala(u.t)} la ${numeLoc(u)}${r.curse.length ? '' : ', nicio încărcare în 45 de zile'}`, tip });
    continue;
  }
  if (kmSapt < 5) {
    // stă toată săptămâna: rândurile rămân (arată unde stă), dar controlul spune de ce n-are drumuri
    const s = stays.find((q) => +q.plecare > D[0] && +q.sosire < D[7]);
    control.push({ m: placa, pe: true, motiv: `stă toată săptămâna${s ? ` la ${s.nume}` : ''} (${r1(kmSapt)} km)`, tip, km: r1(kmSapt), zile: zileScrise.length });
  } else control.push({ m: placa, pe: true, motiv: null, tip, km: Math.round(kmSapt), zile: zileScrise.length, casa: casa ? numeLoc(casa) : null, locuri: locuri.map((l) => `P${l.nr} ${l.n} (${l.fel}, ${l.ore} h)`) });
}

const kb = Math.round(JSON.stringify(randuri).length / 1024);
console.log(`harta CAMIOANE ${SAPT}: ${randuri.length} rânduri · ${kb} KB · mașini pe hartă ${control.filter((c) => c.pe).length} · afară ${control.filter((c) => !c.pe).length}`);
for (const c of control) console.log(`  ${c.pe ? '✓' : '·'} ${c.m.padEnd(7)} ${c.tip ?? '—'} ${c.km != null ? `${c.km} km, ${c.zile} zile` : ''} ${c.motiv ?? ''} ${c.casa ? `acasă: ${c.casa}` : ''} ${c.locuri?.join('; ') ?? ''}`);
if (probe.abateriParcare.length) console.log('  odihnă departe de drumul ideal:', probe.abateriParcare.join(' | '));
if (probe.faraLinie.size) console.log('  drumuri cu ideal dar fără linie în schelet-camioane.json:', [...probe.faraLinie].join(', '));
if (probe.difKm.length) console.log('  km GPS ≠ urma brută (> 3 %):', probe.difKm.join(', '));
const mare = randuri.filter((x) => JSON.stringify(x).length > 400 * 1024).map((x) => `${x.m} ${x.z}`);
if (mare.length) { console.error(`rânduri peste 400 KB: ${mare.join(', ')} — harta NU se scrie`); process.exit(3); }
if (!WRITE) process.exit(0);
if (arg('placi')) { console.error('--write cere toată flota (fără --placi): rescrierea săptămânii șterge rândurile celorlalte mașini'); process.exit(2); }

const HJ = { ...H, 'Content-Type': 'application/json' };
// rerularea săptămânii înlocuiește tot: întâi se șterg rândurile ei (o mașină care a dispărut nu rămâne cu harta veche)
const del = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.CAMIOANE&saptamina=eq.${SAPT}`, { method: 'DELETE', headers: HJ });
if (!del.ok) { console.error('DELETE', del.status, await del.text()); process.exit(1); }
for (let i = 0; i < randuri.length; i += 20) {
  const x = await fetch(`${SB}/rest/v1/lde_harta_zi`, { method: 'POST', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify(randuri.slice(i, i + 20)) });
  if (!x.ok) { console.error('POST', x.status, await x.text()); process.exit(1); }
}
const rap = { tip: 'harta_camioane', saptamina: SAPT, pana_la: ZILE[6], rulat: new Date().toISOString(), control,
  regula: 'Ion, 30.09.2026: «drumul față de schelet, P1/P2 doar informativ» — fără km de tăiat; staționările ≥ 24 h rămân; Bubuieci = acasă; odihna la Galați / Ovidiu–Agigea / Giurgiu / Novi Iskăr e bună.' };
const up = await fetch(`${SB}/rest/v1/lde_analiza_reguli?on_conflict=uzina,saptamina`, { method: 'POST', headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{ uzina: 'CAMIOANE', saptamina: SAPT, rulat_la: new Date().toISOString(), date: rap }]) });
if (!up.ok) { console.error('lde_analiza_reguli', up.status, await up.text()); process.exit(1); }
console.log(`scris: ${randuri.length} rânduri în lde_harta_zi CAMIOANE ${SAPT} + controlul flotei în lde_analiza_reguli`);
