// ============================================================================
// Puntea către 1C: leagă piesele, lăcătușii și mașinile noastre de GUID-urile din contabilitate.
//
//   node scripts/import-1c-guid.mjs --nomenclator=Nomenclator.xml --lacatusi=Lacatusi.xml \
//        --activitati="Вид деятельности.xml" [--apply]
//
//   • FĂRĂ --apply → DRY-RUN: doar raportează, nu scrie nimic (implicit).
//   • CU   --apply → scrie `guid_1c`. A SE COORDONA CU ION (bază de producție comună).
//
// DE CE E NEVOIE: fișierul de schimb 1C sincronizează STRICT după GUID, fără căutare de rezervă după
// articol. Un GUID necunoscut nu dă eroare — creează un articol nou. Fără puntea asta, primul export ar
// dubla nomenclatorul contabilității.
//
// NU GHICEȘTE. Un cod purtat de mai multe piese (la noi sau la ei) NU se leagă — iese în lista de
// excepții. O legătură greșită ar scădea marfa în contabilitate de pe alt articol decât cel scos de pe
// raft, iar diferența n-ar fi vizibilă din nicio parte.
//
// Fișierul de nomenclator e de ordinul sutelor de MB: se citește ÎN FLUX, obiect cu obiect.
// ============================================================================

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const val = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=');
const apply = args.includes('--apply');

