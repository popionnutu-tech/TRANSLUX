// ============================================================================
// Tomberon cash-in pull — plățile șoferilor de la casa automată (MS SQL 2008 R2,
// baza `cash-in`) → Supabase tomberon.transactions, prin RPC tomberon_ingest.
//
// De ce: scriptul de pe serverul lui Vasea trimite plățile o singură dată pe zi,
// la 03:00 (edge function ingest-tomberon). Ion, 08.10.2026: «fă ca terminalul
// să se descarce de 3 ori pe zi, nu o dată». Nu avem acces la scriptul lui Vasea,
// dar VPS-ul citește deja aceeași bază (tomberon-sync.mjs), deci tragem noi.
// Rularea de la 03:00 a lui Vasea rămâne; ingest-ul e idempotent pe external_id.
//
// Rândurile se construiesc EXACT ca la Vasea (verificat câmp cu câmp pe 30 de zile
// cu --check, 08.10.2026):
//   payments: fiecare plată apare de două ori (_status -1 și 10); plata e rândul
//   care are atributul InCash în attr4payments (idd_payment = payments.row_id).
//   external_id = payments.id, sofer_id = _account (foaia), suma = _value,
//   introdus_la = input_date (ora locală Chișinău, fără fus), ziua = data ei,
//   restul din attr4payments: ligotniki0, diagrama, ligotniki_vokzal, dt,
//   dop_rashodi, comment, FiscalReceiptNr.
//
// Politică: trimitem DOAR plățile care lipsesc în Supabase. Re-trimiterea uneia
// existente ar muta synced_at, iar get_incasare_report arată atunci «plăți noi
// după confirmare» pe o zi deja confirmată de evaluator.
//
// Rulare: node --env-file=.env tomberon-cashin-pull.mjs [YYYY-MM-DD] [--days N] [--write] [--check]
// Implicit: ultimele 2 zile până azi (Europe/Chisinau), dry-run fără --write.
// --check: compară câmp cu câmp plățile deja existente (validarea mapării), nu scrie.
// Variabile .env: SUPABASE_URL, SUPABASE_SERVICE_KEY, TOMBERON_HOST/PORT/USER/PASS.
// ============================================================================
import sql from 'mssql';
import { WebSocket as WS } from 'ws';
import { createClient } from '@supabase/supabase-js';
globalThis.WebSocket = globalThis.WebSocket || WS;

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const CHECK = args.includes('--check');
const di = args.indexOf('--days');
const DAYS = di >= 0 ? Math.max(1, +args[di + 1] || 1) : 2;
const chisinau = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TO = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || chisinau(new Date());
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const FROM = addDays(TO, -(DAYS - 1));

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const pool = await sql.connect({
  server: process.env.TOMBERON_HOST,
  port: +process.env.TOMBERON_PORT,
  user: process.env.TOMBERON_USER,
  password: process.env.TOMBERON_PASS,
  database: 'cash-in',
  options: { encrypt: false, trustServerCertificate: true, tdsVersion: '7_3_B' },
  pool: { max: 2 },
  connectionTimeout: 10000,
  requestTimeout: 60000,
});

const num = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = v => (v === undefined || v === null || String(v) === '' ? null : String(v));
// mssql citește datetime fără fus ca UTC → toISOString() dă exact ora de pe casă (locală).
const wall = d => d.toISOString().slice(0, 19).replace('T', ' ');

