import { getSupabase } from '../supabase';
import { sendTelegramPhoto, escapeHtml } from '../telegram-notify';
import { poster, CULORI, type Celula, type Coloana } from '../poster-sablon';

/**
 * Posterul lunar de combustibil (ION-138). Ion, 29.09.2026: «raport automatizat în format poster lunar, pe fiecare
 * direcție — LEAR să fie împreună, SEBN-urile împreună, Trox și Briceni tot împreună, și mașini cu foi de parcurs
 * până la utilaje tot să fie într-o poză. Acolo unde este norma: 1. norma factică luna curentă, 2. norma factică
 * ultimele 3 luni, 3. norma teoretică».
 *
 * O imagine pe grup. Cifrele vin din aceleași funcții ca pagina /lde/combustibil (migr. 435–437):
 * lde_fuel_flota(lună) și lde_fuel_flota(3 luni) — l/100 km = litrii din fereastra cu km / km; lde_fuel_consumatori
 * pentru tot ce e în afara flotei. Norma teoretică = norma tipului mașinii (lde_vehicle_types).
 */

export const COMBUSTIBIL_POSTER_CHAT_KEY = 'combustibil_poster_chat_id';
const LIVRARE_POSTER_CHAT_KEY = 'livrare_poster_chat_id';   // implicit: grupa posterelor LDE
const MARCA_KEY = (g: string) => `combustibil_poster_last_${g}`;

export const GRUPURI: { id: string; titlu: string; directii: string[] }[] = [
  { id: 'interurban', titlu: 'Interurban', directii: ['interurban'] },
  { id: 'drax', titlu: 'Drăxlmaier Bălți', directii: ['DRAXELMAIER_BALTI'] },
  { id: 'sebn', titlu: 'SEBN Orhei + Strășeni', directii: ['SEBN_ORHEI', 'SEBN_STRASENI'] },
  { id: 'lear', titlu: 'LEAR Ungheni + Florești', directii: ['LEAR_UNGHENI', 'LEAR_FLORESTI'] },
  { id: 'briceni', titlu: 'Trox + suburban Briceni', directii: ['suburban'] },
  { id: 'camioane', titlu: 'Camioane', directii: ['camioane'] },
];
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
export const GRUP_IDS = [...GRUPURI.map((g) => g.id), GRUP_STRAINI];

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
  const p = Math.round(((f - t) / t) * 100);   // întâi rotunjit, apoi semnul — altfel «-0 %»
  const rau = p > 10, atent = p > 5, bine = p < -5;
  return { text: `${p > 0 ? '+' : ''}${nf.format(p)} %`, bold: rau,
    culoare: atent ? CULORI.rosu : bine ? CULORI.verde : CULORI.text, fundal: rau ? '#f8e3e0' : undefined };
}
const l100Txt = (v: number | null) => (v == null ? '—' : nf1.format(v));

