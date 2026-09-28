// ION-120 (28.09.2026): adaugă în rândul săptămânii (date.reguli4) cele 4 reguli ale lui Ion, din <dosar>/patru-reguli.json (patru-reguli.mjs).
// Verdictul dezbaterii Claude + Codex (docs/plans/2026-09-28-drax-4-reguli, Codex r3 10/10) + deciziile lui Ion 1–5 din 28.09 (§8.7).
// Ion, 28.09.2026 (după prima publicare): «scoate regula 2 în general, fă în 3 reguli» — «rămâne la uzină» nu se mai arată și nu intră în total;
// rămân 1 doarme la capăt, 2 rute împărțite altfel (fosta 3), 3 nu pleacă acasă între schimburi (fosta 4). Câmpurile interne păstrează R1/R3/R4.
// Aditiv: eșecul NU atinge rândul scris de scrie-analiza.mjs (pagina arată «cele 4 reguli: lipsă»). Proba fără dublă numărare picată = nu scrie.
//   node --env-file=/root/lde-worker/.env scrie-reguli4.mjs <dosar> [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.argv[2], WRITE = process.argv.includes('--write');
if (!DIR || !existsSync(`${DIR}/analiza.json`) || !existsSync(`${DIR}/patru-reguli.json`)) { console.error('scrie-reguli4.mjs <dosar> [--write] (lipsește analiza.json / patru-reguli.json)'); process.exit(2); }
const A = JSON.parse(readFileSync(`${DIR}/analiza.json`, 'utf8')), P = JSON.parse(readFileSync(`${DIR}/patru-reguli.json`, 'utf8'));
const r1 = (x) => Math.round(x * 10) / 10, rez = P.rez, L = P.liste;
if (rez.proba.ok !== rez.proba.masini) { console.error(`proba celor 4 reguli picată: ${rez.proba.ok}/${rez.proba.masini} — date.reguli4 NU se scrie`); process.exit(1); }
if (rez.valhallaNull) { console.error(`Valhalla null: ${rez.valhallaNull} — date.reguli4 NU se scrie`); process.exit(1); }
// R-4 pe mașină, doar bucățile din eșantion (aceleași din care vine R1b), cu locul de așteptare
const r4 = {}; for (const x of L.R4.filter((q) => q.esant)) { const o = (r4[x.m] ??= { m: x.m, km: 0, laCapat: 0, laUzina: 0 }); o.km += x.km; if (/capăt/.test(x.unde ?? '')) o.laCapat += x.km; else o.laUzina += x.km; }
const balti = Object.fromEntries((rez.R1.balti.peMasina ?? []).filter((x) => x.kmEsant > 0).map((x) => [x.m, r1(x.kmEsant)]));   // nopțile eligibile R-1 în Bălți, pe eșantion (§7.4, Ion 1)
const masini = new Map();
const m = (k) => masini.get(k) ?? masini.set(k, { m: k, R1: null, R2: 0, R4: 0, R4laCapat: 0, R4laUzina: 0, balti: balti[k] ?? 0 }).get(k);
for (const x of L.R1peMasina) Object.assign(m(x.m), { R1: { propus: !!x.propus, km: r1(x.kmEsant), kmSapt: r1(x.kmSapt12_2 ?? 0), nopti: x.nopti, X: x.X ?? null, soferKm: x.soferKm?.med ?? null, motiv: x.motiv ?? null,
  // Ion 28.09 («nu pot apăsa pe auto»): nopțile, pentru rândul deschis pe pagină
  detaliu: (x.noptiDetaliu ?? []).map((n) => ({ noapte: n.noapte, ora: n.ora, X: n.X ?? null, seara: r1(n.seara ?? 0), dim: r1(n.dim ?? 0) })) } });
for (const x of Object.values(r4)) Object.assign(m(x.m), { R4: r1(x.km), R4laCapat: r1(x.laCapat), R4laUzina: r1(x.laUzina),
  R4lista: L.R4.filter((q) => q.esant && q.m === x.m).map((q) => ({ z: q.z, ora: q.ora, km: r1(q.km), unde: q.unde ?? null })) });
for (const k of Object.keys(balti)) m(k);
const lista = [...masini.values()].map((x) => ({ ...x, total: r1((x.R1?.propus ? x.R1.km : 0) + x.R4) })).sort((a, b) => b.total - a.total);
A.reguli4 = {
  versiune: 'ION-120 · 28.09.2026 · dezbaterea Claude + Codex (r3 10/10) + deciziile lui Ion', rulat: P.rulat,
  esantion: rez.sursa.esantion, zileLV: rez.sursa.zileLV, factor: rez.sursa.factorExtrapolare,
  flota: { ...rez.flota, R2: undefined, sumaPropusa: { masurat: r1(rez.flota.R1propus.masurat + rez.flota.R4.masurat), extrapolat: rez.flota.R1propus.extrapolat + rez.flota.R4.extrapolat } },
  treiReguli: true,
  R3: { candidati: (L.R3.candidati ?? []).map((p) => ({ A: p.A, B: p.B, net: p.net, castigA: p.castigA, castigB: p.castigB })), perechiVerificate: rez.R3.perechiTotal,
    masiniEligibile: rez.R3.masiniEligibile, masiniCuZileExcluse: rez.R3.masiniCuZileExcluse?.length ?? 0, prag: 50, capacitate: 'DAF 50, Sprinter 518 30; microbuzele 20–30 — pe clasa dusă deja (Ion 28.09, migr. 422)' },
  masini: lista,
};
writeFileSync(`${DIR}/analiza.json`, JSON.stringify(A));
const sb = r1(Object.values(balti).reduce((a, x) => a + x, 0));
if (Math.abs(sb - rez.flota.balti.masurat) > 0.5) console.error(`atenție: Bălți pe mașini ${sb} ≠ ${rez.flota.balti.masurat}`);
console.log(`reguli (3): doarme la capăt ${rez.flota.R1propus.masurat} · nu pleacă acasă ${rez.flota.R4.masurat} · total ${A.reguli4.flota.sumaPropusa.masurat} (extrapolat ${A.reguli4.flota.sumaPropusa.extrapolat}) · rute altfel ${A.reguli4.R3.candidati.length} schimburi · Bălți ${rez.flota.balti.masurat} separat · ${lista.length} mașini`);
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc'); process.exit(1); }
const q = `${SB}/rest/v1/lde_analiza_reguli?uzina=eq.DRAXELMAIER&saptamina=eq.${A.saptamina}`;
const r = await fetch(q, { method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ date: A }) });
if (!r.ok) { console.error(`lde_analiza_reguli: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
const rows = await r.json(); if (rows.length !== 1) { console.error(`PATCH a atins ${rows.length} rânduri`); process.exit(1); }
console.log(`scris: date.reguli4 în lde_analiza_reguli DRAXELMAIER ${A.saptamina}`);
