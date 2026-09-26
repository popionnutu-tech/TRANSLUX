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
 * NU pleacă singur: Ion vrea să-l vadă întâi. Ruta întoarce imaginea; în grupă trimite doar cu ?send=1.
 * Fontul posterului n-are «↔» și «→» (se desenează gol) — pe poster «–».
 * Pe poster: doar km și lei, pe mașină și pe rută — fără casa șoferului, fără locurile și orele ocolurilor, fără nume.
 */
export type Categorie = 'cuOameni' | 'nepotrivita' | 'golRuta' | 'golTure' | 'service' | 'deplasare' | 'livrare' | 'legatura' | 'necunoscut';
export type KmCategorii = Record<Categorie, number>;
export interface BucataZi { ora: string; cat: Categorie; km: number; brambura: number; golTure?: number; r: string | null; motiv: string | null }
export interface ZiMasina {
  z: string; dow: number; total: number; km: KmCategorii; lungimeTrox?: number | null; brambura: number; lei: number | null; leiKm: number | null;
  bilant: boolean; dif: number; casaDim: string | null; casaSeara: string | null; bucati: BucataZi[];
}
export interface MasinaBriceni {
  m: string; zile: number; total: number; km: KmCategorii; brambura: number; livrareZi: number; lei: number | null; leiZi: number | null;
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

export async function generateBriceniOptimizariImage(a: AnalizaBriceni): Promise<Buffer> {
  const masini = [...a.masini].sort((x, y) => y.km.livrare - x.km.livrare);
  const t = a.total;
  const p = poster({
    latime: 1000,
    supratitlu: 'Trox + rute suburbane Briceni',
    titlu: 'Cât se putea economisi săptămâna trecută',
    subtitlu: 'Livrarea = drumul mașinii de acasă până la începutul cursei și înapoi. Se taie cu un șofer din satul de start sau cu mașina care așteaptă la capăt, nu acasă (regula SEBN).',
    eticheta: perioadaText(a.saptamina, a.pana_la),
  });
  p.carduri([
    { eticheta: 'Economie posibilă', titlu: 'Livrare casă – start', text: 'Km goi de acasă până la prima cursă, între ture pe acasă și seara înapoi.', valoare: `${nr(t.livrare)} km`, subValoare: `≈ ${nr(t.lei)} lei pe săptămână` },
    { eticheta: 'Cu oameni', titlu: 'Trox și suburban', text: 'Cursele Trox capăt – poartă și cursele suburbane din orar. Nu se optimizează.', valoare: `${nr(t.cuOameni)} km` },
    { eticheta: 'Nu e economie', titlu: 'Gol pe rută, între ture, legătură', text: 'Întoarcerea goală impusă de orar, drumul gol spre capăt între ture Trox (6 drumuri pe 2 ture) și drumul poartă – gară.', valoare: `${nr(t.golRuta + (t.golTure ?? 0) + t.legatura)} km` },
  ]);
  const km = (v: number): Celula => v < 0.5 ? { text: '0', culoare: CULORI.griDeschis } : { text: nr(v) };
  p.tabel([
    { titlu: 'Mașina', latime: 110 }, { titlu: 'Zile', latime: 60, aliniere: 'end' }, { titlu: 'Cu oameni', latime: 110, aliniere: 'end' },
    { titlu: 'Gol rută+ture', latime: 110, aliniere: 'end' }, { titlu: 'Legătură', latime: 100, aliniere: 'end' },
    { titlu: 'Livrare/zi', latime: 110, aliniere: 'end' }, { titlu: 'Livrare', latime: 110, aliniere: 'end' }, { titlu: 'Lei', latime: 100, aliniere: 'end' },
  ], masini.filter((m) => m.km.livrare >= 0.5).map((m) => [
    { text: m.m, bold: true },
    { text: String(m.zile), culoare: CULORI.gri },
    km(m.km.cuOameni + m.km.nepotrivita), km(m.km.golRuta + (m.km.golTure ?? 0)), km(m.km.legatura),
    { text: nr1(m.livrareZi), bold: m.livrareZi > PRAG_LIVRARE_ZI, culoare: m.livrareZi > PRAG_LIVRARE_ZI ? CULORI.verde : CULORI.text,
      fundal: m.livrareZi > PRAG_LIVRARE_ZI ? CULORI.verdeFundal : undefined },
    { text: nr(m.km.livrare), culoare: CULORI.verde },
    { text: m.lei == null ? '—' : nr(m.lei), culoare: CULORI.gri },
  ]), { gol: 'Nicio mașină cu livrare săptămâna asta.' });
  p.total(`Pe ${masini.filter((m) => m.km.livrare >= 0.5).length} mașini: ${nr(t.livrare)} km livrare`, `≈ ${nr(t.lei)} lei pe săptămână`);
  const rute = a.rute.filter((r) => r.livrare >= 0.5);
  if (rute.length) p.nota(`Pe rute: ${rute.slice(0, 10).map((r) => `${r.id} ${nr(r.livrare)} km`).join(' · ')}.`);
  p.nota(`Verde încercuit = peste ${PRAG_LIVRARE_ZI} km livrare pe zi. Lei = livrare × norma mașinii × prețul ANRE al zilei + reparație + salariu. Brambura (drum pe care mașina n-a mai mers în nicio altă zi) e scăzută din livrare.`);
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
