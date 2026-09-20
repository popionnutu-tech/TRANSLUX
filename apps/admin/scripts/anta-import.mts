// Import graficul interraional ANTA în anta_courses / anta_course_stops / anta_localities (ION-12).
//
//   cd apps/admin && node --env-file=.env --import tsx scripts/anta-import.mts <allCourses.csv>
//
// CSV = lista «allCourses» din foaia Google «interraional», exportată ca text/csv (o linie pe oprire).
// Rescrie cele trei tabele întreg:
//   * cursele ANTA (source=anta), FĂRĂ rândurile firmei noastre — fișierul le are incomplete;
//   * cursele noastre (source=tlx) din crm_routes + crm_stop_fares (ore) + v_interurban_v2_route_stops (km);
//   * raionul fiecărei opriri după scripts/anta/localities-md.txt (src/lib/anta/district.ts).
// Nu atinge alte tabele. Se rulează din nou când se schimbă foaia ANTA sau rutele noastre.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pick = async (p: string) => { const m: any = await import(p); return m.default ?? m; };
const S: any = await pick('../src/lib/supabase');
const D: any = await pick('../src/lib/anta/district');
const N: any = await pick('../src/lib/anta/names');

const OURS = /NR\.9 DIN BRICENI/;
const HERE = dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2];
if (!csvPath) { console.error('folosire: anta-import.mts <allCourses.csv>'); process.exit(2); }

// ---------- CSV (RFC 4180: ghilimele, virgule în câmp, ghilimele dublate) ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

interface Stop { seq: number; name: string; note: string; km_tur: number; time_tur: string | null; time_retur: string | null; km_retur: number; district: string | null }
interface Course { source: 'anta' | 'tlx'; code: string; route_name: string; operator: string; dep_tur: string | null; dep_retur: string | null; stops: Stop[] }

// ---------- 1. cursele ANTA din CSV ----------
const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const head = rows[0].map((h) => h.trim());
const col = (name: string) => { const i = head.indexOf(name); if (i < 0) throw new Error(`coloana lipsă: ${name}`); return i; };
const C = {
  code: col('Codul rutei'), op: col('Deservit de'), route: col('Denumirea rutei'), depT: col('Ora pornirii tur'),
  depR: col('Ora pornirii retur'), tT: col('Timpul sosirii (tur)'), km: col('Distanța KM'), pt: col('Puncte staționare'),
  note: col('Mențiuni'), tR: col('Timpul sosirii (retur)'), kmR: col('Distanța KM (retur)'),
};
const byKey = new Map<string, Course>();
let ourRowsDropped = 0;
for (const r of rows.slice(1)) {
  if (r.length < head.length || !r[C.code]) continue;
  const operator = N.cleanOperator(r[C.op]);
  if (OURS.test(operator)) { ourRowsDropped++; continue; }
  const route_name = r[C.route].replace(/\s+/g, ' ').trim();
  const dep_tur = N.cleanTime(r[C.depT]), dep_retur = N.cleanTime(r[C.depR]);
  const key = [r[C.code], route_name, operator, dep_tur, dep_retur].join('|');
  let c = byKey.get(key);
  if (!c) { c = { source: 'anta', code: r[C.code].trim(), route_name, operator, dep_tur, dep_retur, stops: [] }; byKey.set(key, c); }
  const note = r[C.note].replace(/\s+/g, ' ').trim();
  let name = r[C.pt].replace(/\s+/g, ' ').trim();
  if (!name) continue;
  // «or. Soroca» cu mențiunea «PC Intersectie» e ramificația de pe șosea, nu orașul: punct separat.
  if (/intersec/i.test(note) && !D.isIntersection(name)) name += D.INTERSECTION_SUFFIX;
  c.stops.push({
    seq: 0, name, note,
    km_tur: Math.round(Number(r[C.km]) || 0), time_tur: N.cleanTime(r[C.tT]),
    time_retur: N.cleanTime(r[C.tR]), km_retur: Math.round(Number(r[C.kmR]) || 0), district: null,
  });
}
const courses: Course[] = [];
for (const c of byKey.values()) {
  if (!c.stops.length) continue;
  c.stops.sort((a, b) => a.km_tur - b.km_tur);
  c.stops.forEach((s, i) => { s.seq = i + 1; });
  c.stops[0].time_tur = c.dep_tur;              // la capete: ora plecării
  c.stops[c.stops.length - 1].time_retur = c.dep_retur;
  courses.push(c);
}
console.log(`ANTA: ${courses.length} curse din ${rows.length - 1} rânduri (${ourRowsDropped} rânduri ale noastre aruncate)`);

