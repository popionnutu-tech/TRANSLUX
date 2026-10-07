import { getSupabase } from '../supabase';
import { sendTelegramPhoto, sendTelegramAlbum, sendTelegramTextSigur, pinTelegramMessage, escapeHtml } from '../telegram-notify';
import { normeleConfirmate, primaZi, type StareBucata } from './norma-luna';
import { poster, CULORI, type Celula, type Coloana } from '../poster-sablon';
import { COMBUSTIBIL_POSTER_CONFIG_KEY, COMBUSTIBIL_POSTER_THREAD_CONFIG_KEY } from '@translux/db';

/**
 * Posterul lunar de combustibil (ION-138). Ion, 29.09.2026: «raport automatizat în format poster lunar, pe fiecare
 * direcție — LEAR să fie împreună, SEBN-urile împreună, Trox și Briceni tot împreună, și mașini cu foi de parcurs
 * până la utilaje tot să fie într-o poză. Acolo unde este norma: 1. norma factică luna curentă, 2. norma factică
 * ultimele 3 luni, 3. norma teoretică».
 *
 * O imagine pe grup. Cifrele vin din aceleași funcții ca pagina /lde/combustibil (migr. 435–437):
 * lde_fuel_flota(lună) — l/100 km = litrii din fereastra cu km / km; norma = lde_fuel_norma_eb (ION-154); lde_fuel_consumatori
 * pentru tot ce e în afara flotei. Norma teoretică = norma tipului mașinii (lde_vehicle_types).
 *
 * Ion, 29.09 (a doua parte): postarea merge în grupa P9, tabul «DT», pe 25 ale lunii pentru luna trecută; «la sfârșit
 * să fie întotdeauna un poster general, al 8-lea»; după toate, un mesaj de introducere.
 */

// Grupa P9 și tabul ei «DT» (message_thread_id); fără grupă setată nu pleacă nimic — nu în altă grupă
export const COMBUSTIBIL_POSTER_CHAT_KEY = COMBUSTIBIL_POSTER_CONFIG_KEY;          // /lega_dt în bot
export const COMBUSTIBIL_POSTER_THREAD_KEY = COMBUSTIBIL_POSTER_THREAD_CONFIG_KEY;
const MARCA_ALBUM_KEY = 'combustibil_poster_album_last';

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
// Ion, 29.09 (a treia oară): «în fiecare poză să fie câți km a mers și câți litri a luat în perioadă» — litrii și km-ii
// înapoi pe fiecare mașină; 7 coloane încap la 600 cu 16 pt.
const LATIME = 600;
const TABEL = { mare: 16, rand: 34, antet: 13 } as const;
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

type Nivel = 'investigatie' | 'supraveghere' | 'sub' | null;
type Masina = { id: string; plate: string; activ: boolean; dir: string; litri: number; km: number;
  fapt: number | null; fapt3: number | null; teoretica: number | null; litriCuKm: number; litriCuKm3: number; km3: number;
  /** de unde vine norma — cele 3 luni dinainte trase spre tip (ION-154), norma de până acum (*) sau aleasă de Clava și
   *  confirmată de Ion pe panoul normelor (✓, Ion 07.10.2026) */
  sursaNorma?: 'eb' | 'veche' | 'clava';
  /** norma e umflată: mașina consumă de 3 luni cu peste 15 % mai mult decât mașinile de același tip (!) */
  umflata?: boolean;
  /** abaterea în litri față de pragul ION-154 */
  nivel?: Nivel };

// ION-154 (Ion, 01.10.2026, după analiza ION-151 în 3 runde Claude + Codex): norma lunii = consumul mașinii în cele 3 luni
// ÎNCHISE de dinaintea lunii, tras spre mașinile de același tip (lde_fuel_norma_eb, migr. 447). Până acum norma era plin la
// plin până la sfârșitul lunii judecate, deci mașina care ardea mult își ridica singură norma (aug.: 4 din 15 mașini ascunse).
// Abaterea se judecă în litri: D = litri − normă·km/100; q = alimentarea tipică pe zi a mașinii (P90 în cele 3 luni).
//   supraveghere: D > max(15 % din normă·km, 2q); investigație: D > max(20 %, 2q) sau supraveghere și luna trecută;
//   sub normă cu mult (D < −max(15 %, 2q)) = de verificat km și foile, nu «bine». Camioanele nu primesc culoare lunară
//   (eroarea pe o lună e 17–26 % la orice metodă), se judecă pe 3 luni.
// Coloana «Din iunie» = plin la plin de la 10.06 (control), doar cu ≥ 3 intervale și ≥ 3.000 km.
const PLIN_DE_LA = '2026-06-10';
const PLIN_MIN_INTERVALE = 3;
const PLIN_MIN_KM = 3000;
const UMFLATA = 1.15;

