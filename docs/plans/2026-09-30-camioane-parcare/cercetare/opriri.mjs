// ION-150 cercetare (DOAR CITIRE): opririle lungi ale întregii flote Wialon, septembrie 2026, pe fazele cursei.
// Folosește lib.mjs + seg-core.mjs din /root/lde-worker/camioane/verif (import, nu copie, nu le schimbă).
// Rulare: CAMIOANE_DATE=/root/lde-worker/camioane/verif/date CAMIOANE_URME=/root/lde-worker/camioane/date/urme node opriri.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const V = '/root/lde-worker/camioane/verif';
const { URME, DATE, calculeaza, grupeazaOpriri, punctLa, hav } = await import(`${V}/lib.mjs`);
const { configureaza, segmenteazaPlaca } = await import(`${V}/seg-core.mjs`);
const { taraDinPozitie } = await import(`${V}/vendor/tara.mjs`);

const DE = '2026-08-10', PANA = '2026-09-30';          // urme încărcate (marginea pentru cursele începute în august)
const L0 = Date.parse('2026-08-31T21:00:00Z'), L1 = Date.parse('2026-09-29T21:00:00Z'); // 01.09 00:00 → 30.09 00:00 ora MD
const MIN_OPRIRE = 120;                                 // min; opririle mai scurte nu sunt «stat / dormit»
const SK = JSON.parse(fs.readFileSync(path.join(DATE, 'verificare-schelet.json'), 'utf8'));
configureaza({ lista: SK.puncte, vami: SK.vami, versiunePuncte: SK.versiune });
const TZ = 'Europe/Chisinau';
const ora = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(d));

function urme(placa) {
  const dir = path.join(URME, placa); const pts = []; let ultimT = -Infinity;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz')).sort()) {
    const z = f.slice(0, 10); if (z < DE || z > PANA) continue;
    for (const [t, lat, lon, sp] of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8'))) {
      if (t <= ultimT) continue; ultimT = t; pts.push({ t: new Date(t * 1000), lat, lon, sp });
    }
  }
  return pts;
}