export async function genereazaGrup(grupId: string, luna: string): Promise<{ png: Buffer; caption: string; randuri: number }> {
  const eticheta = lunaText(luna);
  if (grupId === GRUP_STRAINI) return genereazaStraini(luna, eticheta);
  const g = GRUPURI.find((x) => x.id === grupId);
  if (!g) throw new Error(`grup necunoscut: ${grupId}`);
  const toate = await citesteFlota(luna);
  const m = toate.filter((x) => g.directii.includes(x.dir) && (x.litri > 0 || x.km > 0))
    .sort((a, b) => b.litri - a.litri);
  const sum = (f: (x: Masina) => number) => m.reduce((s, x) => s + f(x), 0);
  const litri = sum((x) => x.litri), km = sum((x) => x.km);
  const fapt = km >= PRAG_KM ? (sum((x) => x.litriCuKm) / km) * 100 : null;
  const km3 = sum((x) => x.km3), fapt3 = km3 >= PRAG_KM ? (sum((x) => x.litriCuKm3) / km3) * 100 : null;
  const cuT = m.filter((x) => x.teoretica != null && x.km > 0);
  const kmT = cuT.reduce((s, x) => s + x.km, 0);
  const teoretica = kmT > 0 ? cuT.reduce((s, x) => s + x.teoretica! * x.km, 0) / kmT : null;

  const p = poster({ latime: 1000, supratitlu: 'Combustibil pe lună', titlu: g.titlu, eticheta,
    subtitlu: 'Norma faptică = litri (stațiile benzol + foile de parcurs LDE) / km (GPS-ul nostru, altfel km din LDE). '
      + 'Luna, ultimele 3 luni și norma teoretică a tipului mașinii; abaterea = luna față de norma teoretică.' });
  p.carduri([
    { eticheta: 'Motorină', titlu: `${nf.format(litri)} L`, text: `${m.length} mașini`, valoare: `${nf.format(km)} km` },
    { eticheta: 'Norma faptică', titlu: 'Luna', text: eticheta, valoare: fapt != null ? `${nf1.format(fapt)} l/100` : '—' },
    { eticheta: 'Norma faptică', titlu: 'Ultimele 3 luni', text: 'aceleași mașini', valoare: fapt3 != null ? `${nf1.format(fapt3)} l/100` : '—' },
    { eticheta: 'Norma teoretică', titlu: 'Tipul mașinii', text: 'medie pe km', valoare: teoretica != null ? `${nf1.format(teoretica)} l/100` : '—' },
  ]);
  const cols: Coloana[] = [
    { titlu: 'Mașina', latime: 150 }, { titlu: 'Litri', latime: 90, aliniere: 'end' }, { titlu: 'Km', latime: 100, aliniere: 'end' },
    { titlu: 'l/100 luna', latime: 100, aliniere: 'end' }, { titlu: 'l/100 3 luni', latime: 100, aliniere: 'end' },
    { titlu: 'Norma teoretică', latime: 110, aliniere: 'end' }, { titlu: 'Abatere', latime: 90, aliniere: 'end' },
  ];
  p.tabel(cols, m.map((x) => [
    { text: x.plate + (x.activ ? '' : ' · oprită'), bold: true },
    { text: nf.format(x.litri) }, { text: nf.format(x.km), culoare: CULORI.gri },
    x.km >= PRAG_KM_LUNA ? { text: l100Txt(x.fapt), bold: true } : { text: l100Txt(x.fapt), culoare: CULORI.griDeschis },
    { text: l100Txt(x.fapt3) },
    { text: l100Txt(x.teoretica), culoare: CULORI.gri },
    x.km >= PRAG_KM_LUNA ? abatere(x.fapt, x.teoretica) : { text: '—', culoare: CULORI.griDeschis },
  ]), { compact: true, gol: 'Nicio alimentare în lună' });
  p.total(`Total: ${nf.format(litri)} L · ${nf.format(km)} km · ${l100Txt(fapt)} l/100 km`,
    `3 luni ${l100Txt(fapt3)} · teoretică ${l100Txt(teoretica)}`);
  p.nota(`Roșu = peste norma teoretică cu mai mult de 5 % (fond roșu peste 10 %), verde = sub ea cu 5 %. «—» = sub ${PRAG_KM} km `
    + `sau fără tip de mașină. Gri = sub ${nf.format(PRAG_KM_LUNA)} km în lună: plinul cade adesea în luna vecină, se judecă după 3 luni.`
    + ' La camioane km vin din Wialon doar din iunie 2026: l/100 km se ia din prima zi cu km.');
  const caption = `<b>Combustibil — ${escapeHtml(g.titlu)}</b>, ${eticheta}\n`
    + `${nf.format(litri)} L · ${nf.format(km)} km · <b>${l100Txt(fapt)} l/100 km</b> (3 luni ${l100Txt(fapt3)}, teoretică ${l100Txt(teoretica)})`;
  return { png: await p.png(), caption, randuri: m.length };
}