// o citire pe lună pentru toate grupurile din aceeași cerere (7 postere într-un apel de ≤ 60 s)
const flotaPeLuna = new Map<string, Promise<Masina[]>>();
/** Instanța caldă poate trăi între apeluri: înainte de o trimitere / previzualizare cifrele (și norma Clavei) se citesc din nou.
 *  (Până la 07.10 se ștergea `delete(luna)`, dar cheia e `luna:true/false` — nu se ștergea nimic.) */
export function golesteCacheFlota() { flotaPeLuna.clear(); }
function citesteFlota(luna: string, cuLunaTrecuta = true) {
  const cheie = `${luna}:${cuLunaTrecuta}`;
  if (!flotaPeLuna.has(cheie)) flotaPeLuna.set(cheie, citesteFlotaDinBaza(luna, cuLunaTrecuta).catch((e) => { flotaPeLuna.delete(cheie); throw e; }));
  return flotaPeLuna.get(cheie)!;
}
async function citesteFlotaDinBaza(luna: string, cuLunaTrecuta: boolean) {
  const sb = getSupabase();
  const { de, pana } = capete(luna);
  const [a, eb, trecuta, aleseClava] = await Promise.all([
    sb.rpc('lde_fuel_flota', { de, pana }),
    sb.rpc('lde_fuel_norma_eb', { luna: de }),
    cuLunaTrecuta ? citesteFlota(lunaTrecuta(de), false) : Promise.resolve([] as Masina[]),
    normeleConfirmate(luna),   // Ion, 07.10.2026: norma Clavei, doar pe luna confirmată de el
  ]);
  if (a.error) throw new Error(`lde_fuel_flota: ${a.error.message}`);
  if (eb.error) throw new Error(`lde_fuel_norma_eb: ${eb.error.message}`);
  const norme = new Map<string, any>((eb.data ?? []).map((r: any) => [r.vehicle_id, r]));
  const supraTrecuta = new Set(trecuta.filter((x) => x.nivel === 'supraveghere' || x.nivel === 'investigatie').map((x) => x.id));
  const cuLitri = (a.data ?? []).filter((r: any) => Number(r.benzol_l) + Number(r.foaie_l) > 0 || Number(r.km) > 0).map((r: any) => r.vehicle_id);
  const pl = cuLitri.length ? await sb.rpc('lde_fuel_plin_la_plin', { de: PLIN_DE_LA, pana, vehicule: cuLitri }) : { data: [], error: null };
  if (pl.error) throw new Error(`lde_fuel_plin_la_plin: ${pl.error.message}`);
  const plin = new Map<string, any>((pl.data ?? []).map((r: any) => [r.vehicle_id, r]));
  const l100 = (l: number, km: number) => (km >= PRAG_KM && l > 0 ? (l / km) * 100 : null);
  // ION-162: luna camionului = cursele pornite în ea, până la plinul următor (km doar din GPS) — litrii afișați sunt ai curselor;
  // plinul din 31 pentru cursa din luna următoare nu mai apare aici. Camionul fără GPS în lună (fără tracker) păstrează litrii
  // calendaristici, ca să se vadă «fără km».
  const litriLuna = (r: any, dir: string) => (dir === 'camioane' && (r.fereastra_de != null || Number(r.km_zile_gps) > 0)
    ? Number(r.litri_cu_km) : Number(r.benzol_l) + Number(r.foaie_l));
  return (a.data ?? []).map((r: any): Masina => {
    const km = Number(r.km), lck = Number(r.litri_cu_km);
    const dir = r.directions?.[0] ?? '';
    const m: Masina = {
      id: r.vehicle_id, plate: r.plate_number, activ: r.active, dir,
      litri: litriLuna(r, dir), km, litriCuKm: lck, km3: 0, litriCuKm3: 0,
      fapt: l100(lck, km), fapt3: null, teoretica: null,
    };
    // «din iunie»: plin la plin; totalurile grupului se adună pe litrii și km-ii intervalelor
    const p = plin.get(r.vehicle_id);
    if (p && Number(p.intervale) >= PLIN_MIN_INTERVALE && Number(p.km) >= PLIN_MIN_KM) {
      m.km3 = Number(p.km); m.litriCuKm3 = Number(p.litri); m.fapt3 = Number(p.consum);
    }
    const n = norme.get(r.vehicle_id);
    const clava = aleseClava.get(r.vehicle_id);
    if (clava != null) {
      m.teoretica = clava; m.sursaNorma = 'clava';   // «!» (normă umflată) nu se pune pe cifra aleasă de om
    } else if (n?.norma != null) {
      m.teoretica = Number(n.norma); m.sursaNorma = n.sursa === 'eb' ? 'eb' : 'veche';
      m.umflata = n.sursa === 'eb' && n.r_masina != null && n.r_tip != null && Number(n.r_masina) > UMFLATA * Number(n.r_tip);
    } else m.sursaNorma = 'veche';
    if (dir !== 'camioane' && km >= PRAG_KM_LUNA && m.teoretica != null) {
      const prev = (m.teoretica * km) / 100, d = lck - prev, q2 = 2 * Number(n?.q ?? 0);
      const p15 = Math.max(0.15 * prev, q2), p20 = Math.max(0.2 * prev, q2);
      m.nivel = d > p20 || (d > p15 && supraTrecuta.has(m.id)) ? 'investigatie' : d > p15 ? 'supraveghere' : d < -p15 ? 'sub' : null;
    }
    return m;
  });
}

