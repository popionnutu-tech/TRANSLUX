import { getSupabase } from '../supabase';
import { sendTelegram, sendTelegramPhoto, escapeHtml } from '../telegram-notify';
import { poster, CULORI, type Celula, type Coloana } from '../poster-sablon';
import { COMBUSTIBIL_POSTER_CONFIG_KEY, COMBUSTIBIL_POSTER_THREAD_CONFIG_KEY } from '@translux/db';

/**
 * Posterul lunar de combustibil (ION-138). Ion, 29.09.2026: «raport automatizat în format poster lunar, pe fiecare
 * direcție — LEAR să fie împreună, SEBN-urile împreună, Trox și Briceni tot împreună, și mașini cu foi de parcurs
 * până la utilaje tot să fie într-o poză. Acolo unde este norma: 1. norma factică luna curentă, 2. norma factică
 * ultimele 3 luni, 3. norma teoretică».
 *
 * O imagine pe grup. Cifrele vin din aceleași funcții ca pagina /lde/combustibil (migr. 435–437):
 * lde_fuel_flota(lună) și lde_fuel_flota(3 luni) — l/100 km = litrii din fereastra cu km / km; lde_fuel_consumatori
 * pentru tot ce e în afara flotei. Norma teoretică = norma tipului mașinii (lde_vehicle_types).
 *
 * Ion, 29.09 (a doua parte): postarea merge în grupa P9, tabul «DT», pe 25 ale lunii pentru luna trecută; «la sfârșit
 * să fie întotdeauna un poster general, al 8-lea»; după toate, un mesaj de introducere.
 */

// Grupa P9 și tabul ei «DT» (message_thread_id); fără grupă setată nu pleacă nimic — nu în altă grupă
export const COMBUSTIBIL_POSTER_CHAT_KEY = COMBUSTIBIL_POSTER_CONFIG_KEY;          // /lega_dt în bot
export const COMBUSTIBIL_POSTER_THREAD_KEY = COMBUSTIBIL_POSTER_THREAD_CONFIG_KEY;
const MARCA_KEY = (g: string) => `combustibil_poster_last_${g}`;
const MARCA_INTRO_KEY = 'combustibil_poster_intro_last';

export const GRUPURI: { id: string; titlu: string; scurt: string; directii: string[] }[] = [
  { id: 'interurban', titlu: 'Interurban', scurt: 'Interurban', directii: ['interurban'] },
  { id: 'drax', titlu: 'Drăxlmaier Bălți', scurt: 'Drăxlmaier', directii: ['DRAXELMAIER_BALTI'] },
  { id: 'sebn', titlu: 'SEBN Orhei + Strășeni', scurt: 'SEBN', directii: ['SEBN_ORHEI', 'SEBN_STRASENI'] },
  { id: 'lear', titlu: 'LEAR Ungheni + Florești', scurt: 'LEAR', directii: ['LEAR_UNGHENI', 'LEAR_FLORESTI'] },
  { id: 'briceni', titlu: 'Trox + suburban Briceni', scurt: 'Trox + Briceni', directii: ['suburban'] },
  { id: 'camioane', titlu: 'Camioane', scurt: 'Camioane', directii: ['camioane'] },
];
// Ion, 29.09: «textul e foarte mic, sunt oameni de 67 ani — fă maxim posibil textul și lasă minim spațiile goale».
// Posterul îngust (pe telefon imaginea se întinde pe lățimea ecranului, deci textul iese de ~1,6× mai mare decât la
// 1000), fără subtitlu și fără carduri. Apoi: «fă maxim posibil mare tot ce e legat de norme, mașini și devieri» —
// tabelul mașinilor are doar mașina, cele trei norme și abaterea (litrii și km-ii stau în sumarul de sus), 18 pt.
const LATIME = 520;
const TABEL = { mare: 18, rand: 36, antet: 14 } as const;
export const GRUP_STRAINI = 'straini';
// «mașini cu foi de parcurs până la utilaje» — tipurile din lde_fuel_consumatori, în ordinea paginii
const TIPURI_STRAINI: [string, string][] = [
  ['masina_foaie', 'Mașini cu foi de parcurs (nu sunt în flotă)'],
  ['masina_statie', 'Mașini doar la stație (străine / vechi)'],
  ['numar_scurt', 'Numere scurte de autobuz'],
  ['vanzare', 'Vânzări'],
  ['benzovoz', 'Benzovoz (motorină mutată, nu consum)'],
  ['consum_intern', 'Consum intern'],
  ['protocol', 'Protocol'],
  ['utilaj', 'Utilaje'],
];
export const GRUP_GENERAL = 'general';
// ordinea postării: cele 6 grupuri de direcții, în afara flotei, apoi posterul general (întotdeauna ultimul)
export const GRUP_IDS = [...GRUPURI.map((g) => g.id), GRUP_STRAINI, GRUP_GENERAL];

