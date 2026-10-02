// Piața pe pereche (ION-171): populația BNS pe localități → piata_localitati, salariile pe raioane → piata_salarii_raion,
// legarea stațiilor TIKI → piata_statii (oraș + bazin pe 10 km).
//
//   cd apps/admin && node --env-file=.env --import tsx scripts/piata/bns-import.mts [--dry]
//
// Surse (în repo, scripts/piata/data/, din statistica.gov.md la 01.10.2026):
//   rpl2024-localitati.csv — Anexa_Localitati_RPL2024.xlsx, foile 8.3 (total) + 8.4 (0–14 / 15–64 / 65+)
//   salarii-2025.csv       — Anexa_costul_muncii_2025.xlsx, tabelele 5 (câștig brut) și 12 (salariați)
// Coordonatele vin din anta_localities (Wikidata, migr. 382). Stațiile = capetele perechilor TIKI din ultimele 7 luni.
// Rândurile piata_statii cu manual=true nu se rescriu.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pick = async (p: string) => { const m: any = await import(p); return m.default ?? m; };
const S: any = await pick('../../src/lib/supabase');
const N: any = await pick('../../src/lib/anta/names');
const D: any = await pick('../../src/lib/anta/district');

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');
const db = S.getSupabase();
const fold: (s: string) => string = N.foldName;
const distanceKm: (a: [number, number], b: [number, number]) => number = D.distanceKm;

// ---------- parametri ----------
const RAZA_KM = 10;                       // Ion, 02.10: «și satele din jur 10 km»
const POND_65 = 1.0, POND_0_14 = 0.2;     // Ion, 02.10: pensionarii pondere 1
const NORD = ['Briceni', 'Edineț', 'Ocnița', 'Rîșcani', 'Dondușeni', 'Glodeni', 'Sîngerei', 'Drochia', 'Telenești',
  'Fălești', 'Soroca', 'Florești', 'Orhei', 'mun. Bălți', 'mun. Chișinău'];
// Stații care nu se leagă pe nume (scrierea TIKI / rânduri BNS compuse).
const MANUAL: Record<string, { nume: string; raion: string }> = {
  'chisinau': { nume: 'Chișinău', raion: 'mun. Chișinău' },
  'balti': { nume: 'Bălți', raion: 'mun. Bălți' },
  'beleavinti': { nume: 'Beleavinți', raion: 'Briceni' },
  'sirauti': { nume: 'Șirăuți', raion: 'Briceni' },
  'cotelea': { nume: 'Coteala', raion: 'Briceni' },
};

// ---------- CSV ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1);
}
const num = (s: string) => (s === '' || s == null ? null : Number(s));
const raionScurt = (r: string) => r.replace(/^Raionul\s+/, '').replace(/^Mun\.\s+/, 'mun. ').replace(/^Municipiul\s+/, 'mun. ').replace(/\s+/g, ' ').trim();

// ---------- 1. localitățile BNS ----------
type Loc = { cod_bns: string; nivel: string; nume: string; raion: string; total: number; v0_14: number | null; v15_64: number | null; v65: number | null; lat: number | null; lon: number | null };
const locRows = parseCsv(readFileSync(join(HERE, 'data/rpl2024-localitati.csv'), 'utf8')).slice(1)
  .filter(r => /^\d+$/.test(r[0]) && r[4] !== '' && !Number.isNaN(Number(r[4])))
  .map(r => ({ cod_bns: r[0], nivel: r[1], nume: r[2].replace(/\s+/g, ' ').trim(), raion: raionScurt(r[3] || r[2]), total: Number(r[4]),
    v0_14: num(r[5]), v15_64: num(r[6]), v65: num(r[7]), lat: null, lon: null } as Loc));
// Chișinău: rândul orașului e compus («or. Chișinău, din care pe sectoare»); îl numim simplu.
for (const l of locRows) if (/^or\. Chi[sș]in[aă]u/.test(l.nume)) l.nume = 'or. Chișinău';