/** Abaterea în %; culoarea vine din pragul în litri (ION-154): roșu = supraveghere, fond roșu = investigație, gri = sub normă cu mult. */
function abatere(f: number | null, t: number | null, nivel?: Nivel, faraCuloare = false): Celula {
  if (f == null || t == null || t <= 0) return { text: '—', culoare: CULORI.griDeschis };
  const p = Math.round(((f - t) / t) * 100) || 0;   // întâi rotunjit, apoi semnul; «|| 0» scoate −0 → altfel «-0 %»
  const text = `${p > 0 ? '+' : ''}${nf.format(p)} %`;
  if (faraCuloare) return { text, culoare: CULORI.gri };
  if (nivel === 'investigatie') return { text, bold: true, culoare: CULORI.rosu, fundal: '#f8e3e0' };
  if (nivel === 'supraveghere') return { text, bold: true, culoare: CULORI.rosu };
  if (nivel === 'sub') return { text, culoare: CULORI.gri };
  return { text, culoare: CULORI.text };
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
  const cam = g.id === 'camioane';

  const p = poster({ latime: LATIME, supratitlu: 'Combustibil', titlu: g.titlu, eticheta });
  p.total(`${nf.format(litri)} L · ${nf.format(km)} km`, `${m.length} mașini`);
  p.total(`Luna ${l100Txt(fapt)} · din iunie ${l100Txt(fapt3)}`, `normă ${l100Txt(teoretica)}`);
  const cols: Coloana[] = [
    { titlu: 'Mașina', latime: 104 }, { titlu: 'Litri', latime: 64, aliniere: 'end' }, { titlu: 'Km', latime: 70, aliniere: 'end' },
    { titlu: 'Luna', latime: 54, aliniere: 'end' }, { titlu: 'Din iunie', latime: 62, aliniere: 'end' },
    { titlu: 'Normă', latime: 56, aliniere: 'end' }, { titlu: 'Abat.', latime: 64, aliniere: 'end' },
  ];
  p.tabel(cols, m.map((x) => [
    { text: x.plate.replace(/\s+/g, ''), bold: true },
    { text: nf.format(x.litri) }, { text: nf.format(x.km), culoare: CULORI.gri },
    x.km >= PRAG_KM_LUNA ? { text: l100Txt(x.fapt), bold: true } : { text: l100Txt(x.fapt), culoare: CULORI.griDeschis },
    { text: l100Txt(x.fapt3) },
    { text: l100Txt(x.teoretica) + (x.sursaNorma === 'veche' && x.teoretica != null ? '*' : '') + (x.sursaNorma === 'clava' ? '✓' : '') + (x.umflata ? '!' : ''),
      culoare: x.umflata ? CULORI.rosu : CULORI.gri, bold: x.umflata },
    // ION-151: motorină luată fără niciun km (fără GPS / fără drept Wialon) — nimeni n-o poate verifica
    x.km >= PRAG_KM_LUNA ? abatere(x.fapt, x.teoretica, x.nivel, cam)
      : x.km === 0 && x.litri > 0 ? { text: 'fără km', bold: true, culoare: CULORI.rosu } : { text: '—', culoare: CULORI.griDeschis },
  ]), { ...TABEL, gol: 'Nicio alimentare în lună' });
  p.nota(cam
    ? 'Litri la 100 km. Normă = consumul din cele 3 luni dinainte. Luna = cursele pornite în lună, până la plinul următor (km din GPS). Camioanele se judecă pe 3 luni, nu pe o lună. ! = peste celelalte camioane. «Fără km» = motorină fără GPS.'
    : 'Litri la 100 km. Normă = consumul din cele 3 luni dinainte, față de mașinile de același model'
      + (m.some((x) => x.sursaNorma === 'clava') ? '; ✓ = normă aleasă de Clava și confirmată' : '')
      + '. Roșu = mult peste normă, fond roșu = de cercetat. ! = de 3 luni peste mașinile de același model. Gri = sub 1.000 km. «Fără km» = motorină fără GPS.');
  const caption = `<b>Combustibil — ${escapeHtml(g.titlu)}</b>, ${eticheta}\n`
    + `${nf.format(litri)} L · ${nf.format(km)} km · <b>${l100Txt(fapt)} l/100 km</b> (din iunie ${l100Txt(fapt3)}, normă ${l100Txt(teoretica)})`;
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
  // Ion, 29.09: «la general nu ajunge totalul pe fiecare direcție» — litrii direcției, lângă cele trei norme
  p.tabel([
    { titlu: 'Direcția', latime: 138 }, { titlu: 'Litri', latime: 86, aliniere: 'end' },
    { titlu: 'Luna', latime: 56, aliniere: 'end' }, { titlu: 'Din iunie', latime: 66, aliniere: 'end' },
    { titlu: 'Normă', latime: 58, aliniere: 'end' }, { titlu: 'Abat.', latime: 66, aliniere: 'end' },
  ], [
    ...grupuri.map(({ g, st }) => [
      { text: g.scurt, bold: true }, { text: nf.format(st.litri), bold: true },
      { text: l100Txt(st.fapt), bold: true }, { text: l100Txt(st.fapt3) }, { text: l100Txt(st.teoretica), culoare: CULORI.gri },
      abatere(st.fapt, st.teoretica),
    ] as Celula[]),
    [
      { text: 'Flota', bold: true, culoare: CULORI.bordoInchis }, { text: nf.format(flota.litri), bold: true, culoare: CULORI.bordoInchis },
      { text: l100Txt(flota.fapt), bold: true }, { text: l100Txt(flota.fapt3), bold: true },
      { text: l100Txt(flota.teoretica), bold: true }, abatere(flota.fapt, flota.teoretica),
    ] as Celula[],
  ], TABEL);
  p.tabel([{ titlu: 'În afara flotei', latime: 330 }, { titlu: 'Litri', latime: 140, aliniere: 'end' }],
    [...peTip.map((x) => [{ text: x.titlu.replace(/ \(.*\)$/, '') }, { text: nf.format(x.litri), bold: true }] as Celula[]),
     [{ text: 'Total', bold: true, culoare: CULORI.bordoInchis }, { text: nf.format(totalStraini), bold: true }] as Celula[]],
    { ...TABEL, gol: 'Nimic în afara flotei în lună' });
  p.nota('Litri la 100 km. Din iunie = plin la plin. Normă = consumul din cele 3 luni dinainte. Vânzările și benzovozul nu sunt consum.');
  const caption = `<b>Combustibil — general</b>, ${eticheta}\n`
    + `Flota ${nf.format(flota.litri)} L · <b>${l100Txt(flota.fapt)} l/100 km</b> (din iunie ${l100Txt(flota.fapt3)}, normă ${l100Txt(flota.teoretica)}) · în afara flotei ${nf.format(totalStraini)} L`;
  return { png: await p.png(), caption, randuri: grupuri.length };
}