async function genereazaStraini(luna: string, eticheta: string) {
  const sb = getSupabase();
  const { de, pana } = capete(luna);
  const { data, error } = await sb.rpc('lde_fuel_consumatori', { de, pana });
  if (error) throw new Error(`lde_fuel_consumatori: ${error.message}`);
  const rows = (data ?? []).filter((r: any) => Number(r.randuri) > 0 && Number(r.randuri_total) >= 4);
  const p = poster({ latime: 1000, supratitlu: 'Combustibil pe lună', titlu: 'În afara flotei', eticheta,
    subtitlu: 'Tot ce s-a alimentat la stațiile benzol și pe foile LDE pe plăcuțe sau nume care nu sunt în flota noastră: '
      + 'de la mașinile cu foi de parcurs până la utilaje.' });
  let total = 0, n = 0;
  for (const [tip, titlu] of TIPURI_STRAINI) {
    const t = rows.filter((r: any) => r.tip === tip).sort((a: any, b: any) => Number(b.litri) - Number(a.litri));
    if (!t.length) continue;
    const sl = t.reduce((s: number, r: any) => s + Number(r.litri), 0);
    total += sl; n += t.length;
    p.total(titlu, `${t.length} · ${nf.format(sl)} L`);
    p.tabel([
      { titlu: 'Plăcuța / denumirea', latime: 260 }, { titlu: 'Alimentări', latime: 110, aliniere: 'end' },
      { titlu: 'Litri', latime: 120, aliniere: 'end' }, { titlu: 'Prima – ultima', latime: 250 },
    ], t.map((r: any) => [
      { text: r.denumire, bold: true }, { text: nf.format(Number(r.randuri)) }, { text: nf.format(Number(r.litri)), bold: true },
      { text: `${String(r.prima_p).slice(8, 10)}.${String(r.prima_p).slice(5, 7)} – ${String(r.ultima_p).slice(8, 10)}.${String(r.ultima_p).slice(5, 7)}`, culoare: CULORI.gri },
    ]), { compact: true });
  }
  p.total(`Total în afara flotei: ${nf.format(total)} L`, `${n} plăcuțe / denumiri`);
  p.nota('Vânzările și benzovozul nu sunt consum. Variantele de scriere sunt unite (VINZARI = VINZARE = VINZAREA…); '
    + 'scrierile cu mai puțin de 4 alimentări în tot istoricul nu apar. Detaliile: pagina «Combustibil» din LDE.');
  const caption = `<b>Combustibil — în afara flotei</b>, ${eticheta}\n${nf.format(total)} L pe ${n} plăcuțe / denumiri`;
  return { png: await p.png(), caption, randuri: n };
}

export interface TrimitereCombustibil { grup: string; status: 'sent' | 'skipped' | 'error'; randuri?: number; reason?: string; messageId?: number | null }

/** Trimite posterele lunii în grupă; idempotent pe grup și lună (app_config combustibil_poster_last_<grup>). */
export async function trimitePostereCombustibil(opts: { luna: string; grupuri?: string[]; force?: boolean }): Promise<TrimitereCombustibil[]> {
  const sb = getSupabase();
  const cfg = async (key: string) => {
    const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle();
    return ((data as { value?: string } | null)?.value ?? '').trim() || null;
  };
  const chatId = (await cfg(COMBUSTIBIL_POSTER_CHAT_KEY)) ?? (await cfg(LIVRARE_POSTER_CHAT_KEY));
  const ids = opts.grupuri?.length ? opts.grupuri : GRUP_IDS;
  flotaPeLuna.delete(opts.luna);   // instanța poate trăi între apeluri — cifrele se citesc proaspăt
  if (!chatId) return ids.map((grup) => ({ grup, status: 'skipped' as const, reason: `grupa nu e setată (app_config.${COMBUSTIBIL_POSTER_CHAT_KEY})` }));
  const out: TrimitereCombustibil[] = [];
  for (const grup of ids) {
    try {
      if (!opts.force && (await cfg(MARCA_KEY(grup))) === opts.luna) { out.push({ grup, status: 'skipped', reason: 'luna a plecat deja' }); continue; }
      const { png, caption, randuri } = await genereazaGrup(grup, opts.luna);
      if (!randuri) { out.push({ grup, status: 'skipped', randuri, reason: 'nimic în lună' }); continue; }
      const sent = await sendTelegramPhoto(chatId, png, caption, `combustibil-${grup}-${opts.luna}.png`);
      if (!sent.ok) { out.push({ grup, status: 'error', randuri, reason: 'Telegram a refuzat poza' }); continue; }
      await sb.from('app_config').upsert({ key: MARCA_KEY(grup), value: opts.luna }, { onConflict: 'key' });
      out.push({ grup, status: 'sent', randuri, messageId: sent.messageId });
    } catch (e) {
      out.push({ grup, status: 'error', reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