// ---------- 2. cursele noastre din baza translux.md ----------
const db = S.getSupabase();
// PostgREST taie orice răspuns la 1000 de rânduri: citim pe felii.
async function fetchAll(make: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const { data: crmRoutes, error: e1 } = await db
  .from('crm_routes')
  .select('id, dest_to_ro, time_chisinau, time_nord')
  .eq('active', true).eq('route_type', 'interurban').order('time_chisinau');
if (e1) throw e1;
const routeIds = (crmRoutes ?? []).map((r: any) => r.id);
const fares = await fetchAll(() => db
  .from('crm_stop_fares')
  .select('crm_route_id, stop_order, name_ro, hour_from_chisinau, hour_from_nord')
  .in('crm_route_id', routeIds).order('crm_route_id').order('stop_order'));
const v2 = await fetchAll(() => db
  .from('v_interurban_v2_route_stops')
  .select('crm_route_id, stop_name_ro, km_from_start')
  .in('crm_route_id', routeIds).order('crm_route_id').order('stop_order'));

// numele ANTA pentru punctele noastre: același punct din fișier dacă e unic, altfel or./s. după tip
const antaNames = new Map<string, Set<string>>();
for (const c of courses) for (const s of c.stops) {
  const k = N.foldName(N.splitPrefix(s.name).name);
  if (!antaNames.has(k)) antaNames.set(k, new Set());
  antaNames.get(k)!.add(s.name);
}
const localities: any[] = D.parseLocalities(readFileSync(join(HERE, 'anta', 'localities-md.txt'), 'utf8'));
const districtNames = new Set(localities.map((l) => N.foldName(l.district.replace(/^mun\.\s*/, ''))));
function antaName(nameRo: string): string {
  const k = N.foldName(nameRo); const set = antaNames.get(k);
  if (set && set.size === 1) return [...set][0];
  const ascii = nameRo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/î/gi, (m: string) => (m === 'î' ? 'i' : 'I')).replace(/â/gi, (m: string) => (m === 'â' ? 'a' : 'A'));
  if (set?.has('or. ' + ascii)) return 'or. ' + ascii;
  return (districtNames.has(k) ? 'or. ' : 's. ') + ascii;
}
const kmByRoute = new Map<number, Map<string, number>>();
for (const s of v2 ?? []) {
  const m = kmByRoute.get((s as any).crm_route_id) ?? new Map();
  m.set(N.foldName((s as any).stop_name_ro), Number((s as any).km_from_start));
  kmByRoute.set((s as any).crm_route_id, m);
}
const ourName = 'S.R.L. PARCUL DE AUTOBUZE ŞI TAXIMETRE NR.9 DIN BRICENI';
let ours = 0;
for (const r of crmRoutes ?? []) {
  const km = kmByRoute.get((r as any).id);
  if (!km || !km.size) continue;
  const kCh = km.get('chisinau') ?? Math.max(...km.values());
  const stops: Stop[] = [];
  for (const f of (fares ?? []).filter((f: any) => f.crm_route_id === (r as any).id)) {
    const hc = N.antaTime((f as any).hour_from_chisinau), hn = N.antaTime((f as any).hour_from_nord);
    if (!hc && !hn) continue;
    const k = km.get(N.foldName((f as any).name_ro));
    if (k == null) continue;
    stops.push({ seq: 0, name: antaName((f as any).name_ro), note: '', km_tur: Math.round(kCh - k), time_tur: hc, time_retur: hn, km_retur: Math.round(k), district: null });
  }
  if (!stops.some((s) => N.foldName(N.splitPrefix(s.name).name) === 'chisinau')) {
    stops.push({ seq: 0, name: 'or. Chisinau', note: 'GA Nord', km_tur: 0, time_tur: null, time_retur: null, km_retur: Math.round(kCh), district: null });
  }
  stops.sort((a, b) => a.km_tur - b.km_tur);
  stops.forEach((s, i) => { s.seq = i + 1; });
  const dep_tur = N.antaTime(((r as any).time_chisinau ?? '').split(' - ')[0]);
  const dep_retur = N.antaTime(((r as any).time_nord ?? '').split(' - ')[0]);
  stops[0].time_tur = dep_tur; stops[stops.length - 1].time_retur = dep_retur;
  const dest = String((r as any).dest_to_ro);
  courses.push({
    source: 'tlx', code: `TLX-${(r as any).id}`,
    route_name: dest.startsWith('Chișinău') ? dest.replace(' - ', ' GA Nord - ') : `Chișinău GA Nord - ${dest}`,
    operator: ourName, dep_tur, dep_retur, stops,
  });
  ours++;
}
console.log(`translux.md: ${ours} curse ale noastre din crm_routes`);

// ---------- 3. raionul opririlor ----------
const idx = new D.LocalityIndex(localities);
let noDistrict = 0; const unknown = new Map<string, number>();
for (const c of courses) {
  const ds: (string | null)[] = D.resolveDistricts(c.stops.map((s) => s.name), idx);
  c.stops.forEach((s, i) => { s.district = ds[i]; if (!ds[i]) { noDistrict++; unknown.set(s.name, (unknown.get(s.name) ?? 0) + 1); } });
}
console.log(`raion: ${noDistrict} opriri fără raion, ${unknown.size} nume necunoscute:`, [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, k]) => `${n}×${k}`).join(', '));

// ---------- 4. scriere ----------
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const must = (r: { error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };

must(await db.from('anta_course_stops').delete().gte('id', 0), 'șterge opriri');
must(await db.from('anta_courses').delete().gte('id', 0), 'șterge curse');
must(await db.from('anta_localities').delete().gte('id', 0), 'șterge localități');
for (const part of chunk(localities, 500)) must(await db.from('anta_localities').insert(part), 'localități');

let stopsWritten = 0;
for (const part of chunk(courses, 300)) {
  const ins = await db.from('anta_courses')
    .insert(part.map((c) => ({ source: c.source, code: c.code, route_name: c.route_name, operator: c.operator, dep_tur: c.dep_tur, dep_retur: c.dep_retur })))
    .select('id');
  must(ins, 'curse');
  const ids = (ins.data ?? []).map((x: any) => x.id as number);
  if (ids.length !== part.length) throw new Error('insert curse: număr diferit de id-uri');
  const stopRows = part.flatMap((c, i) => c.stops.map((s) => ({ course_id: ids[i], ...s })));
  for (const sp of chunk(stopRows, 1000)) { must(await db.from('anta_course_stops').insert(sp), 'opriri'); stopsWritten += sp.length; }
}
console.log(`scris: ${courses.length} curse, ${stopsWritten} opriri, ${localities.length} localități`);