/** Mesajul de după postere: ce sunt, cum se citesc, când vin. */
// Ion, 29.09: «textul — învață să trimiți succint și minimalist». Trei rânduri, fără explicații lungi.
export function textIntroducere(luna: string) {
  return [
    `<b>DT · combustibil · ${lunaText(luna)}</b>`,
    'Litri la 100 km. Normă = consumul din cele 3 luni dinainte; ✓ = normă aleasă de Clava, confirmată. Roșu = mult peste normă, fond roșu = de cercetat.',
    'Detalii: LDE → Combustibil. Raportul pleacă după confirmarea normelor lunii.',
  ].join('\n');
}

export type Bucata = 'album' | 'general' | 'introducere';
export const BUCATI: Bucata[] = ['album', 'general', 'introducere'];
export type StarePoster = Record<Bucata, StareBucata>;
export type RezultatRecuperare = { luna: string; status: 'asteapta_confirmarea' | 'trimis' | 'partial' | 'nimic_de_trimis' | 'eroare';
  stare?: StarePoster; motiv?: string };
type Poza = { png: Buffer; caption: string; filename: string };
type Raspuns = { ok: boolean; refuzat?: boolean; messageId?: number | null };

/** Transportul și starea, injectabile în test (fără Telegram și fără bază). */
export type DepsPoster = {
  citesteStare(luna: string): Promise<{ confirmat: boolean; stare: StarePoster } | null>;
  scrieStare(luna: string, stare: StarePoster, motiv: string | null, gata: boolean): Promise<void>;
  /** trece bucata în «in_curs» DOAR dacă e încă în starea citită (un singur UPDATE) — două trimiteri deodată nu dublează */
  ia(luna: string, bucata: Bucata, din: StareBucata, stareNoua: StarePoster): Promise<boolean>;
  grupa(): Promise<{ chatId: string; threadId: number | null } | null>;
  pregateste(luna: string): Promise<{ album: Poza[]; general: Poza | null }>;
  trimiteAlbum(chatId: string, poze: Poza[], threadId: number | null): Promise<Raspuns>;
  trimiteFoto(chatId: string, poza: Poza, threadId: number | null): Promise<Raspuns>;
  trimiteText(chatId: string, text: string, threadId: number | null): Promise<Raspuns>;
};

