import { poster, CULORI, type Celula } from '../poster-sablon';
import { perioadaText } from './lear-optimizari-image';
import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { LIVRARE_POSTER_CHAT_KEY } from './livrare-poster';

/**
 * Posterul săptămânal «cât se putea economisi» la Trox + suburbanele Briceni (ION-73). Ion, 25.09.2026:
 * «aplică regulile optimizare SEBN la Trox și suburbane». Aceleași mașini și aceiași șoferi fac și Trox, și
 * suburbanul, deci ziua mașinii e analizată întreagă: cu oameni, gol pe rută, livrare (casă ↔ start), legătura
 * între joburi (nu e economie), brambura (SEBN §11.3). Analiza o scrie VPS-ul, luni, în lde_analiza_reguli
 * (uzina «BRICENI», briceni/cod/saptamanal.sh); aici doar se desenează.
 *
 * Pleacă lunea la 08:00 din lear-saptamanal.sh (VPS) cu ?send=1 (Ion, 26.09); fără send=1 ruta doar întoarce imaginea.
 * Fontul posterului n-are «↔» și «→» (se desenează gol) — pe poster «–».
 * Pe poster: doar km și lei, pe mașină și pe rută — fără casa șoferului, fără locurile și orele ocolurilor, fără nume.
 */
export type Categorie = 'cuOameni' | 'nepotrivita' | 'golRuta' | 'golTure' | 'service' | 'deplasare' | 'livrare' | 'legatura' | 'necunoscut';
export type KmCategorii = Record<Categorie, number>;
export interface RutaFacuta { r: string; nume?: string | null; trox: boolean; curse: number; km: number; zile?: number }
export interface BucataZi { ora: string; cat: Categorie; km: number; brambura: number; golTure?: number; de?: string | null; pana?: string | null; prin?: string[]; r: string | null; motiv: string | null }
export interface ZiMasina {
  z: string; dow: number; total: number; km: KmCategorii; lungimeTrox?: number | null; rute?: RutaFacuta[]; brambura: number; lei: number | null; leiKm: number | null;
  bilant: boolean; dif: number; casaDim: string | null; casaSeara: string | null; bucati: BucataZi[];
}
export interface MasinaBriceni {
  m: string; zile: number; total: number; km: KmCategorii; rute?: RutaFacuta[]; brambura: number; livrareZi: number; lei: number | null; leiZi: number | null;
  steagBrambura: boolean; casa: string | null; deLamurit: number; detalii: ZiMasina[];
}
export interface RutaBriceni { id: string; nume: string; livrare: number; lei: number; masini: string[] }
export interface AnalizaBriceni {
  uzina: 'BRICENI'; saptamina: string; pana_la: string; total: KmCategorii & { brambura: number; lei: number };
  zile: number; zileBilantOk: number; sumaRute: number; masini: MasinaBriceni[]; rute: RutaBriceni[];
  faraTracker: string[]; zileInterurban: string[];
}

const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');
const nr1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
export const BRICENI_POSTER_LAST_KEY = 'briceni_optimizari_poster_last';
export const PRAG_LIVRARE_ZI = 40; // ca la SEBN: pe poster, mașinile cu livrare peste 40 km/zi ies în față

// codul și denumirea rutei pe poster: Coteala 1, 2, 3 au un drum comun (ION-70); Trox cu denumirea din act, fără săgeți
const codRuta = (id: string) => (id === '46+52+53' ? '46, 52, 53' : id);
const numeRutaPoster = (id: string, nume: string | null | undefined) => !nume || nume === id ? ''
  : /^T\d/.test(id) ? nume.replace(/\s*-\s*/g, ' – ').replace(/Sl\.Sireuti/g, 'Sl.-Șirăuți') : `${nume} – Briceni`;

