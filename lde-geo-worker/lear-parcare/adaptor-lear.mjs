// ION-268 — adaptorul LEAR (Ungheni / Florești) pentru modulul comun schelet-intai.mjs.
// Din dump-ul lui lear-analiza.mjs (--dump: urma, rutele din listă cu capetele fixate §4.5 / ION-63, casa, poarta, ferestrele, porțile altor uzine)
// și din scheletul fix (lear-schelet.json / floresti-schelet.json: drumul cu oameni al fiecărei rute și km etalon) face contextul fiecărei mașini:
// rutele (capăt, km, coridor), rutele mașinii pe tură (+ comasatele din lista lui Ion), zilele de plan, opririle și segmentele urmei.
import { readFileSync, existsSync } from 'node:fs';
import { local, ziLucru } from '/root/lde-worker/ora-locala.mjs';
import { PARAM_SI, hav, coridor, opririle, segmente, ziua } from './schelet-intai.mjs';

const CEL = (p) => `${Math.floor(p.lat / 0.00135)}|${Math.floor(p.lon / 0.002)}`;

export function adaptorLear(D, { caleSchelet, caleLista } = {}) {
  const FL = D.uzina === 'LEAR_FLORESTI';
  const SCH = JSON.parse(readFileSync(caleSchelet ?? (FL ? '/root/lde-worker/floresti-schelet.json' : '/root/lde-worker/lear-schelet.json'), 'utf8'));
  const cl = caleLista ?? (FL ? '/root/lde-worker/floresti-rute-masini.json' : '/root/lde-worker/lear-rute-masini.json');
  const LISTA = existsSync(cl) ? JSON.parse(readFileSync(cl, 'utf8')) : {};
  const G = { lat: D.poarta.lat, lon: D.poarta.lon };
  const ferestre = D.ferestre.map((f) => ({ sens: f.sens, schimb: f.shift_number, de_la_min: f.de_la_min, pana_la_min: f.pana_la_min }));
  // rutele din schelet: coridorul = drumul cu oameni (tur + retur), capătul = începutul drumului cu oameni al turului (= primul sat, §4.2)
  const BAZA = new Map(SCH.rute.map((r) => { const t = r.g?.tur?.plin ?? [], rr = r.g?.retur?.plin ?? [];
    const c0 = t[0] ?? rr.at(-1) ?? null;
    return [r.id, { id: r.id, tura: r.tura, km: r.etalon ?? null, capat: c0 ? { n: r.capat, lat: c0[0], lon: c0[1] } : null, cor: coridor([t, rr].filter((x) => x.length)), linii: { tur: t, retur: rr }, sate: r.sate ?? [] }]; }));

  // localitățile (OSM) — doar pentru numele urcărilor
  const GR = new Map(), gk = (la, lo) => `${Math.floor(la / 0.02)}|${Math.floor(lo / 0.02)}`;
  for (const l of readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) {
    if (!l.includes('"place"')) continue; let g; try { g = JSON.parse(l.replace(/^\x1e/, '')); } catch { continue; }
    if (!/^(village|town|city|hamlet|suburb)$/.test(g.properties?.place ?? '')) continue;
    const [lon, lat] = g.geometry.coordinates; if (!(lat > 45.3 && lat < 48.7 && lon > 26.4 && lon < 30.3)) continue;
    const k = gk(lat, lon); (GR.get(k) ?? GR.set(k, []).get(k)).push({ n: g.properties.name, lat, lon }); }
  const numeSat = (p) => { const a = Math.floor(p.lat / 0.02), b = Math.floor(p.lon / 0.02); let best = null, bd = 2;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of GR.get(`${a + i}|${b + j}`) ?? []) { const d = hav(p, s); if (d < bd) { bd = d; best = s.n; } } return best ?? '?'; };

  // satele din nomenclator (actul) ale fiecărei rute, pe nume curățate (§1.3; «sat», «traseu», «școală»… ca în lear-ungheni-nomenclator)
  const SUF = new Set(['sat', 'traseu', 'scoala', 'biserica', 'stadion', 'ferma', 'liceu', 'vale', 'deal', 'becu', 'vento', 'drum', 'oras', 'mrao', 'moldova', 'plopi', 'vechi-sat']);
  const norm = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*$/, '').replace(/ciolacul/g, 'ciolacu').replace(/[^a-z ]+/g, ' ')
    .split(/\s+/).filter((w) => w && !SUF.has(w)).join(' ');
  const potriveste = (osm, act) => osm === act || (act.length >= 5 && (osm.startsWith(act) || act.startsWith(osm) && osm.length >= 5)) || osm.split(' ')[0].slice(0, 6) === act.split(' ')[0].slice(0, 6) && act.split(' ').length === 1;
  // orașul uzinei nu deosebește rutele (opririle din oraș sunt trafic sau trunchiul comun): «Ungheni», «Ungheni Becu» la Ungheni, «Florești» la Florești
  const ORAS = norm(FL ? 'Florești' : 'Ungheni');
  const ACT = new Map([...BAZA].map(([id, r]) => [id, (r.sate ?? []).map(norm).filter((x) => x && x !== ORAS)]));
  // punctele fixate de mână pentru satele fără coordonate în index (lear-sate.json: Vasilica, Berești…)
  const FIX = []; try { const j = JSON.parse(readFileSync('/root/lde-worker/lear-sate.json', 'utf8')); for (const [n, v] of Object.entries(j)) if (v?.lat) FIX.push({ n, lat: v.lat, lon: v.lon }); } catch {}
  const inActC = new Map();
  const inAct = (s, id) => { const k = `${s.lat.toFixed(4)},${s.lon.toFixed(4)}|${id}`; if (inActC.has(k)) return inActC.get(k);
    const L = ACT.get(id) ?? []; let ok = false;
    const a0 = Math.floor(s.lat / 0.02), b0 = Math.floor(s.lon / 0.02);
    for (let i = -1; i <= 1 && !ok; i++) for (let j = -1; j <= 1 && !ok; j++) for (const p of GR.get(`${a0 + i}|${b0 + j}`) ?? []) if (hav(s, p) <= 1.0 && L.some((x) => potriveste(norm(p.n), x))) { ok = true; break; }
    if (!ok) for (const p of FIX) if (hav(s, p) <= 1.0 && L.some((x) => potriveste(norm(p.n), x))) { ok = true; break; }
    inActC.set(k, ok); return ok; };

  // intersecțiile (ca lear-parcare.mjs, revizia Claude r2): încetinirea scurtă în aceeași celulă la ≥ 5 mașini și în ≥ 4 ore = infrastructură
  const INFRA = new Set();
  { const cel = new Map();
    for (const M of D.masini) { const P = M.pts; let i = 0;
      while (i < P.length) { if (!(P[i][3] < PARAM_SI.V_OPRIRE_KN)) { i++; continue; } let j = i; while (j + 1 < P.length && P[j + 1][3] < PARAM_SI.V_OPRIRE_KN) j++;
        const p = { lat: P[i][1], lon: P[i][2] };
        if (P[j][0] - P[i][0] <= 90e3 && hav(p, G) > 2) { const k = CEL(p); const x = cel.get(k) ?? cel.set(k, { m: new Set(), h: new Set() }).get(k); x.m.add(M.m); x.h.add(local(P[i][0]).getUTCHours()); }
        i = j + 1; } }
    for (const [k, x] of cel) if (x.m.size >= 5 && x.h.size >= 4) INFRA.add(k); }

  // capetele fixate (§4.5 / ION-63) sunt ale RUTEI: din listele tuturor mașinilor din dump, ruta → capătul ei
  const RUTE_U = new Map([...BAZA].map(([id, r]) => [id, { ...r }]));
  for (const M of D.masini) for (const x of M.lista ?? []) if (x.capatC && RUTE_U.has(x.id)) RUTE_U.get(x.id).capat = { n: x.capat, lat: x.capatC[0], lon: x.capatC[1] };
  // comasarea (§4.7): A4 se face cu A3, A7 cu A6 (Ungheni), plus «extra» din lista lui Ion; urcările pe ruta comasată adaugă lungimea ei (O.4)
  const COM = new Map(); const leaga = (a, b) => { if (!RUTE_U.has(a) || !RUTE_U.has(b)) return; (COM.get(a) ?? COM.set(a, new Set()).get(a)).add(b); (COM.get(b) ?? COM.set(b, new Set()).get(b)).add(a); };
  if (!FL) { leaga('A4', 'A3'); leaga('A7', 'A6'); }
  for (const [m, v] of Object.entries(LISTA)) for (const e of v?.extra ?? []) for (const t of ['A', 'B']) if (v[t] && RUTE_U.get(e)?.tura === RUTE_U.get(v[t])?.tura) leaga(v[t], e);
  const comasari = (id) => [id, ...(COM.get(id) ?? [])];
  const ALTE = (D.alteUzine ?? []).map((g) => ({ lat: g.lat, lon: g.lon, r: g.r ?? 0.5, n: g.nume }));
  const zileSapt = (() => { const out = [], t = Date.parse(`${D.saptamina}T12:00:00Z`); for (let i = 0; i < 7; i++) out.push(new Date(t + i * 864e5).toISOString().slice(0, 10)); return out; })();

  /** contextul unei mașini + planul săptămânii, gata de potrivit */
  function masina(M) {
    const P = M.pts.map(([t, lat, lon, v]) => ({ t, lat, lon, v })).sort((a, b) => a.t - b.t);
    const casa = M.casaC ? { lat: M.casaC[0], lon: M.casaC[1] } : null;
    // ION-268 (Ion, 06.10: «scheletul e universal indiferent de mașină»): toate rutele uzinei, capetele fixate pe rută (§4.5 / ION-63, din listele tuturor
    // mașinilor); lista mașinii e doar indiciu la egalitate și pentru «neconfirmată»
    const rute = RUTE_U;
    const ruteMasina = { A: [], B: [] };
    for (const x of M.lista) if (rute.has(x.id)) (ruteMasina[x.tura] ??= []).push(x.id);
    const ruteLista = new Set([...ruteMasina.A, ...ruteMasina.B]);
    const opr = opririle(P, { infra: INFRA, celOf: CEL });
    const { ancore, seg } = segmente(P, [G]);
    const ctx = { P, opr, seg, ancore, porti: [G], casa, ferestre, rute, ruteLista, comasari, numeSat, inAct };
    // zilele de plan: zilele în care mașina a atins poarta (Ion: «orice mașină care a lucrat la uzină»); zilele legate de altă uzină ies (§11.5)
    const atinge = new Set(P.filter((p) => hav(p, G) <= PARAM_SI.R_POARTA).map((p) => ziLucru(p.t)));
    const laAlta = new Set();
    for (const g of ALTE) { let t = null; for (const p of P) { if (hav(p, g) <= g.r && p.v <= 1) { t ??= p.t; if (p.t - t >= 2 * 60e3) laAlta.add(ziLucru(p.t)); } else t = null; } }
    const zile = [], altaUzina = [];
    for (const z of zileSapt) { if (!atinge.has(z)) continue; if (laAlta.has(z)) { altaUzina.push(z); continue; } zile.push(z); }
    // două treceri: întâi fără «pe drumul rutei»; rutele confirmate cu urcări în săptămână + lista = rutele pe care drumul acoperit face cursa făcută
    ctx.peDrumPermis = new Set();
    const Z0 = zile.map((z) => ziua(ctx, z));
    ctx.peDrumPermis = new Set([...ruteLista, ...Z0.flatMap((d) => d.plan.filter((c) => c.statut === 'facuta' && c.urcari > 0).map((c) => c.ruta))]);
    const Z = zile.map((z) => ({ ...ziua(ctx, z), faraPoarta: false }));
    // rotația săptămânii, doar informativ: tura (A / B) a rutelor făcute pe fiecare schimb, cea mai des
    const rotatie = {}; for (const sc of [1, 2]) { const n = { A: 0, B: 0 }; for (const d of Z) for (const c of d.plan) if (c.schimb === sc && c.statut === 'facuta' && c.tura) n[c.tura]++; if (n.A || n.B) rotatie[sc] = n.A >= n.B ? 'A' : 'B'; }
    return { ctx, P, casa, ruteMasina, rotatie, zile: Z, altaUzina };
  }
  return { G, ferestre, rute: BAZA, ruteU: RUTE_U, masina, numeSat, inAct, norm };
}