const STARE_GOALA: StarePoster = { album: 'netrimis', general: 'netrimis', introducere: 'netrimis' };

/**
 * Trimite posterul unei luni CONFIRMATE de Ion, bucată cu bucată (album → general → introducere), cu stare în bază
 * (lde_norma_luna_confirmare.poster_rezultat). Plan 2026-10-07, rundele Codex 2–3:
 *  - fiecare bucată trece în «in_curs» ÎNAINTE de trimitere; după răspuns: ok | refuzat (Telegram a zis sigur «nu») |
 *    incert (timeout / rețea / proces oprit — poate a plecat);
 *  - recuperarea automată (cron, «Trimite din nou») trimite DOAR bucățile «netrimis» / «refuzat»; «in_curs» / «incert»
 *    le hotărăște Ion pe panou («A plecat» sau «Retrimite» = `explicit`);
 *  - o bucată nereușită oprește lanțul (generalul nu pleacă fără album, introducerea nu pleacă fără general).
 */
export async function recupereazaPoster(luna: string, opts: { explicit?: Bucata[] } = {}, deps: DepsPoster = depsReale): Promise<RezultatRecuperare> {
  const st = await deps.citesteStare(luna);
  if (!st?.confirmat) return { luna, status: 'asteapta_confirmarea' };
  const stare: StarePoster = { ...STARE_GOALA, ...st.stare };
  const explicit = new Set(opts.explicit ?? []);
  const deTrimis = (b: Bucata) => explicit.has(b) || stare[b] === 'netrimis' || stare[b] === 'refuzat';
  // lanțul se reia de la prima bucată care nu e «ok»; dacă aceea nu se poate retrimite automat, nu pleacă nimic
  const prima = BUCATI.find((b) => stare[b] !== 'ok');
  if (!prima) return { luna, status: 'trimis', stare };
  if (!deTrimis(prima)) {
    return { luna, status: 'nimic_de_trimis', stare,
      motiv: `${prima}: rezultat nesigur — verifică în grupă și alege «A plecat» sau «Retrimite»` };
  }
  const g = await deps.grupa();
  if (!g) { await deps.scrieStare(luna, stare, 'grupa nu e setată — /lega_dt în bot', false); return { luna, status: 'eroare', stare, motiv: 'grupa nu e setată — /lega_dt în bot' }; }

  let poze: { album: Poza[]; general: Poza | null } | null = null;
  if (deTrimis('album') || deTrimis('general')) {
    try { poze = await deps.pregateste(luna); } catch (e) {
      const motiv = `posterele nu s-au generat: ${e instanceof Error ? e.message : String(e)}`;
      await deps.scrieStare(luna, stare, motiv, false);
      return { luna, status: 'eroare', stare, motiv };
    }
  }
  let motiv: string | null = null;
  for (const b of BUCATI) {
    if (!deTrimis(b)) { if (stare[b] !== 'ok') break; continue; }   // bucata dinainte nu e ok → nu se sare peste ea
    const din = stare[b];
    stare[b] = 'in_curs';
    if (!(await deps.ia(luna, b, din, stare))) {
      stare[b] = din;
      return { luna, status: 'eroare', stare, motiv: `${b}: altă trimitere e deja în curs` };
    }
    let r: Raspuns;
    if (b === 'album') {
      const a = poze!.album;
      r = a.length === 0 ? { ok: true } : a.length === 1 ? await deps.trimiteFoto(g.chatId, a[0], g.threadId) : await deps.trimiteAlbum(g.chatId, a, g.threadId);
    } else if (b === 'general') {
      r = poze!.general ? await deps.trimiteFoto(g.chatId, poze!.general, g.threadId) : { ok: true };
    } else {
      r = await deps.trimiteText(g.chatId, textIntroducere(luna), g.threadId);
    }
    stare[b] = r.ok ? 'ok' : r.refuzat ? 'refuzat' : 'incert';
    if (!r.ok) motiv = `${b}: ${r.refuzat ? 'Telegram a refuzat' : 'rezultat nesigur (timeout / rețea) — verifică în grupă'}`;
    const gata = BUCATI.every((x) => stare[x] === 'ok');
    await deps.scrieStare(luna, stare, motiv, gata);
    if (!r.ok) break;
  }
  const gata = BUCATI.every((x) => stare[x] === 'ok');
  return { luna, status: gata ? 'trimis' : 'partial', stare, motiv: motiv ?? undefined };
}

