// proba.mjs — probele verificatorului (ION-95).
//   node proba.mjs <verdict> <blocant|explicat> <id> [ruta] [linie]   → 0 dacă verdictul are constatarea cu id-ul dat în lista cerută
//   node proba.mjs c4                                                  → proba sintetică Codex r2 C1 (dispozitivele alternează lunga/scurta)
import { readFileSync } from 'node:fs';
import { creeazaEtalon } from './etalon-gps.mjs';
import { variante, efectLinie, diferente, okey } from './c4.mjs';

if (process.argv[2] !== 'c4') {
  const [f, lista, idc, ruta, linie] = process.argv.slice(2); const V = JSON.parse(readFileSync(f, 'utf8'));
  const L = lista === 'blocant' ? V.blocante : V.explicate;
  const ok = L.some(c => c.id === idc && (!ruta || c.ruta === ruta) && (!linie || c.linie === linie));
  console.log(`${idc}${ruta ? ' ' + ruta + ' ' + linie : ''} în ${lista}: ${ok}`); process.exit(ok ? 0 : 1);
}

// ── proba sintetică C4: o mașină, două dispozitive (A, B), 4 zile; sosirile turului 06:00 (A) / 06:40 (B) ora Chișinăului;
// dispozitivul cu km mai mari ALTERNEAZĂ (A în zilele pare, B în cele impare). Variantele pe lungime păstrează mediana 06:20 (fals «efect nul»);
// variantele pe dispozitiv dau 06:40 / 06:00 (≥ 15 min) → C4 blochează. Fără `dev` → NEDETERMINAT (blocant).
const P = { SEPT: '2026-09-01', R_OPR: 0.8, R_SAT: 1.2, R_TRECE: 1.5, DIF_TUR_RETUR: 0.18, MIN_ZILE: 3, KM_5: 0.05, ORE_MIN: 15 };
const m = '999ZZZ', zile = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'];
const T = (z, hm) => new Date(`${z}T${hm}:00Z`).toISOString();   // UTC; EEST = UTC+3
const D = { tinte: [], curse: [] }, O = { curse: [] };
const dep = (z, dev, sens, t0, t1, km) => { const d = { m, dev, t0: T(z, t0), t1: T(z, t1), km, dinP: sens === 'retur', spreP: sens === 'tur', apr: [], opr: [] };
  D.curse.push(d); O.curse.push({ m, zi: z, schimb: 's1', sens, ruta: 'RX', linie: 'X', t0: d.t0, t1: d.t1, ora: 0, kmCap: sens === 'tur' ? 0 : km, plin: km, km, rt: false, poarta: 'EST', opr: [] }); return d; };
const perechi = [];
zile.forEach((z, i) => { const lungA = i % 2 === 1;
  const ta = dep(z, 'A', 'tur', '02:10', '03:00', lungA ? 25.5 : 25.0), tb = dep(z, 'B', 'tur', '02:12', '03:40', lungA ? 25.0 : 25.5);
  const ra = dep(z, 'A', 'retur', '12:50', '13:40', 25.2), rb = dep(z, 'B', 'retur', '12:50', '13:38', 25.3);
  perechi.push({ m, zi: z, a: ta, b: tb }, { m, zi: z, a: ra, b: rb }); });
const E = [{ ruta: 'RX', linie: 'X', capatC: [47.9, 27.9] }], N = { rute: [{ id: 'RX', sateNume: [] }], porti: [] };
const EG = creeazaEtalon({ O, D, E, N, porti: [{ nume: 'EST', raza: 0.6 }], P });
const l = { ruta: 'RX', linie: 'X', sursa: 'sept', real: { poartaTur: 'EST', poartaRetur: 'EST' } };
const baza = EG.metrici(l, new Set());
const cursePeZi = (mm, z) => D.curse.filter(d => d.m === mm && d.t0.startsWith(z));
const obsDe = d => O.curse.filter(o => o.m === d.m && o.t0 === d.t0 && o.km === d.km);
// (1) pe dispozitiv
const V = variante(perechi, cursePeZi, obsDe); const r1 = efectLinie({ l, baza, metrici: EG.metrici, V, P });
// (2) vechea logică v4 (lunga / scurta pe pereche) — trebuie să NU vadă efectul, ca să dovedească defectul
const peLung = f => new Set(perechi.flatMap(x => obsDe(f(x)).map(okey)));
const vechi = [['păstrează lunga', peLung(x => x.a.km >= x.b.km ? x.b : x.a)], ['păstrează scurta', peLung(x => x.a.km >= x.b.km ? x.a : x.b)]]
  .flatMap(([n, sc]) => diferente(n, baza, EG.metrici(l, sc), null, P).dif);
// (3) fără identitate
const D2 = D.curse.map(d => ({ ...d, dev: undefined })); const V3 = variante(perechi.map(x => ({ ...x })), (mm, z) => D2.filter(d => d.m === mm && d.t0.startsWith(z)), obsDe);
const r3 = efectLinie({ l, baza, metrici: EG.metrici, V: V3, P });
console.log(`baza: ora s1 tur ${baza.ore['s1 tur']} · etalon ${baza.etalonGPS} · zile bune ${baza.nBune}`);
console.log(`(1) pe dispozitiv: ${r1.nivel} — ${r1.motiv}`);
console.log(`(2) vechea logică lunga/scurta: ${vechi.length ? vechi.join(' · ') : 'nicio diferență (defectul Codex r2 C1)'}`);
console.log(`(3) fără dev: ${r3.nivel} — ${r3.motiv.slice(0, 160)}`);
const ok = r1.nivel === 'blocant' && /ora s1 tur/.test(r1.motiv) && vechi.length === 0 && r3.nivel === 'blocant' && !r3.determinat;
console.log(ok ? 'PROBA C4 ok: pe dispozitiv blochează (≥ 15 min), pe lungime nu ar fi văzut, fără dev = NEDETERMINAT' : 'PROBA C4 PICATĂ'); process.exit(ok ? 0 : 6);