// Cheia se ia din mediu sau din apps/admin/.env — NU se afișează niciodată.
function env(nume) {
  if (process.env[nume]) return process.env[nume];
  for (const f of ['apps/admin/.env', '.env']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${nume}\\s*=\\s*(.+)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normNr = (s) => String(s ?? '').toUpperCase().replace(/[\s-]/g, '');
// 1C scrie adesea numărul cu modelul după el: „390 ORBI MERCEDES", „779 IHD SETRA", „595 Ford GAlaxy".
// Luăm numărul din FAȚA denumirii. `\b` la final apără de tăieturi greșite: pe „949 Mercedes 220D" nu
// rupe „949 Merc", fiindcă după „Merc" urmează literă, nu graniță de cuvânt.
const NR_MASINA = /^[.\s]*(\d{2,4}\s*[A-Za-z]{2,4}|[A-Za-z]{3}\d{3})\b/;
const nrDinNume = (s) => {
  const m = NR_MASINA.exec(String(s ?? '').trim());
  return m ? normNr(m[1]) : normNr(s);
};

// ── Citire în flux a obiectelor dintr-un fișier de schimb 1C ──
async function* obiecte(cale) {
  const st = createReadStream(cale, { encoding: 'utf8', highWaterMark: 1 << 22 });
  let buf = '';
  for await (const chunk of st) {
    buf += chunk;
    for (;;) {
      const i = buf.indexOf('<Объект ');
      if (i < 0) break;
      const j = buf.indexOf('</Объект>', i);
      if (j < 0) break;
      const obj = buf.slice(i, j);
      buf = buf.slice(j + '</Объект>'.length);
      const t = obj.match(/^<Объект\s[^>]*?ИмяПравила="([^"]*)"/);
      if (t) yield { tip: t[1], corp: obj };
    }
    // Păstrăm doar coada, ca memoria să nu crească pe un fișier de sute de MB.
    if (buf.length > 1 << 24) buf = buf.slice(-(1 << 20));
  }
}
function zone(corp) {
  const i = corp.indexOf('<Ссылка');
  if (i < 0) return ['', corp];
  const j = corp.indexOf('</Ссылка>', i);
  return j < 0 ? [corp.slice(i), ''] : [corp.slice(i, j), corp.slice(j + 9)];
}
const prop = (z, n) => {
  const m = z.match(new RegExp(`<Свойство Имя="${n}" Тип="[^"]*">\\s*<Значение>([^<]*)</Значение>`));
  return m ? m[1].trim() || null : null;
};

async function citeste(cale, tipDorit) {
  const out = [];
  for await (const { tip, corp } of obiecte(cale)) {
    if (tip !== tipDorit) continue;
    const [ident, atrib] = zone(corp);
    const guid = prop(ident, '\\{УникальныйИдентификатор\\}');
    if (!guid) continue;
    if (prop(ident, 'ЭтоГруппа') === 'true') continue;  // grupele nu sunt articole
    // Poziție marcată la ștergere în 1C: nu legăm nimic de ea. Sunt 121 în nomenclator, iar 28 de coduri
    // duplicate se rezolvă doar prin excluderea lor.
    if (prop(atrib, 'ПометкаУдаления') === 'true') continue;
    out.push({ guid, nume: prop(atrib, 'Наименование'), articol: prop(atrib, 'Артикул') });
  }
  return out;
}

// ── Potrivire, fără alegeri tăcute ──
// `departajare`: când un cod e purtat de mai multe poziții în 1C, se compară DENUMIREA. Merge fiindcă
// denumirile noastre au venit chiar din exportul lor din iulie — sunt aceleași șiruri. Din 1 568 de coduri
// ambigue, 1 497 au denumiri diferite între ele, deci sunt departajabile; restul de 71 sunt dubluri reale
// în 1C (aceeași denumire de două ori) și rămân pentru om.
function potriveste(lor, ale_noastre, cheiaLor, departajare) {
  const alorIdx = new Map();
  for (const o of lor) {
    const k = cheiaLor(o);
    if (!k) continue;
    (alorIdx.get(k) ?? alorIdx.set(k, []).get(k)).push(o);
  }
  const noiIdx = new Map();
  for (const n of ale_noastre) {
    if (!n.cheie) continue;
    (noiIdx.get(n.cheie) ?? noiIdx.set(n.cheie, []).get(n.cheie)).push(n);
  }
  const legate = [], exceptii = [];
  for (const [k, ai_nostri] of noiIdx) {
    const ai_lor = alorIdx.get(k) || [];
    if (ai_lor.length === 0) { exceptii.push({ cheie: k, motiv: 'lipsește în 1C', ai_nostri: ai_nostri.length, ai_lor: 0 }); continue; }
    if (ai_nostri.length > 1) { exceptii.push({ cheie: k, motiv: 'mai multe la noi', ai_nostri: ai_nostri.length, ai_lor: ai_lor.length }); continue; }
    let ales = ai_lor[0];
    if (ai_lor.length > 1) {
      const dupaNume = departajare ? ai_lor.filter((o) => norm(o.nume) === ai_nostri[0].nume2) : [];
      if (dupaNume.length !== 1) {
        exceptii.push({ cheie: k, motiv: 'mai multe în 1C', ai_nostri: 1, ai_lor: ai_lor.length });
        continue;
      }
      ales = dupaNume[0];
    }
    legate.push({ id: ai_nostri[0].id, guid: ales.guid, cheie: k, nume: ales.nume });
  }
  return { legate, exceptii };
}

// ── Baza ──
const URL = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
const KEY = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
if (!URL || !KEY) { console.error('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_KEY (mediu sau apps/admin/.env).'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function toate(tabel, coloane, filtru) {
  const out = []; const pas = 1000;
  for (let de = 0; ; de += pas) {
    let q = sb.from(tabel).select(coloane).range(de, de + pas - 1);
    if (filtru) q = filtru(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabel}: ${error.message}`);
    out.push(...data);
    if (data.length < pas) break;
  }
  return out;
}
async function scrie(tabel, coloana, perechi) {
  let n = 0;
  for (const p of perechi) {
    const { error } = await sb.from(tabel).update({ [coloana]: p.guid }).eq('id', p.id);
    // Indicele unic apără de două piese legate la același articol din 1C — raportăm, nu ignorăm.
    if (error) { console.error(`  ! ${tabel} id=${p.id}: ${error.message}`); continue; }
    n++;
  }
  return n;
}

function raport(titlu, r, total) {
  console.log(`\n=== ${titlu} ===`);
  console.log(`  legate        : ${r.legate.length} din ${total} (${(r.legate.length / Math.max(total, 1) * 100).toFixed(1)}%)`);
  const pe = {};
  for (const e of r.exceptii) pe[e.motiv] = (pe[e.motiv] || 0) + 1;
  for (const [m, c] of Object.entries(pe)) console.log(`  ${m.padEnd(14)}: ${c}`);
}

const main = async () => {
  const rezultate = {};

  if (val('nomenclator')) {
    console.log('citesc nomenclatorul 1C (în flux)…');
    const lor = await citeste(val('nomenclator'), 'Номенклатура');
    const noi = (await toate('piese_parts', 'id, article_code, name_long', (q) => q.eq('active', true)))
      .map((p) => ({ id: p.id, cheie: norm(p.article_code), nume2: norm(p.name_long) }));
    console.log(`  1C: ${lor.length} poziții · noi: ${noi.length} piese active`);
    const r = potriveste(lor, noi, (o) => norm(o.articol), true);
    raport('PIESE (după articol, departajat după denumire)', r, noi.filter((n) => n.cheie).length);
    rezultate.piese = { r, tabel: 'piese_parts', coloana: 'guid_1c' };

    // Procentul pe tot catalogul NU e cifra care decide. Exportul unui document se blochează doar dacă o
    // piesă DIN ACEL DOCUMENT n-are legătură — deci contează acoperirea pieselor chiar eliberate.
    const folosite = new Set((await toate('piese_stock_movements', 'part_id',
      (q) => q.eq('movement_type', 'ISSUE'))).map((m) => m.part_id));
    const legateSet = new Set(r.legate.map((x) => x.id));
    const acoperite = [...folosite].filter((id) => legateSet.has(id)).length;
    console.log(`\n  piese care au fost eliberate vreodată: ${folosite.size}`);
    console.log(`  din care legate de 1C                : ${acoperite} (${(acoperite / Math.max(folosite.size, 1) * 100).toFixed(1)}%)`);
    console.log(`  NElegate, deci ar bloca un export    : ${folosite.size - acoperite}`);
  }

  if (val('lacatusi')) {
    const lor = await citeste(val('lacatusi'), 'Сотрудники');
    const noi = (await toate('piese_mechanics', 'id, name')).map((m) => ({ id: m.id, cheie: norm(m.name) }));
    console.log(`\n1C: ${lor.length} angajați · noi: ${noi.length} lăcătuși`);
    const r = potriveste(lor, noi, (o) => norm(o.nume));
    raport('LĂCĂTUȘI (după nume)', r, noi.length);
    for (const e of r.exceptii) console.log(`    · „${e.cheie}" — ${e.motiv}`);
    rezultate.lacatusi = { r, tabel: 'piese_mechanics', coloana: 'guid_1c' };
  }

  if (val('activitati')) {
    const lor = await citeste(val('activitati'), 'ВидыДеятельности');
    const noi = (await toate('piese_vehicles', 'id, plate', (q) => q.eq('active', true)))
      .map((v) => ({ id: v.id, cheie: normNr(v.plate) }));
    console.log(`\n1C: ${lor.length} tipuri de activitate · noi: ${noi.length} mașini`);
    // 1C scrie „458 BRAX" cu spațiu, noi „459BRAX" fără — se compară fără spații și cratime.
    const r = potriveste(lor, noi, (o) => nrDinNume(o.nume));
    raport('MAȘINI ca «вид деятельности» (după număr)', r, noi.length);
    for (const e of r.exceptii.slice(0, 20)) console.log(`    · „${e.cheie}" — ${e.motiv}`);
    if (r.exceptii.length > 20) console.log(`    … și încă ${r.exceptii.length - 20}`);
    rezultate.activitati = { r, tabel: 'piese_vehicles', coloana: 'guid_1c_activitate' };
  }

  const csv = ['entitate;cheie;motiv;ale_noastre;ale_lor'];
  for (const [k, v] of Object.entries(rezultate))
    for (const e of v.r.exceptii) csv.push(`${k};${e.cheie};${e.motiv};${e.ai_nostri};${e.ai_lor}`);
  writeFileSync('exceptii-1c.csv', csv.join('\n'), 'utf8');
  console.log(`\nexcepțiile complete: exceptii-1c.csv (${csv.length - 1} rânduri)`);

  if (!apply) { console.log('\nDRY-RUN — nu s-a scris nimic. Adaugă --apply ca să scrie.'); return; }
  for (const [k, v] of Object.entries(rezultate)) {
    const n = await scrie(v.tabel, v.coloana, v.r.legate);
    console.log(`scris ${k}: ${n} din ${v.r.legate.length}`);
  }
};
main().catch((e) => { console.error('EȘEC:', e.message); process.exit(1); });