const depsReale: DepsPoster = {
  async citesteStare(luna) {
    const { data, error } = await getSupabase().from('lde_norma_luna_confirmare').select('poster_rezultat').eq('luna', primaZi(luna)).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { confirmat: true, stare: (data as any).poster_rezultat as StarePoster } : null;
  },
  async scrieStare(luna, stare, motiv, gata) {
    const sb = getSupabase();
    const { error } = await sb.from('lde_norma_luna_confirmare')
      .update({ poster_rezultat: stare, poster_motiv: motiv, ...(gata ? { poster_trimis_la: new Date().toISOString() } : {}) })
      .eq('luna', primaZi(luna));
    if (error) throw new Error(error.message);
    // marcajul vechi (folosit până la 07.10 ca anti-dublură pe lună) rămâne la zi, pentru cine îl citește
    if (gata) await sb.from('app_config').upsert({ key: MARCA_ALBUM_KEY, value: luna }, { onConflict: 'key' });
  },
  async ia(luna, bucata, din, stareNoua) {
    const { data, error } = await getSupabase().from('lde_norma_luna_confirmare')
      .update({ poster_rezultat: stareNoua, poster_motiv: null })
      .eq('luna', primaZi(luna)).eq(`poster_rezultat->>${bucata}`, din).select('luna');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  },
  async grupa() {
    const sb = getSupabase();
    const cfg = async (key: string) => {
      const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle();
      return ((data as { value?: string } | null)?.value ?? '').trim() || null;
    };
    const chatId = await cfg(COMBUSTIBIL_POSTER_CHAT_KEY);
    return chatId ? { chatId, threadId: Number(await cfg(COMBUSTIBIL_POSTER_THREAD_KEY)) || null } : null;
  },
  async pregateste(luna) {
    golesteCacheFlota();   // cifrele și norma Clavei proaspete
    const album: Poza[] = []; let general: Poza | null = null;
    for (const grup of GRUP_IDS) {
      const { png, caption, randuri } = await genereazaGrup(grup, luna);   // o eroare aici oprește tot, înainte de orice trimitere
      if (!randuri) continue;
      const p = { png, caption, filename: `combustibil-${grup}-${luna}.png` };
      if (grup === GRUP_GENERAL) general = p; else album.push(p);
    }
    return { album, general };
  },
  async trimiteAlbum(chatId, poze, threadId) {
    const r = await sendTelegramAlbum(chatId, poze, threadId);
    return { ok: r.ok, refuzat: r.refuzat, messageId: r.messageIds[0] ?? null };
  },
  async trimiteFoto(chatId, p, threadId) {
    const r = await sendTelegramPhoto(chatId, p.png, p.caption, p.filename, threadId);
    return { ok: r.ok, refuzat: r.refuzat, messageId: r.messageId };
  },
  async trimiteText(chatId, text, threadId) {
    const r = await sendTelegramTextSigur(chatId, text, threadId);
    if (r.messageId) await pinTelegramMessage(chatId, r.messageId);
    return { ok: r.messageId != null, refuzat: r.refuzat, messageId: r.messageId };
  },
};