// coordonate din anta_localities (nume + raion)
const al = await db.from('anta_localities').select('name, district, lat, lon').range(0, 4999);
if (al.error) throw new Error(al.error.message);
const coord = new Map<string, [number, number]>();
for (const r of al.data ?? []) if (r.lat != null && r.lon != null) coord.set(fold(r.name) + '|' + fold(r.district), [r.lat, r.lon]);
const numeCurat = (n: string) => n.replace(/^(or|s|mun|com)\.\s*/, '');
let cuCoord = 0;
for (const l of locRows) {
  const c = coord.get(fold(numeCurat(l.nume)) + '|' + fold(l.raion));
  if (c) { l.lat = c[0]; l.lon = c[1]; cuCoord++; }
}
console.log(`BNS: ${locRows.length} rânduri (${locRows.filter(l => l.nivel === 'Localitati').length} localități), cu coordonate ${cuCoord}`);

// unitățile geografice: localitățile; comunele fără rând de localitate (același cod) sunt ele însele unitatea
const codsCuLoc = new Set(locRows.filter(l => l.nivel === 'Localitati').map(l => l.cod_bns));
const units = locRows.filter(l => l.nivel === 'Localitati' || (l.nivel === 'Comune' && !codsCuLoc.has(l.cod_bns)));
console.log(`unități: ${units.length}; fără coordonate: ${units.filter(u => u.lat == null).length}`);

// ---------- 2. stațiile TIKI ----------
const azi = new Date(); const from = new Date(azi.getFullYear(), azi.getMonth() - 7, 1).toISOString().slice(0, 10);
const pairs = await db.rpc('get_tiki_pairs', { p_from: from, p_to: azi.toISOString().slice(0, 10), p_route: null, p_driver: null });
if (pairs.error) throw new Error(pairs.error.message);
const ALIAS: Record<string, string> = { beleavineti: 'beleavinti', 'sl sirauti': 'sirauti' };
const stopNorm = (x: string) => { const n = x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(ga|gara|autogara)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); return ALIAS[n] ?? n; };
const statii = new Map<string, { nume: string; bilete: number }>();
for (const p of (pairs.data ?? []) as { pair: string; tickets: number }[]) {
  for (const end of p.pair.split(' - ')) { const k = stopNorm(end); const s = statii.get(k); if (s) s.bilete += p.tickets; else statii.set(k, { nume: end.trim(), bilete: p.tickets }); }
}
console.log(`stații TIKI: ${statii.size}`);

// raionul prin care trec rutele NOASTRE (anta_course_stops, source=tlx), ca indiciu la omonime
const tlx = await db.from('anta_course_stops').select('name, district, anta_courses!inner(source)').eq('anta_courses.source', 'tlx').range(0, 4999);
const raionRuta = new Map<string, string>();
for (const r of (tlx.data ?? []) as any[]) if (r.district) raionRuta.set(stopNorm(r.name.replace(/^(or|s|mun|com)\.\s*/, '').replace(/\s*\(.*\)$/, '')), r.district);

const prio = (raion: string) => { const i = NORD.indexOf(raion); return i < 0 ? 99 : i; };
type St = { statie_norm: string; nume: string; raion: string | null; unit: Loc | null; oras: number | null; bazin: number | null; bazin_echiv: number | null; sate: any[]; nota: string | null };
const legate: St[] = [];
for (const [k, s] of statii) {
  let cand = units.filter(u => fold(numeCurat(u.nume)) === fold(s.nume) || stopNorm(numeCurat(u.nume)) === k);
  const man = MANUAL[k];
  if (man) cand = units.filter(u => fold(numeCurat(u.nume)) === fold(man.nume) && fold(u.raion) === fold(man.raion));
  const hint = raionRuta.get(k);
  if (hint && cand.some(u => fold(u.raion) === fold(hint))) cand = cand.filter(u => fold(u.raion) === fold(hint));
  cand.sort((a, b) => prio(a.raion) - prio(b.raion) || b.total - a.total);
  const u = cand[0] ?? null;
  legate.push({ statie_norm: k, nume: s.nume, raion: u?.raion ?? null, unit: u, oras: u?.total ?? null, bazin: null, bazin_echiv: null, sate: [],
    nota: u ? (cand.length > 1 ? `omonime: ${cand.map(c => `${c.raion} ${c.total}`).join('; ')}` : null) : 'nelegată' });
}
// orașul = toată comuna (orașul cu satele lui administrative), nu doar localitatea-centru
for (const st of legate) if (st.unit) {
  const comuna = locRows.find(l => l.nivel === 'Comune' && l.cod_bns === st.unit!.cod_bns && fold(l.raion) === fold(st.unit!.raion));
  if (comuna && /^or\./.test(comuna.nume)) st.oras = comuna.total;
}

