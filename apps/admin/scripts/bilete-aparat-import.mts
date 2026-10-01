// Importul exporturilor «carrier-2-sales-*.csv» (bilete aparat TIKI) din terminal — același lucru ca butonul
// «Import» din Numărare → Bilete aparat, pentru fișiere mari sau multe deodată.
//
//   cd apps/admin && node --env-file=.env --import tsx scripts/bilete-aparat-import.mts ~/Downloads/carrier-2-sales-*.csv
//
// Fiecare bilet intră o singură dată (după ticket_key: număr + cursă + mașină + șofer + preț): fișierele suprapuse sau reimportate nu dublează nimic.
// La final reface tabela preț → pereche și, lună cu lună, tipurile de bilet deduse și totalurile (migrația 446).
// Rulează cu --recalc fără fișiere ca să refacă doar recalculul pe toate lunile.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const pick = async (p: string) => { const m: any = await import(p); return m.default ?? m; };
const S: any = await pick('../src/lib/supabase');
const T: any = await pick('../src/app/(dashboard)/numarare/tabs/bilete/ticketParse');

const CHUNK = 1000;
const args = process.argv.slice(2);
const recalcOnly = args.includes('--recalc');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length && !recalcOnly) {
  console.error('folosire: bilete-aparat-import.mts <fișier.csv> [fișier2.csv …]   sau   --recalc');
  process.exit(2);
}

const sb = S.getSupabase();
const nf = new Intl.NumberFormat('ro-RO');
const months = new Set<string>();

for (const file of files) {
  const r = T.parseTikiExport(readFileSync(file, 'utf8'));
  if ('error' in r) { console.error(`${basename(file)}: ${r.error}`); process.exit(1); }
  console.log(`${basename(file)}: ${nf.format(r.rows.length)} bilete (${r.dateMin} – ${r.dateMax}), ` +
    `${nf.format(r.duplicatesInFile)} dubluri în fișier, ${nf.format(r.excluded.test)} de probă excluse`);

  const b = await sb.from('tiki_import_batches').insert({
    file_name: basename(file), uploaded_by: 'terminal', rows_in_file: r.totalLines, rows_excluded: r.excluded,
    rows_dup_in_file: r.duplicatesInFile, date_min: r.dateMin, date_max: r.dateMax,
  }).select('id').single();
  if (b.error) { console.error(b.error.message); process.exit(1); }

  let sent = 0, inserted = 0;
  try {
    for (let i = 0; i < r.rows.length; i += CHUNK) {
      const rows = r.rows.slice(i, i + CHUNK).map((x: any) => ({
        ...x, pair_source: x.pair ? 'statii' : 'nedeterminat', import_batch_id: b.data.id,
      }));
      const res = await sb.from('tiki_tickets')
        .upsert(rows, { onConflict: 'ticket_key', ignoreDuplicates: true }).select('ticket_no');
      if (res.error) throw new Error(res.error.message);
      inserted += res.data?.length ?? 0;
      sent += rows.length;
      process.stdout.write(`\r  încărcat ${nf.format(sent)} / ${nf.format(r.rows.length)}`);
    }
    await sb.from('tiki_import_batches').update({ rows_sent: sent, rows_inserted: inserted, status: 'done' }).eq('id', b.data.id);
  } catch (e) {
    await sb.from('tiki_import_batches').update({ rows_sent: sent, rows_inserted: inserted, status: 'failed' }).eq('id', b.data.id);
    console.error(`\n  oprit: ${e instanceof Error ? e.message : e} — relansează, biletele trimise nu se dublează`);
    process.exit(1);
  }
  console.log(`\n  ${nf.format(inserted)} bilete noi, ${nf.format(sent - inserted)} erau deja importate`);
  if (r.dateMin && r.dateMax) T.monthsBetween(r.dateMin, r.dateMax).forEach((m: string) => months.add(m));
}

if (recalcOnly) {
  // Intervalul din bilete, nu din get_tiki_meta: acela citește totalurile, goale înaintea primului recalcul.
  const edge = (asc: boolean) => sb.from('tiki_tickets').select('sale_date').order('sale_date', { ascending: asc }).limit(1);
  const [lo, hi] = await Promise.all([edge(true), edge(false)]);
  if (lo.error || hi.error) { console.error((lo.error ?? hi.error).message); process.exit(1); }
  if (!lo.data?.length) { console.error('Nu sunt bilete importate.'); process.exit(1); }
  T.monthsBetween(lo.data[0].sale_date, hi.data[0].sale_date).forEach((x: string) => months.add(x));
}

console.log('Tabela preț → pereche…');
const map = await sb.rpc('tiki_rebuild_price_map');
if (map.error) { console.error(map.error.message); process.exit(1); }
for (const month of [...months].sort()) {
  const [y, mo] = month.split('-').map(Number);
  const to = `${month}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
  const d = await sb.rpc('tiki_deduce_pairs', { p_from: `${month}-01`, p_to: to });
  if (d.error) { console.error(`${month}: ${d.error.message}`); process.exit(1); }
  const a = await sb.rpc('tiki_refresh_agg', { p_from: `${month}-01`, p_to: to });
  if (a.error) { console.error(`${month}: ${a.error.message}`); process.exit(1); }
  console.log(`  ${month}: ${nf.format(d.data)} tipuri deduse, ${nf.format(a.data)} rânduri de totaluri`);
}

const meta = await sb.rpc('get_tiki_meta');
console.log(`Gata: ${nf.format(meta.data?.tickets ?? 0)} bilete în bază (${meta.data?.date_min} – ${meta.data?.date_max}).`);