export async function generateBriceniOptimizariImage(a: AnalizaBriceni): Promise<Buffer> {
  const masini = [...a.masini].sort((x, y) => y.km.livrare - x.km.livrare);
  const t = a.total;
  const p = poster({
    latime: 1000,
    supratitlu: 'Trox + rute suburbane Briceni',
    titlu: 'Cât se putea economisi săptămâna trecută',
    subtitlu: 'Livrarea = drumul gol al mașinii de acasă până la prima cursă, seara înapoi acasă și ocolul pe acasă între curse. Se taie cu un șofer din satul de start sau cu mașina care așteaptă la capăt (regula SEBN).',
    eticheta: perioadaText(a.saptamina, a.pana_la),
  });
  // Ion, 26.09: pe pagină a scos coloanele cu oameni / gol / legătură și a cerut rutele cu denumirea — posterul la fel:
  // doar livrarea (economia) și ce rute face mașina
  const cuLivrare = masini.filter((m) => m.km.livrare >= 0.5);
  const peste = cuLivrare.filter((m) => m.livrareZi > PRAG_LIVRARE_ZI);
  const rute = a.rute.filter((r) => r.livrare >= 0.5);
  p.carduri([
    { eticheta: 'Economie posibilă', titlu: 'Livrare casă – start', text: 'Drumul gol de acasă la prima cursă, seara înapoi și ocolul pe acasă între curse.', valoare: `${nr(t.livrare)} km`, subValoare: `≈ ${nr(t.lei)} lei pe săptămână` },
    { eticheta: `Peste ${PRAG_LIVRARE_ZI} km pe zi`, titlu: peste.length ? peste.map((m) => m.m).join(', ') : 'Nicio mașină', text: 'Mașinile la care livrarea zilnică e cea mai mare — primele de lămurit cu șoferul.', valoare: `${peste.length} ${peste.length === 1 ? 'mașină' : 'mașini'}` },
    ...(rute[0] ? [{ eticheta: 'Ruta cu cea mai multă livrare', titlu: `${codRuta(rute[0].id)} ${numeRutaPoster(rute[0].id, rute[0].nume)}`, text: `Mașini: ${rute[0].masini.join(', ')}.`, valoare: `${nr(rute[0].livrare)} km`, subValoare: `≈ ${nr(rute[0].lei)} lei` }] : []),
  ]);
  const ruteFacute = (m: MasinaBriceni) => (m.rute ?? []).map((r) => `${r.trox ? 'Trox ' : ''}${codRuta(r.r)} (${r.zile ?? 0} z)`).join(', ') || '—';
  p.tabel([
    { titlu: 'Mașina', latime: 110 }, { titlu: 'Rute făcute', latime: 360 }, { titlu: 'Zile', latime: 60, aliniere: 'end' },
    { titlu: 'Livrare/zi', latime: 110, aliniere: 'end' }, { titlu: 'Livrare', latime: 100, aliniere: 'end' }, { titlu: 'Lei', latime: 100, aliniere: 'end' },
  ], cuLivrare.map((m) => [
    { text: m.m, bold: true },
    { text: ruteFacute(m), culoare: CULORI.gri },
    { text: String(m.zile), culoare: CULORI.gri },
    { text: nr1(m.livrareZi), bold: m.livrareZi > PRAG_LIVRARE_ZI, culoare: m.livrareZi > PRAG_LIVRARE_ZI ? CULORI.verde : CULORI.text,
      fundal: m.livrareZi > PRAG_LIVRARE_ZI ? CULORI.verdeFundal : undefined },
    { text: nr(m.km.livrare), culoare: CULORI.verde },
    { text: m.lei == null ? '—' : nr(m.lei), culoare: CULORI.gri },
  ]), { gol: 'Nicio mașină cu livrare săptămâna asta.' });
  p.total(`Pe ${cuLivrare.length} mașini: ${nr(t.livrare)} km livrare`, `≈ ${nr(t.lei)} lei pe săptămână`);
  if (rute.length) p.nota(`Livrarea pe rute: ${rute.slice(0, 12).map((r) => `${codRuta(r.id)} ${numeRutaPoster(r.id, r.nume)} ${nr(r.livrare)} km`).join(' · ')}.`);
  p.nota(`Verde = peste ${PRAG_LIVRARE_ZI} km livrare pe zi. Lei = livrare × norma mașinii × prețul ANRE al zilei + reparație + salariu. Brambura (drum pe care mașina n-a mai mers în nicio altă zi) e scăzută din livrare. Ziua fiecărei mașini, de unde încotro: în LDE, Raport livrări, fila Trox + suburban Briceni.`);
  return p.png();
}

/**
 * Posterul săptămânii. Fără `trimite`, doar se desenează și se întoarce (nimic nu pleacă, nicio cheie nu se scrie);
 * cu `trimite`, pleacă în grupa livrărilor o dată pe săptămână (app_config.briceni_optimizari_poster_last).
 */
export async function posterBriceni(o: { saptamina: string; pana_la: string; trimite: boolean; force?: boolean }):
  Promise<{ png: Buffer | null; trimis: boolean; motiv?: string; livrare?: number }> {
  const sb = getSupabase();
  const { data: rap } = await sb.from('lde_analiza_reguli').select('date').eq('uzina', 'BRICENI').eq('saptamina', o.saptamina).maybeSingle();
  const a = rap?.date as AnalizaBriceni | null;
  if (!a?.masini?.length) return { png: null, trimis: false, motiv: 'analiza săptămânii nu e scrisă (briceni/cod/saptamanal.sh pe VPS)' };
  const png = await generateBriceniOptimizariImage({ ...a, saptamina: o.saptamina, pana_la: o.pana_la });
  if (!o.trimite) return { png, trimis: false, motiv: 'doar imaginea (fără ?send=1 nu pleacă)', livrare: a.total.livrare };
  const { data: last } = await sb.from('app_config').select('value').eq('key', BRICENI_POSTER_LAST_KEY).maybeSingle();
  if (!o.force && last?.value === o.saptamina) return { png, trimis: false, motiv: 'deja trimis pentru săptămâna asta', livrare: a.total.livrare };
  const { data: g } = await sb.from('app_config').select('value').eq('key', LIVRARE_POSTER_CHAT_KEY).maybeSingle();
  const chat = (g?.value ?? '').trim();
  if (!chat) return { png, trimis: false, motiv: 'grupa livrărilor de uzină nu e legată (app_config.livrare_poster_chat_id)', livrare: a.total.livrare };
  const caption = `Trox + suburban Briceni · cât se putea economisi · ${perioadaText(o.saptamina, o.pana_la)}`;
  const r = await sendTelegramPhoto(chat, png, caption, `briceni-optimizari-${o.saptamina}.png`);
  if (!r.ok) return { png, trimis: false, motiv: 'Telegram n-a primit imaginea', livrare: a.total.livrare };
  await sb.from('app_config').upsert({ key: BRICENI_POSTER_LAST_KEY, value: o.saptamina }, { onConflict: 'key' });
  return { png, trimis: true, livrare: a.total.livrare };
}
