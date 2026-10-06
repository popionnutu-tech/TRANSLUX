// ION-263 (R-PAUZĂ): regula 3 a raportului LEAR (lde_analiza_reguli, /lde/reguli) socotită pe PAUZE, din cursele cu oameni ale lui
// lear-parcare.mjs: doar pauzele acasă peste prag (PRAG_PAUZA_KM) intră în economie; cifra veche (ziua întreagă − ziua fără pauze acasă)
// rămâne în r3_fara_prag. Mașina fără pauze judecate (fără casă, casa la poartă, fără drumuri de parcare) păstrează r3 vechi, cu notă.
//   node --env-file=/root/lde-worker/.env lear-r3-pauze.mjs <raport.json (lear-analiza --json)> <parcare.json | -> [--write]
// <parcare> = «-»: parcarea a picat sau e oprită (LEAR_PARCARE=0) — raportul se scrie NESCHIMBAT (regula 3 pe ziua întreagă), ca înainte de ION-263.
// --write = upsert în lde_analiza_reguli ca lear-analiza.mjs --write (uzina, saptamina, rulat_la, date, note); fără el, doar tipărește.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [RF, PF] = process.argv.slice(2), WRITE = process.argv.includes('--write');
const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();
const FARA = PF === '-';
if (!RF || !PF || !existsSync(RF) || (!FARA && !existsSync(PF))) { console.error('lear-r3-pauze.mjs <raport.json> <parcare.json> [--write] [--out f]'); process.exit(2); }
const R = JSON.parse(readFileSync(RF, 'utf8')), PK = FARA ? { saptamina: R.saptamina, masini: [], flota: {} } : JSON.parse(readFileSync(PF, 'utf8'));
if (R.saptamina !== PK.saptamina) { console.error(`săptămâni diferite: raport ${R.saptamina}, parcare ${PK.saptamina}`); process.exit(1); }
const pk = new Map(PK.masini.map((x) => [x.m, x]));
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ','), r1 = (x) => Math.round(x * 10) / 10;
const ZL = R.zile_luna ?? 21.7;
for (const m of FARA ? [] : R.masini) {
  if (!m.r3) continue;                                   // regula 3 nu s-a putut socoti (o rută, fără casă) — rămâne așa
  const p = pk.get(m.masina)?.pauze;
  const vechi = m.r3_fara_prag ?? m.r3;
  if (!p || p.motiv || !p.acasa) {
    if (p && (p.motiv === 'casa e la poartă' || p.motiv === 'niciun drum de parcare' || (!p.motiv && !p.acasa))) {   // nicio pauză acasă (casa la ≤ 3 km de poartă / fără gol / niciun gol acasă): regula 3 n-are ce tăia
      m.r3_fara_prag = vechi; m.r3 = { zi: m.azi_fara_parc ?? m.azi, km: 0, lei: m.lei_km ? 0 : null, regula: 'R-PAUZĂ', prag_km: p.prag, pauze: [] };
      (m.note ??= []).push(`R-PAUZĂ: nicio pauză acasă între cursele cu oameni${p.motiv ? ` (${p.motiv})` : ''} — regula 3 nu taie nimic`);
    } else (m.note ??= []).push(`R-PAUZĂ nejudecat (${p?.motiv ?? 'mașina lipsește din parcare'}) — regula 3 rămâne pe ziua întreagă`);
    continue;
  }
  const km = p.r3Zi, az = m.azi_fara_parc ?? m.azi;
  m.r3_fara_prag = vechi;
  m.r3 = { zi: r1(az - km), km, lei: m.lei_km ? Math.round(km * m.lei_km * ZL) : null, regula: 'R-PAUZĂ', prag_km: p.prag,
    km_model: p.r3ModelZi, pauze_acasa: p.acasa, pauze_permise: p.permise, pauze_peste: p.peste,
    pauze: p.lista.map((x) => ({ z: x.z, ora: x.ora, de: x.de, spre: x.spre, cost_km: x.cost, verdict: x.permis ? 'acasă permis' : 'la poartă', km_economie: x.eco })) };
  const peste = p.lista.filter((x) => !x.permis);
  if (peste.length) m.note.push(`R-PAUZĂ: ${peste.length} ${peste.length === 1 ? 'pauză' : 'pauze'} acasă peste ${p.prag} km — trebuie făcute la poartă: ` +
    peste.slice(0, 4).map((x) => `${x.z.slice(5)} ${x.ora} ${x.de} → ${x.spre} (+${n1(x.cost)} km)`).join('; '));
  if (p.permise) m.note.push(`R-PAUZĂ: ${p.permise} ${p.permise === 1 ? 'pauză acasă permisă' : 'pauze acasă permise'} (≤ ${p.prag} km față de poartă) — nu intră în economie`);
}
if (FARA) console.log('parcarea lipsește — raportul se scrie neschimbat, fără R-PAUZĂ');
const S_ = (f) => R.masini.reduce((s, m) => s + Math.max(0, f(m) || 0), 0);
if (!FARA) R.total.r3_fara_prag = S_((m) => (m.r3_fara_prag ?? m.r3)?.lei);
R.total.r3 = S_((m) => m.r3?.lei);
R.total.masini_r3 = R.masini.filter((m) => (m.r3?.lei || 0) > 0).length;
if (!FARA) R.total.prag_pauza_km = PK.flota?.pauze?.prag ?? null;
console.log(`${R.uzina} ${R.saptamina}: regula 3 ${R.total.r3_fara_prag} → ${R.total.r3} lei/lună (R-PAUZĂ)`);
for (const m of [...R.masini].sort((a, b) => a.masina.localeCompare(b.masina))) if (m.r3 || m.r3_fara_prag)
  console.log(`  ${m.masina.padEnd(8)} R3 ${String(m.r3_fara_prag?.km ?? '—').padStart(6)} km/zi ${String(m.r3_fara_prag?.lei ?? '—').padStart(7)} lei → ${String(m.r3?.km ?? '—').padStart(6)} km/zi ${String(m.r3?.lei ?? '—').padStart(7)} lei` +
    (m.r3?.pauze ? ` · acasă ${m.r3.pauze_acasa ?? 0}, permise ${m.r3.pauze_permise ?? 0}, peste ${m.r3.pauze_peste ?? 0}, model ${m.r3.km_model ?? '—'} km/zi` : ' · (vechi)'));
if (OUT) writeFileSync(OUT, JSON.stringify(R));
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const r = await fetch(`${SB}/rest/v1/lde_analiza_reguli?on_conflict=uzina,saptamina`, { method: 'POST', signal: AbortSignal.timeout(60000),
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ uzina: R.uzina, saptamina: R.saptamina, rulat_la: new Date().toISOString(), date: R,
    note: `${R.masini.length} mașini · ${(R.steaguri ?? []).length} steaguri · ${(R.deplasari ?? []).length} deplasări · R-PAUZĂ` }) });
if (!r.ok) { console.error(`scrierea a picat: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
console.log(`scris în lde_analiza_reguli · ${R.uzina} · ${R.saptamina}`);