const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PRAG_KM = 100;   // sub atâția km pe perioadă l/100 km nu spune nimic
// Sub atâția km într-o lună plinul cade adesea în luna vecină (783MUM, 09.2026: 893 km, 5,6 l/100 = −80 %):
// cifra lunii se arată gri și fără abatere; cea pe 3 luni rămâne.
const PRAG_KM_LUNA = 1000;

export function lunaText(luna: string) { const [y, m] = luna.split('-').map(Number); return `${LUNI[m - 1]} ${y}`; }
function capete(luna: string) {
  const [y, m] = luna.split('-').map(Number);
  const p = (n: number) => String(n).padStart(2, '0');
  const ultima = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d3 = new Date(Date.UTC(y, m - 3, 1));
  return { de: `${y}-${p(m)}-01`, pana: `${y}-${p(m)}-${p(ultima)}`, de3: `${d3.getUTCFullYear()}-${p(d3.getUTCMonth() + 1)}-01` };
}
/** luna încheiată față de o zi (Chișinău): pe 1 octombrie → «2026-09» */
export function lunaTrecuta(azi: string) {
  const [y, m] = azi.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

type Masina = { plate: string; activ: boolean; dir: string; litri: number; km: number;
  fapt: number | null; fapt3: number | null; teoretica: number | null; litriCuKm: number; litriCuKm3: number; km3: number };

// o citire pe lună pentru toate grupurile din aceeași cerere (7 postere într-un apel de ≤ 60 s)
const flotaPeLuna = new Map<string, Promise<Masina[]>>();
function citesteFlota(luna: string) {
  if (!flotaPeLuna.has(luna)) flotaPeLuna.set(luna, citesteFlotaDinBaza(luna).catch((e) => { flotaPeLuna.delete(luna); throw e; }));
  return flotaPeLuna.get(luna)!;
}
async function citesteFlotaDinBaza(luna: string) {
  const sb = getSupabase();
  const { de, pana, de3 } = capete(luna);
  const [a, b] = await Promise.all([
    sb.rpc('lde_fuel_flota', { de, pana }),
    sb.rpc('lde_fuel_flota', { de: de3, pana }),
  ]);
  if (a.error || b.error) throw new Error(`lde_fuel_flota: ${(a.error ?? b.error)!.message}`);
  const trei = new Map<string, any>((b.data ?? []).map((r: any) => [r.vehicle_id, r]));
  const l100 = (l: number, km: number) => (km >= PRAG_KM && l > 0 ? (l / km) * 100 : null);
  return (a.data ?? []).map((r: any): Masina => {
    const t = trei.get(r.vehicle_id);
    const km = Number(r.km), lck = Number(r.litri_cu_km), km3 = Number(t?.km ?? 0), lck3 = Number(t?.litri_cu_km ?? 0);
    return {
      plate: r.plate_number, activ: r.active, dir: r.directions?.[0] ?? '',
      litri: Number(r.benzol_l) + Number(r.foaie_l), km, litriCuKm: lck, km3, litriCuKm3: lck3,
      fapt: l100(lck, km), fapt3: l100(lck3, km3),
      teoretica: r.norma_teoretica != null ? Number(r.norma_teoretica) : null,
    };
  });
}

function abatere(f: number | null, t: number | null): Celula {
  if (f == null || t == null || t <= 0) return { text: '—', culoare: CULORI.griDeschis };
  const p = Math.round(((f - t) / t) * 100) || 0;   // întâi rotunjit, apoi semnul; «|| 0» scoate −0 → altfel «-0 %»
  const rau = p > 10, atent = p > 5, bine = p < -5;
  return { text: `${p > 0 ? '+' : ''}${nf.format(p)} %`, bold: rau,
    culoare: atent ? CULORI.rosu : bine ? CULORI.verde : CULORI.text, fundal: rau ? '#f8e3e0' : undefined };
}
const l100Txt = (v: number | null) => (v == null ? '—' : nf1.format(v));

// Totalurile unui set de mașini: l/100 km = litrii din fereastra cu km / km; teoretica = medie ponderată pe km
function statGrup(m: Masina[]) {
  const sum = (f: (x: Masina) => number) => m.reduce((s, x) => s + f(x), 0);
  const litri = sum((x) => x.litri), km = sum((x) => x.km);
  const fapt = km >= PRAG_KM ? (sum((x) => x.litriCuKm) / km) * 100 : null;
  const km3 = sum((x) => x.km3), fapt3 = km3 >= PRAG_KM ? (sum((x) => x.litriCuKm3) / km3) * 100 : null;
  const cuT = m.filter((x) => x.teoretica != null && x.km > 0);
  const kmT = cuT.reduce((s, x) => s + x.km, 0);
  const teoretica = kmT > 0 ? cuT.reduce((s, x) => s + x.teoretica! * x.km, 0) / kmT : null;
  return { litri, km, fapt, fapt3, teoretica, masini: m.length };
}
const masiniGrup = (toate: Masina[], directii: string[]) =>
  toate.filter((x) => directii.includes(x.dir) && (x.litri > 0 || x.km > 0)).sort((a, b) => b.litri - a.litri);

export async function genereazaGrup(grupId: string, luna: string): Promise<{ png: Buffer; caption: string; randuri: number }> {
  const eticheta = lunaText(luna);
  if (grupId === GRUP_STRAINI) return genereazaStraini(luna, eticheta);
  if (grupId === GRUP_GENERAL) return genereazaGeneral(luna, eticheta);
  const g = GRUPURI.find((x) => x.id === grupId);
  if (!g) throw new Error(`grup necunoscut: ${grupId}`);
  const m = masiniGrup(await citesteFlota(luna), g.directii);
  const { litri, km, fapt, fapt3, teoretica } = statGrup(m);

  const p = poster({ latime: LATIME, supratitlu: 'Combustibil', titlu: g.titlu, eticheta });
  p.total(`${nf.format(litri)} L · ${nf.format(km)} km`, `${m.length} mașini`);
  p.total(`Luna ${l100Txt(fapt)} · 3 luni ${l100Txt(fapt3)}`, `teoretică ${l100Txt(teoretica)}`);
  const cols: Coloana[] = [
    { titlu: 'Mașina', latime: 112 }, { titlu: 'Luna', latime: 60, aliniere: 'end' }, { titlu: '3 luni', latime: 66, aliniere: 'end' },
    { titlu: 'Teor.', latime: 60, aliniere: 'end' }, { titlu: 'Abat.', latime: 74, aliniere: 'end' },
  ];
  p.tabel(cols, m.map((x) => [
    { text: x.plate.replace(/\s+/g, ''), bold: true },
    x.km >= PRAG_KM_LUNA ? { text: l100Txt(x.fapt), bold: true } : { text: l100Txt(x.fapt), culoare: CULORI.griDeschis },
    { text: l100Txt(x.fapt3) },
    { text: l100Txt(x.teoretica), culoare: CULORI.gri },
    x.km >= PRAG_KM_LUNA ? abatere(x.fapt, x.teoretica) : { text: '—', culoare: CULORI.griDeschis },
  ]), { ...TABEL, gol: 'Nicio alimentare în lună' });
  p.nota('Luna, 3 luni, Teor. = litri la 100 km. Roșu = peste normă, verde = sub normă. Gri = sub 1.000 km în lună.');
  const caption = `<b>Combustibil — ${escapeHtml(g.titlu)}</b>, ${eticheta}\n`
    + `${nf.format(litri)} L · ${nf.format(km)} km · <b>${l100Txt(fapt)} l/100 km</b> (3 luni ${l100Txt(fapt3)}, teoretică ${l100Txt(teoretica)})`;
  return { png: await p.png(), caption, randuri: m.length };
}

async function citesteStraini(luna: string) {
  const { de, pana } = capete(luna);
  const { data, error } = await getSupabase().rpc('lde_fuel_consumatori', { de, pana });
  if (error) throw new Error(`lde_fuel_consumatori: ${error.message}`);
  return (data ?? []).filter((r: any) => Number(r.randuri) > 0 && Number(r.randuri_total) >= 4);
}

async function genereazaStraini(luna: string, eticheta: string) {
  const rows = await citesteStraini(luna);
  const p = poster({ latime: LATIME, supratitlu: 'Combustibil', titlu: 'În afara flotei', eticheta });
  let total = 0, n = 0;
  for (const [tip, titlu] of TIPURI_STRAINI) {
    const t = rows.filter((r: any) => r.tip === tip).sort((a: any, b: any) => Number(b.litri) - Number(a.litri));
    if (!t.length) continue;
    const sl = t.reduce((s: number, r: any) => s + Number(r.litri), 0);
    total += sl; n += t.length;
    p.total(titlu, `${t.length} · ${nf.format(sl)} L`);
    p.tabel([
      { titlu: 'Plăcuța / nume', latime: 190 }, { titlu: 'Ori', latime: 50, aliniere: 'end' },
      { titlu: 'Litri', latime: 90, aliniere: 'end' }, { titlu: 'Zilele', latime: 150, aliniere: 'end' },
    ], t.map((r: any) => [
      { text: r.denumire, bold: true }, { text: nf.format(Number(r.randuri)) }, { text: nf.format(Number(r.litri)), bold: true },
      { text: `${String(r.prima_p).slice(8, 10)}.${String(r.prima_p).slice(5, 7)} – ${String(r.ultima_p).slice(8, 10)}.${String(r.ultima_p).slice(5, 7)}`, culoare: CULORI.gri },
    ]), TABEL);
  }
  p.total(`Total: ${nf.format(total)} L`, `${n} plăcuțe / nume`);
  const caption = `<b>Combustibil — în afara flotei</b>, ${eticheta}\n${nf.format(total)} L pe ${n} plăcuțe / denumiri`;
  return { png: await p.png(), caption, randuri: n };
}

// Posterul general (Ion, 29.09: «la sfârșit să fie întotdeauna un poster general la al 8-lea»): un rând pe grup de
// direcții cu aceleași trei norme, apoi tipurile din afara flotei și totalul.
async function genereazaGeneral(luna: string, eticheta: string) {
  const toate = await citesteFlota(luna);
  const grupuri = GRUPURI.map((g) => ({ g, st: statGrup(masiniGrup(toate, g.directii)) })).filter((x) => x.st.litri > 0 || x.st.km > 0);
  const flota = statGrup(toate.filter((x) => GRUPURI.some((g) => g.directii.includes(x.dir)) && (x.litri > 0 || x.km > 0)));
  const str = await citesteStraini(luna);
  const peTip = TIPURI_STRAINI.map(([tip, titlu]) => {
    const t = str.filter((r: any) => r.tip === tip);
    return { titlu, n: t.length, litri: t.reduce((s: number, r: any) => s + Number(r.litri), 0) };
  }).filter((x) => x.n > 0);
  const totalStraini = peTip.reduce((s, x) => s + x.litri, 0);

  const p = poster({ latime: LATIME, supratitlu: 'Combustibil', titlu: 'General', eticheta });
  p.total(`Total: ${nf.format(flota.litri + totalStraini)} L`, `flota ${nf.format(flota.litri)}`);
  // litri la 100 km pe direcție; litrii și km pe direcție stau pe posterele direcțiilor
  p.tabel([
    { titlu: 'Direcția', latime: 150 },
    { titlu: 'Luna', latime: 60, aliniere: 'end' }, { titlu: '3 luni', latime: 66, aliniere: 'end' },
    { titlu: 'Teor.', latime: 60, aliniere: 'end' }, { titlu: 'Abat.', latime: 74, aliniere: 'end' },
  ], [
    ...grupuri.map(({ g, st }) => [
      { text: g.scurt, bold: true },
      { text: l100Txt(st.fapt), bold: true }, { text: l100Txt(st.fapt3) }, { text: l100Txt(st.teoretica), culoare: CULORI.gri },
      abatere(st.fapt, st.teoretica),
    ] as Celula[]),
    [
      { text: 'Flota', bold: true, culoare: CULORI.bordoInchis },
      { text: l100Txt(flota.fapt), bold: true }, { text: l100Txt(flota.fapt3), bold: true },
      { text: l100Txt(flota.teoretica), bold: true }, abatere(flota.fapt, flota.teoretica),
    ] as Celula[],
  ], TABEL);
  p.tabel([{ titlu: 'În afara flotei', latime: 330 }, { titlu: 'Litri', latime: 140, aliniere: 'end' }],
    [...peTip.map((x) => [{ text: x.titlu.replace(/ \(.*\)$/, '') }, { text: nf.format(x.litri), bold: true }] as Celula[]),
     [{ text: 'Total', bold: true, culoare: CULORI.bordoInchis }, { text: nf.format(totalStraini), bold: true }] as Celula[]],
    { ...TABEL, gol: 'Nimic în afara flotei în lună' });
  p.nota('Luna, 3 luni, Teor. = litri la 100 km. Vânzările și benzovozul nu sunt consum.');
  const caption = `<b>Combustibil — general</b>, ${eticheta}\n`
    + `Flota ${nf.format(flota.litri)} L · <b>${l100Txt(flota.fapt)} l/100 km</b> (3 luni ${l100Txt(flota.fapt3)}, teoretică ${l100Txt(flota.teoretica)}) · în afara flotei ${nf.format(totalStraini)} L`;
  return { png: await p.png(), caption, randuri: grupuri.length };
}

/** Mesajul de după postere: ce sunt, cum se citesc, când vin. */
export function textIntroducere(luna: string) {
  const e = lunaText(luna);
  return [
    `<b>DT — raportul de combustibil pe ${e}</b>`,
    '',
    'Mai sus sunt 8 postere: câte unul pe Interurban, Drăxlmaier, SEBN (Orhei + Strășeni), LEAR (Ungheni + Florești), '
      + 'Trox + suburban Briceni și Camioane; unul cu tot ce s-a alimentat în afara flotei (mașini cu foi, vânzări, consum intern, '
      + 'protocol, utilaje); ultimul, posterul general cu toate direcțiile și totalul.',
    '',
    '<b>Cum se citesc:</b>',
    '• <b>l/100 luna</b> — norma faptică a lunii: litrii (stațiile benzol + foile de parcurs LDE) împărțiți la km (GPS).',
    '• <b>l/100 3 luni</b> — norma faptică pe ultimele 3 luni; mai sigură, fiindcă plinul nu cade mereu în aceeași lună.',
    '• <b>Teoretică</b> — norma tipului mașinii.',
    '• <b>Abatere</b> — luna față de norma teoretică: roșu peste +5 %, fond roșu peste +10 %, verde sub −5 %. '
      + 'Mașinile cu sub 1.000 km în lună au cifra gri — se judecă după 3 luni.',
    '',
    'Raportul vine aici pe 25 ale fiecărei luni, pentru luna trecută. Detaliile pe fiecare alimentare: pagina «Combustibil» din LDE.',
  ].join('\n');
}

export interface TrimitereCombustibil { grup: string; status: 'sent' | 'skipped' | 'error'; randuri?: number; reason?: string; messageId?: number | null }

/** Trimite posterele lunii în grupă; idempotent pe grup și lună (app_config combustibil_poster_last_<grup>). */
export async function trimitePostereCombustibil(opts: { luna: string; grupuri?: string[]; force?: boolean }): Promise<TrimitereCombustibil[]> {
  const sb = getSupabase();
  const cfg = async (key: string) => {
    const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle();
    return ((data as { value?: string } | null)?.value ?? '').trim() || null;
  };
  const chatId = await cfg(COMBUSTIBIL_POSTER_CHAT_KEY);
  const threadId = Number(await cfg(COMBUSTIBIL_POSTER_THREAD_KEY)) || null;
  const ids = opts.grupuri?.length ? opts.grupuri : GRUP_IDS;
  flotaPeLuna.delete(opts.luna);   // instanța poate trăi între apeluri — cifrele se citesc proaspăt
  if (!chatId) return ids.map((grup) => ({ grup, status: 'skipped' as const, reason: `grupa nu e setată (app_config.${COMBUSTIBIL_POSTER_CHAT_KEY})` }));
  const out: TrimitereCombustibil[] = [];
  for (const grup of ids) {
    try {
      if (!opts.force && (await cfg(MARCA_KEY(grup))) === opts.luna) { out.push({ grup, status: 'skipped', reason: 'luna a plecat deja' }); continue; }
      const { png, caption, randuri } = await genereazaGrup(grup, opts.luna);
      if (!randuri) { out.push({ grup, status: 'skipped', randuri, reason: 'nimic în lună' }); continue; }
      const sent = await sendTelegramPhoto(chatId, png, caption, `combustibil-${grup}-${opts.luna}.png`, threadId);
      if (!sent.ok) { out.push({ grup, status: 'error', randuri, reason: 'Telegram a refuzat poza' }); continue; }
      await sb.from('app_config').upsert({ key: MARCA_KEY(grup), value: opts.luna }, { onConflict: 'key' });
      out.push({ grup, status: 'sent', randuri, messageId: sent.messageId });
    } catch (e) {
      out.push({ grup, status: 'error', reason: e instanceof Error ? e.message : String(e) });
    }
  }
  // după toate posterele, o singură dată pe lună: mesajul de introducere (doar la trimiterea întreagă, fără erori)
  const toate = !opts.grupuri?.length || GRUP_IDS.every((g) => opts.grupuri!.includes(g));
  if (toate && out.some((x) => x.status === 'sent') && !out.some((x) => x.status === 'error')
      && (opts.force || (await cfg(MARCA_INTRO_KEY)) !== opts.luna)) {
    const ok = await sendTelegram(chatId, textIntroducere(opts.luna), undefined, threadId);
    if (ok) await sb.from('app_config').upsert({ key: MARCA_INTRO_KEY, value: opts.luna }, { onConflict: 'key' });
    out.push({ grup: 'introducere', status: ok ? 'sent' : 'error', reason: ok ? undefined : 'Telegram a refuzat mesajul' });
  }
  return out;
}