const out = { rulat: new Date().toISOString(), fereastra: [ora(L0), ora(L1)], minOprire: MIN_OPRIRE, masini: [] };
const placi = fs.readdirSync(URME).filter((d) => !d.startsWith('_') && fs.statSync(path.join(URME, d)).isDirectory()).sort();
for (const placa of placi) {
  const pts = urme(placa);
  const m = { placa, puncte: pts.length, curse: [], goluri: [], opriri: [], noapte: [], kmSept: 0, zileCuDate: 0 };
  out.masini.push(m);
  if (pts.length < 10) { m.motiv = 'fără urmă'; continue; }
  const calc = calculeaza(pts);
  for (let i = 1; i < pts.length; i++) if (pts[i].t >= L0 && pts[i].t < L1) m.kmSept += calc.stepKm[i] || 0;
  m.kmSept = Math.round(m.kmSept);
  m.zileCuDate = new Set(pts.filter((p) => p.t >= L0 && p.t < L1).map((p) => ora(p.t).slice(0, 10))).size;
  const r = segmenteazaPlaca(placa, pts);
  m.curse = r.curse.map((c) => ({ id: c.id, marfa: c.marfa, capat: c.capat, inc: c.incarcare.nume, incSosire: c.incarcare.sosire, incPlecare: c.incarcare.plecare, incMin: c.incarcare.min,
    descarcari: c.descarcari.map((d) => ({ nume: d.nume, sosire: d.sosire, plecare: d.plecare, min: d.min })), iStart: c.iStart, iEnd: c.iEnd, kmBrut: c.kmBrut, capatProvizoriu: c.capatProvizoriu }));
  m.goluri = r.goluri.map((g) => ({ dupa: g.dupa, de: g.de, pana: g.pana, spre: g.spre, kmBrut: g.kmBrut, iStart: g.iStart, iEnd: g.iEnd,
    a: { lat: pts[g.iStart].lat, lon: pts[g.iStart].lon }, b: { lat: pts[g.iEnd].lat, lon: pts[g.iEnd].lon } }));
  const opriri = grupeazaOpriri(pts, calc).map((s) => ({ ...s, punct: s.incert ? null : punctLa(SK.puncte, s) }));
  // faza în care cade o oprire (după i0)
  const faza = (s) => {
    for (const c of r.curse) {
      const incI0 = pts.findIndex((p) => p.t >= new Date(c.incarcare.sosire));
      if (s.i0 >= incI0 && s.i0 <= c.iStart) return { f: 'la_incarcare', c: c.id };
      const d0 = c.descarcari[0], dN = c.descarcari.at(-1);
      if (s.i0 > c.iStart && (!d0 || s.plecare <= new Date(d0.sosire)) && (c.iEnd == null || s.i0 <= c.iEnd)) return { f: d0 ? 'plin' : (c.marfa === 'biodiesel' ? 'plin_bio' : 'plin_fara_capat'), c: c.id };
      if (d0 && s.sosire >= new Date(d0.sosire) && s.sosire <= new Date(dN.plecare)) return { f: 'la_descarcare', c: c.id };
    }
    for (const g of r.goluri) if (s.i0 >= g.iStart && s.i1 <= g.iEnd) return { f: 'gol', c: g.dupa, spre: g.spre };
    const ult = r.curse.at(-1);
    if (ult && ult.iEnd != null && s.i0 >= ult.iEnd) return { f: 'dupa_ultima', c: ult.id };
    return { f: 'fara_cursa', c: null };
  };
  for (const s of opriri) {
    if (s.min < MIN_OPRIRE) continue;
    const mij = (s.sosire.getTime() + s.plecare.getTime()) / 2;
    if (s.plecare.getTime() < L0 || s.sosire.getTime() >= L1) continue;
    const fz = faza(s);
    // minutele din fereastra lunii (oprirea poate trece peste margine)
    const minInLuna = (Math.min(s.plecare.getTime(), L1) - Math.max(s.sosire.getTime(), L0)) / 60000;
    m.opriri.push({ lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5), sosire: s.sosire.toISOString(), plecare: s.plecare.toISOString(), min: Math.round(s.min), minInLuna: Math.round(minInLuna),
      incert: s.incert, punct: s.punct?.name ?? null, kind: s.punct?.kind ?? null, tara: taraDinPozitie(s.lat, s.lon), faza: fz.f, cursa: fz.c, spre: fz.spre ?? null, i0: s.i0, i1: s.i1, mij: new Date(mij).toISOString() });
  }
  // poziția la 03:00 ora MD în fiecare zi a lunii
  for (let t = L0 + 3 * 3600000; t < L1; t += 86400000) {
    let lo = 0, hi = pts.length - 1; while (lo < hi) { const k = (lo + hi) >> 1; if (pts[k].t.getTime() < t) lo = k + 1; else hi = k; }
    const p = pts[lo]; const dt = Math.abs(p.t.getTime() - t) / 60000;
    const s = opriri.find((o) => o.sosire.getTime() <= t && o.plecare.getTime() >= t);
    m.noapte.push({ zi: ora(t).slice(0, 10), lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), dtMin: Math.round(dt), sta: !!s, staMin: s ? Math.round(s.min) : null, punct: s?.punct?.name ?? null, tara: taraDinPozitie(p.lat, p.lon), faza: s ? faza(s).f : null });
  }
  // km GPS pe fiecare gol și pe bucățile dintre opririle lungi din el
  for (const g of m.goluri) {
    const inG = m.opriri.filter((o) => o.i0 >= g.iStart && o.i1 <= g.iEnd);
    const taie = [g.iStart, ...inG.flatMap((o) => [o.i0, o.i1]), g.iEnd];
    g.bucati = []; for (let k = 0; k + 1 < taie.length; k += 2) { let km = 0; for (let i = taie[k] + 1; i <= taie[k + 1]; i++) km += calc.stepKm[i] || 0; g.bucati.push(+km.toFixed(1)); }
  }
}
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'opriri.json'), JSON.stringify(out));
for (const m of out.masini) console.log(m.placa, m.puncte, 'pct', m.zileCuDate, 'zile', m.kmSept, 'km', m.curse.length, 'curse', m.goluri.length, 'goale', m.opriri.length, 'opriri≥2h', m.motiv ?? '');