// ---------- 3. bazinul: fiecare sat fără stație, la stația cea mai apropiată din ≤ RAZA_KM ----------
const statUnits = new Set(legate.filter(l => l.unit).map(l => l.unit!));
const echiv = (u: Loc) => (u.v15_64 ?? 0) + POND_65 * (u.v65 ?? 0) + POND_0_14 * (u.v0_14 ?? 0);
for (const st of legate) { if (st.unit) { st.bazin = st.oras ?? st.unit.total; st.bazin_echiv = echiv(st.unit); } }
let repartizate = 0;
for (const u of units) {
  if (u.lat == null || statUnits.has(u)) continue;
  let best: St | null = null, bd = RAZA_KM + 1e-9;
  for (const st of legate) {
    if (!st.unit || st.unit.lat == null) continue;
    const d = distanceKm([u.lat, u.lon!], [st.unit.lat, st.unit.lon!]);
    if (d < bd) { bd = d; best = st; }
  }
  if (!best) continue;
  best.bazin = (best.bazin ?? 0) + u.total; best.bazin_echiv = (best.bazin_echiv ?? 0) + echiv(u);
  best.sate.push({ nume: numeCurat(u.nume), raion: u.raion, pop: u.total, km: Math.round(bd * 10) / 10 });
  repartizate++;
}
console.log(`bazin: ${repartizate} sate repartizate pe ${RAZA_KM} km`);
for (const st of legate.sort((a, b) => (statii.get(b.statie_norm)!.bilete - statii.get(a.statie_norm)!.bilete)).slice(0, 25)) {
  console.log(`  ${st.nume.padEnd(20)} ${String(st.raion ?? '—').padEnd(12)} oraș ${String(st.oras ?? '—').padStart(6)}  bazin ${String(st.bazin ?? '—').padStart(6)}  sate ${st.sate.length}${st.nota ? '  · ' + st.nota : ''}`);
}

// ---------- 4. salariile ----------
const sal = parseCsv(readFileSync(join(HERE, 'data/salarii-2025.csv'), 'utf8')).slice(1)
  .map(r => ({ raion: r[0].replace('Chisinău', 'Chișinău'), an: 2025, brut: Number(r[1]), salariati: num(r[2]), sursa: 'BNS, Anexa_costul_muncii_2025.xlsx, tab. 5 și 12' }));

// ---------- 5. scriere ----------
if (DRY) { console.log('--dry: nimic scris'); process.exit(0); }
const must = (r: { error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
for (const part of chunk(locRows, 500)) must(await db.from('piata_localitati').upsert(part, { onConflict: 'cod_bns,nivel,nume' }), 'localități');
must(await db.from('piata_salarii_raion').upsert(sal, { onConflict: 'raion' }), 'salarii');
const ids = await db.from('piata_localitati').select('id, cod_bns, nivel, nume').range(0, 4999);
must(ids, 'id-uri');
const idOf = new Map((ids.data ?? []).map((r: any) => [`${r.cod_bns}|${r.nivel}|${r.nume}`, r.id as number]));
const manual = await db.from('piata_statii').select('statie_norm').eq('manual', true);
const keep = new Set((manual.data ?? []).map((r: any) => r.statie_norm));
const rows = legate.filter(st => !keep.has(st.statie_norm)).map(st => ({
  statie_norm: st.statie_norm, nume: st.nume, raion: st.raion,
  localitate_id: st.unit ? idOf.get(`${st.unit.cod_bns}|${st.unit.nivel}|${st.unit.nume}`) ?? null : null,
  oras: st.oras, bazin: st.bazin, bazin_echiv: st.bazin_echiv == null ? null : Math.round(st.bazin_echiv), sate: st.sate, manual: false, nota: st.nota,
}));
must(await db.from('piata_statii').upsert(rows, { onConflict: 'statie_norm' }), 'stații');
console.log(`scris: ${locRows.length} localități, ${sal.length} raioane cu salarii, ${rows.length} stații (${keep.size} manuale păstrate)`);