try {
  const req = pool.request();
  req.input('from', sql.VarChar, FROM);
  req.input('to', sql.VarChar, addDays(TO, 1));
  const pays = (await req.query(`
    SELECT p.row_id, CONVERT(varchar(36), p.id) AS id, p._account, p._value, p.input_date
    FROM payments p
    WHERE p.input_date >= @from AND p.input_date < @to
      AND EXISTS (SELECT 1 FROM attr4payments a WHERE a.idd_payment = p.row_id AND a._name = 'InCash')
    ORDER BY p.input_date`)).recordset;

  const attrs = new Map();
  if (pays.length) {
    const ids = pays.map(p => +p.row_id).join(',');
    const rows = (await pool.request().query(`SELECT idd_payment, _name, _value FROM attr4payments WHERE idd_payment IN (${ids})`)).recordset;
    for (const r of rows) {
      if (!attrs.has(r.idd_payment)) attrs.set(r.idd_payment, {});
      attrs.get(r.idd_payment)[r._name] = r._value;
    }
  }

  // aceeași formă ca obiectul curățat de edge function ingest-tomberon (ajunge în raw_data)
  const records = pays.map(p => {
    const a = attrs.get(p.row_id) || {};
    const suma = Number(p._value);
    const at = wall(p.input_date);
    return {
      external_id: p.id.toUpperCase(),
      sofer_id: String(p._account).trim(),
      ziua: at.slice(0, 10),
      suma,
      suma_numerar: suma,
      ruta_id: null,
      auto_id: null,
      ligotniki0_suma: num(a.ligotniki0),
      diagrama_suma: num(a.diagrama),
      ligotniki_vokzal_suma: num(a.ligotniki_vokzal),
      dt_suma: num(a.dt),
      dop_rashodi: num(a.dop_rashodi),
      comment: str(a.comment),
      fiscal_receipt_nr: str(a.FiscalReceiptNr),
      introdus_la: at,
    };
  }).filter(r => r.sofer_id && r.external_id);

  const have = new Map();
  for (let i = 0; i < records.length; i += 200) {
    // schema tomberon nu e în API → RPC doar pentru service_role (migr. 533)
    const { data, error } = await supa.rpc('tomberon_transactions_by_ids', { ids: records.slice(i, i + 200).map(r => r.external_id) });
    if (error) throw new Error('Supabase: ' + error.message);
    for (const t of data) have.set(t.external_id.toUpperCase(), t);
  }

  const missing = records.filter(r => !have.has(r.external_id));
  console.log(`${new Date().toISOString()} | ${FROM}..${TO}: ${records.length} plăți la casă, ${records.length - missing.length} deja în Supabase, ${missing.length} lipsă`);

  if (CHECK) {
    const F = ['sofer_id', 'ziua', 'suma_numerar', 'ligotniki0_suma', 'diagrama_suma', 'ligotniki_vokzal_suma', 'dt_suma', 'dop_rashodi', 'comment', 'fiscal_receipt_nr'];
    let diff = 0;
    for (const r of records) {
      const t = have.get(r.external_id);
      if (!t) continue;
      const bad = F.filter(f => (r[f] === null ? null : String(r[f])) !== (t[f] === null ? null : f.endsWith('suma') || f === 'suma_numerar' || f === 'dop_rashodi' ? String(Number(t[f])) : String(t[f])));
      const tl = t.introdus_la ? wall(new Date(Date.parse(t.introdus_la) + offsetMs(t.introdus_la))) : null;
      if (tl && tl !== r.introdus_la) bad.push('introdus_la');
      if (bad.length) { diff++; if (diff <= 20) console.log('  DIFERIT', r.external_id, bad.map(f => `${f}: casă=${r[f]} supa=${t[f]}`).join('; ')); }
    }
    console.log(`CHECK: ${diff} plăți cu câmpuri diferite din ${records.length - missing.length} comparate`);
  }

  for (const r of missing.slice(0, 30)) console.log(`  LIPSĂ ${r.ziua} foaia ${r.sofer_id} ${r.suma} lei (bon ${r.fiscal_receipt_nr}, ${r.introdus_la})`);

  if (WRITE && !CHECK && missing.length) {
    const { data, error } = await supa.rpc('tomberon_ingest', { records: missing });
    if (error) throw new Error('tomberon_ingest: ' + error.message);
    console.log(`SCRIS: ${missing.length} plăți noi (affected ${data?.affected ?? '?'})`);
  } else if (!WRITE) {
    console.log('dry-run — nimic scris (adaugă --write)');
  }
} finally {
  await pool.close();
}

// introdus_la din Supabase e UTC; ora de pe casă = ora locală Chișinău la momentul acela.
function offsetMs(isoUtc) {
  const d = new Date(isoUtc);
  const loc = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return loc - utc;
}
