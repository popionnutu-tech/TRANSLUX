// ============================================================================
// Tomberon sync — trimite graficul zilei (șofer + foaie + mașină) în DB-ul
// terminalului (MS SQL 2008 R2), baza LIVE `special_db`, tabelul `waybills`.
//
// ATENȚIE — convenție moștenită din softul terminalului (verificat 04.08.2026):
// în `waybills` coloanele sunt INVERSATE față de nomenclatoare:
//   waybills.DriverID -> auto.AutoID   (mașina!)
//   waybills.AutoID   -> drivers.DriverID (șoferul!)
// Scriem la fel, altfel terminalul nu leagă rândurile.
//
// Sursa: driver_cashin_receipts (foaia zilei) + daily_assignments + drivers/vehicles.
// Politică: INSERT-only — adăugăm doar foile care lipsesc pe ziua respectivă
// (rândurile introduse manual de operator nu se șterg / nu se modifică);
// diferențele față de datele noastre doar se raportează în log.
//
// Mapare șoferi: tomberon_driver_map (migr. 244) — bootstrap cu --map din
// coincidența numerelor de foaie pe ultimele 30 de zile.
//
// Rulare: node --env-file=.env tomberon-sync.mjs [YYYY-MM-DD] [--map] [--write]
// Implicit: azi (Europe/Chisinau), dry-run fără --write.
// ============================================================================
import sql from 'mssql';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const MAP = args.includes('--map');
const chisinau = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const DATE = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || chisinau(new Date());
const ddmmyy = iso => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y.slice(2)}`; }; // formatul waybills.data
const normWb = s => String(s || '').trim().replace(/^0+/, '');          // comparație foi: fără zerouri în față
const padWb = s => normWb(s).padStart(7, '0');                          // formatul lor: "0948774"
const normPlate = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const pool = await sql.connect({
  server: process.env.TOMBERON_HOST,
  port: +process.env.TOMBERON_PORT,
  user: process.env.TOMBERON_USER,
  password: process.env.TOMBERON_PASS,
  database: 'special_db',
  options: { encrypt: false, trustServerCertificate: true, tdsVersion: '7_3_B' },
  pool: { max: 2 },
  connectionTimeout: 10000,
  requestTimeout: 30000,
});

try {
  // ── nomenclatoarele terminalului ──
  const tAuto = (await pool.request().query('SELECT AutoID, AutoValue FROM auto')).recordset;
  const autoByPlate = new Map();
  for (const a of tAuto) {
    const norm = normPlate(a.AutoValue);
    if (norm) autoByPlate.set(norm, { id: a.AutoID, exact: true });
  }
  // «651AKD» vs «651ADK» — registrele au uneori literele plăcuței în altă ordine
  const anagram = s => { const m = s.match(/^(\d+)([A-Z]+)$/); return m ? m[1] + [...m[2]].sort().join('') : null; };
  const findAuto = plate => {
    const p = normPlate(plate);
    if (!p) return null;
    if (autoByPlate.has(p)) return autoByPlate.get(p).id;
    // AutoValue conține uneori și modelul («318 BRAT Sprinter 312») → prefix unic
    let hits = tAuto.filter(a => normPlate(a.AutoValue).startsWith(p));
    if (hits.length === 1) return hits[0].AutoID;
    // aceleași cifre + aceleași litere în altă ordine (typo într-unul din registre)
    const pa = anagram(p);
    if (!pa) return null;
    hits = tAuto.filter(a => anagram(normPlate(a.AutoValue).slice(0, p.length)) === pa);
    if (hits.length === 1) {
      console.log(`  (plăcuță potrivită tolerant: «${plate}» -> «${hits[0].AutoValue.trim()}»)`);
      return hits[0].AutoID;
    }
    return null;
  };

  // ══ MOD --map: bootstrap mapare șoferi din foile comune (ultimele 30 zile) ══
  if (MAP) {
    const tDrivers = (await pool.request().query('SELECT DriverID, DriverName FROM drivers')).recordset;
    const days = [];
    for (let i = 0; i < 30; i++) { const d = new Date(); d.setDate(d.getDate() - i); days.push(chisinau(d)); }
    const foi = [];
    for (let from = 0; ; from += 1000) { // PostgREST dă max 1000 rânduri/pagină
      const { data, error } = await supa.from('driver_cashin_receipts')
        .select('driver_id, receipt_nr, ziua').gte('ziua', days[days.length - 1])
        .order('ziua').order('driver_id').range(from, from + 999);
      if (error) { console.error('Supabase receipts:', error.message); process.exit(1); }
      foi.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const dates = [...new Set(days.map(ddmmyy))];
    const req = pool.request();
    const inList = dates.map((d, i) => { req.input(`d${i}`, sql.VarChar(20), d); return `@d${i}`; }).join(',');
    // waybills.AutoID = șoferul (convenția inversată)
    const wb = (await req.query(`SELECT AutoID AS drv, WayID, Waybill, data FROM waybills WHERE data IN (${inList})`)).recordset;
    const byKey = new Map(); // "ziua|foaie" -> Set(terminal driver id)
    for (const w of wb) {
      const [dd, mm, yy] = w.data.split('.');
      const key = `20${yy}-${mm}-${dd}|${normWb(w.Waybill)}`;
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key).add(w.drv);
    }

    const votes = new Map(); // uuid -> Map(terminalId -> count)
    for (const f of foi ?? []) {
      const set = byKey.get(`${f.ziua}|${normWb(f.receipt_nr)}`);
      if (!set || set.size !== 1) continue;
      const tid = [...set][0];
      if (!votes.has(f.driver_id)) votes.set(f.driver_id, new Map());
      const v = votes.get(f.driver_id);
      v.set(tid, (v.get(tid) || 0) + 1);
    }

    const mappings = [];
    for (const [uuid, v] of votes) {
      const sorted = [...v.entries()].sort((a, b) => b[1] - a[1]);
      const [tid, n] = sorted[0];
      if (sorted.length > 1) console.warn(`  CONFLICT ${uuid}: ${JSON.stringify(sorted)} — iau majoritatea (${tid})`);
      if (n >= 1) mappings.push({ driver_id: uuid, terminal_id: tid, matched_by: 'waybill' });
    }
    // un terminal_id nu poate aparține la doi șoferi — păstrez doar câștigătorul
    const byTid = new Map();
    for (const m of mappings) {
      const cur = byTid.get(m.terminal_id);
      const nOf = mm => votes.get(mm.driver_id).get(mm.terminal_id);
      if (!cur || nOf(m) > nOf(cur)) byTid.set(m.terminal_id, m);
    }
    const finalMap = [...byTid.values()];
    console.log(`Bootstrap: ${finalMap.length} mapări șofer↔terminal din foi comune (30 zile).`);
    const tNameById = new Map(tDrivers.map(d => [d.DriverID, d.DriverName]));
    for (const m of finalMap) console.log(`  ${m.driver_id} -> ${m.terminal_id} (${tNameById.get(m.terminal_id) ?? '???'})`);
    if (WRITE && finalMap.length) {
      // nu atingem nimic existent: nici driver_id, nici terminal_id deja ocupat
      // (ex. remapările manuale ar pica pe UNIQUE(terminal_id) la upsert în bloc)
      const { data: exMap, error: ee } = await supa.from('tomberon_driver_map').select('driver_id, terminal_id');
      if (ee) { console.error('read map:', ee.message); process.exit(1); }
      const exDrv = new Set((exMap ?? []).map(m => m.driver_id));
      const exTid = new Set((exMap ?? []).map(m => m.terminal_id));
      const fresh = finalMap.filter(m => !exDrv.has(m.driver_id) && !exTid.has(m.terminal_id));
      if (fresh.length) {
        const { error: ue } = await supa.from('tomberon_driver_map').insert(fresh);
        if (ue) { console.error('insert map:', ue.message); process.exit(1); }
      }
      console.log(`Mapări șoferi: ${fresh.length} noi salvate, ${finalMap.length - fresh.length} existau deja.`);
    } else if (!WRITE) console.log('DRY-RUN: adaugă --write ca să salvezi mapările.');

    // ── mapare rute: WayID dominant per cursă (crm_route_id) din aceleași foi ──
    const das = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supa.from('daily_assignments')
        .select('driver_id, crm_route_id, assignment_date')
        .gte('assignment_date', days[days.length - 1]).not('crm_route_id', 'is', null)
        .order('assignment_date').order('id').range(from, from + 999);
      if (error) { console.error('Supabase daily_assignments:', error.message); process.exit(1); }
      das.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    // "ziua|driver_uuid" -> crm_route_id; zilele cu >1 rută nu votează (ambigue)
    const daKey = new Map();
    for (const a of das) {
      const k = `${a.assignment_date}|${a.driver_id}`;
      if (daKey.has(k) && daKey.get(k) !== a.crm_route_id) daKey.set(k, null);
      else if (!daKey.has(k)) daKey.set(k, a.crm_route_id);
    }
    const ourByKey = new Map(foi.map(f => [`${f.ziua}|${normWb(f.receipt_nr)}`, f.driver_id]));
    const routeVotes = new Map(); // crm_route_id -> Map(WayID -> n)
    for (const w of wb) {
      const [dd, mm, yy] = w.data.split('.');
      const ziua = `20${yy}-${mm}-${dd}`;
      const uuid = ourByKey.get(`${ziua}|${normWb(w.Waybill)}`);
      if (!uuid) continue;
      const rid = daKey.get(`${ziua}|${uuid}`);
      if (rid == null) continue;
      if (!routeVotes.has(rid)) routeVotes.set(rid, new Map());
      const v = routeVotes.get(rid);
      v.set(w.WayID, (v.get(w.WayID) || 0) + 1);
    }
    const routeMapRows = [];
    for (const [rid, v] of routeVotes) {
      const sorted = [...v.entries()].sort((a, b) => b[1] - a[1]);
      const total = sorted.reduce((s, [, n]) => s + n, 0);
      const [wayId, n] = sorted[0];
      if (n >= 3 && n / total >= 0.8) routeMapRows.push({ crm_route_id: rid, way_id: wayId, matched_by: 'waybill' });
      else console.warn(`  RUTĂ ambiguă crm_route ${rid}: ${JSON.stringify(sorted.slice(0, 3))} — mapează manual în tomberon_route_map`);
    }
    console.log(`Bootstrap rute: ${routeMapRows.length} mapări cursă↔WayID.`);
    if (WRITE && routeMapRows.length) {
      const { error: re } = await supa.from('tomberon_route_map')
        .upsert(routeMapRows, { onConflict: 'crm_route_id', ignoreDuplicates: true });
      if (re) { console.error('upsert route map:', re.message); process.exit(1); }
      console.log('Mapările de rute au fost salvate.');
    }
    process.exit(0);
  }

  // ══ MOD sync: foile zilei → waybills (INSERT-only) ══
  // Sincronizăm azi ȘI mâine: dispecerul introduce foile din ajun, iar șoferii pot
  // veni la terminal cu foaia de mâine încă din seara precedentă (curse de noapte).
  const nextDay = iso => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  const DATES = args.some(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) ? [DATE] : [DATE, nextDay(DATE)];
  // o zi eșuată nu blochează cealaltă (cron reia oricum peste 10 min),
  // dar exit code-ul reflectă eșecul pentru monitorizare
  for (const zi of DATES) {
    try { await syncDay(zi); }
    catch (e) { console.error(`EROARE ziua ${zi}: ${e.message}`); process.exitCode = 1; }
  }

  async function syncDay(DATE) {
  const D = ddmmyy(DATE);
  const { data: foi, error: fe } = await supa.from('driver_cashin_receipts')
    .select('driver_id, receipt_nr').eq('ziua', DATE);
  if (fe) throw new Error(`Supabase receipts: ${fe.message}`);
  console.log(`${DATE} (${D}): ${foi?.length ?? 0} foi la noi`);
  if (!foi?.length) return;

  const drvIds = [...new Set(foi.map(f => f.driver_id))];
  const [drvRes, daRes, mapRes] = await Promise.all([
    supa.from('drivers').select('id, full_name, active').in('id', drvIds),
    supa.from('daily_assignments').select('driver_id, vehicle_id, vehicle_id_retur, crm_route_id').eq('assignment_date', DATE).in('driver_id', drvIds),
    supa.from('tomberon_driver_map').select('driver_id, terminal_id').in('driver_id', drvIds),
  ]);
  for (const r of [drvRes, daRes, mapRes]) if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  const nameMap = new Map(drvRes.data.map(d => [d.id, d.full_name]));
  const activeMap = new Map(drvRes.data.map(d => [d.id, d.active !== false]));
  const termId = new Map(mapRes.data.map(m => [m.driver_id, m.terminal_id]));

  // ── auto-mapare șoferi noi (lazy — se activează doar când apare unul nemapat) ──
  // 1) căutare după nume în nomenclatorul terminalului (normalizat, tolerant la
  //    variații gen Sumschii/Sumschi, Zait/Zaiat); 2) dacă nu există deloc acolo,
  //    îl creăm noi în special_db.drivers (MAX(DriverID)+1 — exact ce face softul
  //    lor la «șofer nou»); 3) ambiguu (două potriviri) → skip + log, decide omul.
  const asciiName = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');
  const normName = s => asciiName(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const lev1 = (a, b) => {
    if (a === b) return true;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (l.length - s.length > 1) return false;
    let i = 0, j = 0, diff = 0;
    while (i < s.length && j < l.length) {
      if (s[i] === l[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (s.length === l.length) { i++; j++; } else j++;
    }
    return diff + (l.length - j) + (s.length - i) <= 1;
  };
  const tokEq = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a) || lev1(a, b)));
  let tDriversP = null, usedTidsP = null;
  const getTDrivers = () => (tDriversP ??= pool.request().query('SELECT DriverID, DriverName FROM drivers').then(r => r.recordset));
  const getUsedTids = () => (usedTidsP ??= supa.from('tomberon_driver_map').select('terminal_id')
    .then(({ data, error }) => { if (error) throw new Error(`map tids: ${error.message}`); return new Set((data ?? []).map(m => m.terminal_id)); }));

  async function autoMap(uuid, fullName) {
    const [tDrv, used] = await Promise.all([getTDrivers(), getUsedTids()]);
    const ourTok = normName(fullName).split(' ');
    const free = tDrv.filter(d => !used.has(d.DriverID));
    let hits = free.filter(d => normName(d.DriverName) === ourTok.join(' '));
    if (!hits.length) hits = free.filter(d => {
      const t = normName(d.DriverName).split(' ');
      if (!tokEq(t[0], ourTok[0])) return false;
      if (t.length < 2 || ourTok.length < 2) return true;
      // prenumele trebuie să se potrivească; pe inițială DOAR dacă unul chiar e inițială
      return tokEq(t[1], ourTok[1]) || ((t[1].length === 1 || ourTok[1].length === 1) && t[1][0] === ourTok[1][0]);
    });
    if (hits.length > 1) {
      console.warn(`  AMBIGUU «${fullName}»: ${hits.map(h => `#${h.DriverID} ${h.DriverName}`).join(' / ')} — mapează manual în tomberon_driver_map`);
      return null;
    }
    let tid, how;
    if (hits.length === 1) { tid = hits[0].DriverID; how = 'name'; }
    else {
      // 0 potriviri libere. Dacă numele de familie EXISTĂ deja la terminal (ocupat
      // sau nu), nu creăm nimic — poate fi un duplicat de-al nostru (Zaiț S./Zait
      // Serghei) sau un coleg omonim; decide omul. Creăm doar nume complet noi.
      const sameSurname = tDrv.filter(d => tokEq(normName(d.DriverName).split(' ')[0], ourTok[0]));
      if (sameSurname.length) {
        console.warn(`  SKIP «${fullName}»: nume de familie deja la terminal (${sameSurname.map(h => `#${h.DriverID} ${h.DriverName}`).join(' / ')}) — mapează manual`);
        return null;
      }
      if (!WRITE) { console.log(`  [dry] «${fullName}» nu există la terminal — cu --write l-aș crea în special_db.drivers`); return null; }
      // MAX+1 și INSERT într-un singur statement — fără fereastră de cursă
      const res = await pool.request().input('nm', sql.VarChar(50), asciiName(fullName).slice(0, 50))
        .query('INSERT INTO drivers (DriverID, DriverName) OUTPUT INSERTED.DriverID SELECT ISNULL(MAX(DriverID), 0) + 1, @nm FROM drivers WITH (UPDLOCK, HOLDLOCK)');
      tid = res.recordset[0].DriverID;
      how = 'created';
    }
    if (!WRITE) { console.log(`  [dry] «${fullName}» s-ar mapa pe #${tid} (${hits[0].DriverName})`); return null; }
    const { error } = await supa.from('tomberon_driver_map').insert({ driver_id: uuid, terminal_id: tid, matched_by: how });
    if (error) { console.error(`  EROARE mapare «${fullName}» -> #${tid}: ${error.message}`); return null; }
    used.add(tid);
    termId.set(uuid, tid);
    console.log(`  MAPAT «${fullName}» -> #${tid} (${how === 'created' ? 'șofer nou creat la terminal' : `nume: ${hits[0].DriverName}`})`);
    return tid;
  }
  const daMap = new Map();
  for (const a of daRes.data) if (!daMap.has(a.driver_id)) daMap.set(a.driver_id, a);
  const vehIds = [...new Set(daRes.data.flatMap(a => [a.vehicle_id, a.vehicle_id_retur]).filter(Boolean))];
  const rutIds = [...new Set(daRes.data.map(a => a.crm_route_id).filter(x => x != null))];
  const [vehRes, rmRes] = await Promise.all([
    vehIds.length ? supa.from('vehicles').select('id, plate_number').in('id', vehIds) : Promise.resolve({ data: [] }),
    rutIds.length ? supa.from('tomberon_route_map').select('crm_route_id, way_id').in('crm_route_id', rutIds) : Promise.resolve({ data: [] }),
  ]);
  const plateMap = new Map((vehRes.data ?? []).map(v => [v.id, v.plate_number]));
  const routeWay = new Map((rmRes.data ?? []).map(r => [r.crm_route_id, r.way_id]));

  // ce există deja la terminal pe ziua asta (cu drv/car, pentru raportarea diferențelor)
  const exist = (await pool.request().input('d', sql.VarChar(20), D)
    .query('SELECT AutoID AS drv, DriverID AS car, Waybill FROM waybills WHERE data = @d')).recordset;
  const existWb = new Map();
  for (const w of exist) {
    const k = normWb(w.Waybill);
    if (!existWb.has(k)) existWb.set(k, []);
    existWb.get(k).push(w);
  }

  // WayID: cel mai folosit istoric per șofer (nomenclatorul ways e gol — valoare de
  // formă). Agregatul pe toată waybills e scump pe SQL 2008 → lazy: doar dacă chiar
  // avem ceva de inserat (marea majoritate a rulărilor n-au).
  let wayTopP = null;
  const getWayTop = () => (wayTopP ??= pool.request()
    .query('SELECT AutoID AS drv, WayID, COUNT(*) AS n FROM waybills WITH (NOLOCK) GROUP BY AutoID, WayID')
    .then(r => {
      const m = new Map();
      for (const w of r.recordset) { const cur = m.get(w.drv); if (!cur || w.n > cur.n) m.set(w.drv, w); }
      return m;
    }));

  const esteMaine = DATE > chisinau(new Date());
  let inserted = 0, skipped = 0, failed = 0, difs = 0;
  for (const f of foi) {
    const wb = normWb(f.receipt_nr);
    const name = nameMap.get(f.driver_id) ?? f.driver_id;
    if (!/^\d{1,7}$/.test(wb)) { console.warn(`  SKIP foaie ne-numerică «${f.receipt_nr}» (${name})`); continue; }
    const a = daMap.get(f.driver_id);
    const plate = a ? plateMap.get(a.vehicle_id) ?? plateMap.get(a.vehicle_id_retur) : null;
    if (existWb.has(wb)) {
      // foaia există deja — doar raportăm dacă terminalul o are pe ALT șofer sau
      // ALTĂ mașină (ex. dispecerul a mutat cursa după ce rândul a plecat;
      // INSERT-only → nu modificăm nimic)
      const rows = existWb.get(wb);
      const ourTid = termId.get(f.driver_id);
      const ourAuto = plate ? findAuto(plate) : null;
      if (ourTid != null && !rows.some(r => r.drv === ourTid)) {
        difs++;
        console.warn(`  DIFERIT foaie ${wb}: la terminal drv=#${rows.map(r => r.drv).join('/#')}, la noi ${name} (#${ourTid}) — corectează manual la terminal dacă e cazul`);
      } else if (ourAuto != null && !rows.some(r => r.car === ourAuto)) {
        difs++;
        console.warn(`  DIFERIT foaie ${wb}: la terminal auto=#${rows.map(r => r.car).join('/#')}, la noi ${plate} (#${ourAuto})`);
      }
      skipped++;
      continue;
    }
    let tid = termId.get(f.driver_id);
    if (tid == null && nameMap.has(f.driver_id) && activeMap.get(f.driver_id)) {
      // o eroare la auto-mapare nu blochează restul foilor
      try { tid = await autoMap(f.driver_id, name); }
      catch (e) { console.error(`  EROARE auto-mapare «${name}»: ${e.message}`); }
    }
    if (tid == null) { console.warn(`  SKIP foaie ${wb} (${name}): șofer nemapat`); continue; }
    if (!plate) {
      // pe mâine e normal (graficul se completează treptat); pe azi e o lacună reală
      if (esteMaine) console.log(`  amânat foaie ${wb} (${name}): încă fără mașină în grafic`);
      else console.warn(`  SKIP foaie ${wb} (${name}): fără mașină în graficul de AZI`);
      continue;
    }
    const autoId = findAuto(plate);
    if (autoId == null) { console.warn(`  SKIP foaie ${wb} (${name}): mașina «${plate}» negăsită în nomenclatorul auto al terminalului`); continue; }
    // WayID: 1) maparea rutei zilei (tomberon_route_map); 2) istoric per șofer; 3) 0
    const wayId = (a?.crm_route_id != null ? routeWay.get(a.crm_route_id) : null)
      ?? (await getWayTop()).get(tid)?.WayID ?? 0;

    console.log(`  +${padWb(wb)}  ${name}  auto=${plate}(#${autoId})  drv=#${tid}  way=${wayId}`);
    if (WRITE) {
      try {
        // convenția inversată: DriverID=mașina, AutoID=șoferul
        await pool.request()
          .input('car', sql.Int, autoId).input('drv', sql.Int, tid).input('way', sql.Int, wayId)
          .input('wb', sql.VarChar(50), padWb(wb)).input('d', sql.VarChar(20), D)
          .query('INSERT INTO waybills (DriverID, AutoID, WayID, Waybill, data) VALUES (@car, @drv, @way, @wb, @d)');
        inserted++;
      } catch (e) {
        // un rând prost nu blochează restul foilor
        failed++;
        console.error(`  EROARE insert foaie ${wb} (${name}): ${e.message}`);
      }
    }
  }
  const difTxt = difs ? `, ${difs} DIFERITE` : '';
  console.log(WRITE
    ? `SCRIS: ${inserted} foi noi, ${skipped} existau deja${difTxt}, ${failed} eșuate.`
    : `DRY-RUN: ${skipped} există deja${difTxt}, restul de mai sus s-ar insera. Adaugă --write.`);
  }
} finally {
  await pool.close();
}
