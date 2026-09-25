import { poster, CULORI, type Celula } from '../poster-sablon';
import { perioadaText } from './lear-optimizari-image';
import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { LIVRARE_POSTER_CHAT_KEY } from './livrare-poster';

/**
 * Posterul săptămânal «cât se putea economisi» pe rutele interurbane nord ↔ Chișinău (Mejgorod, ION-55),
 * în grupa livrărilor de uzină, lângă posterele LEAR și SEBN — Ion, 25.09.2026: «pune și analiza de
 * optimizări în raport livrări».
 *
 * Regula lui Ion (25.09): km-ii optimizabili se numără doar în zilele în care șoferul a făcut seara tot
 * traseul până la capăt ȘI dimineața naveta de acasă; dacă seara nu a mers până la capăt, e ca și cum
 * mașina ar fi rămas la capăt — zero («caz B»). Unde doarme mașina vine din tracker (ultimul punct înainte
 * de ora 03); sub 3 km (garajul din oraș) nu e navetă. Analiza o scrie VPS-ul, luni, în lde_analiza_reguli
 * (uzina «MEJGOROD», mejgorod/cod/saptamanal.sh); aici doar se desenează și se trimite.
 * Doar km, fără lei și fără nume de oameni.
 */
export interface RutaOptim {
  ruta: number; nume: string; capNord: string; km: number; zile: number; ordine: string | null; doarme: string | null; inAfara: number;
  searaLaCapat: number; cazB: number; navetaMed: number | null; golSearaMed: number | null; optimZi: number; optimTotal: number; masini: string[];
}
export interface AnalizaMejgorod { saptamina: string; pana_la: string; rute: RutaOptim[]; total: { optim: number; zile: number; laCapat: number; cazB: number } }

const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');
const nr1 = (v: number | null) => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
export const MEJGOROD_POSTER_LAST_KEY = 'mejgorod_optimizari_poster_last';

export async function generateMejgorodOptimizariImage(a: AnalizaMejgorod): Promise<Buffer> {
  const rute = [...a.rute].filter((r) => r.zile > 0).sort((x, y) => y.optimTotal - x.optimTotal);
  const cuOptim = rute.filter((r) => r.optimTotal >= 5), restul = rute.filter((r) => r.optimTotal < 5);
  const tot = rute.reduce((s, r) => s + r.optimTotal, 0);
  const zile = rute.reduce((s, r) => s + r.zile, 0), laCapat = rute.reduce((s, r) => s + r.searaLaCapat, 0), cazB = rute.reduce((s, r) => s + r.cazB, 0);
  const p = poster({
    latime: 960,
    supratitlu: 'Rute interurbane nord – Chișinău',
    titlu: 'Cât se putea economisi săptămâna trecută',
    subtitlu: 'Km goi pe care mașina i-ar fi făcut mai puțin dacă ar fi rămas la capătul rutei — numărați doar în zilele în care seara a mers până la capăt și dimineața a venit de acasă.',
    eticheta: perioadaText(a.saptamina, a.pana_la),
  });
  p.carduri([
    { eticheta: 'Optimizabil', titlu: 'Ar fi rămas la capătul rutei', text: 'Golul de seară de la capăt până acasă plus naveta de dimineață înapoi, în zilele în care seara a ajuns la capăt.', valoare: `−${nr(tot)} km`, subValoare: 'pe săptămână' },
    { eticheta: 'Seara la capăt', titlu: 'Ultimul drum a ajuns la capăt', text: 'Turul până la Chișinău sau returul până la capătul de nord. Doar aceste zile intră în socoteală.', valoare: `${zile ? Math.round((100 * laCapat) / zile) : 0} %`, subValoare: `${laCapat} din ${zile} zile` },
    { eticheta: 'Caz B', titlu: 'Navetă dimineața, seara nu', text: 'Seara s-a oprit acasă, pe rută, și dimineața a făcut naveta până la capăt: e ca și cum ar fi rămas la capăt. Zero.', valoare: `${nr(cazB)} zile`, subValoare: 'nu se numără' },
  ]);
  const km = (v: number | null): Celula => v == null ? { text: '—', culoare: CULORI.griDeschis } : v < 0.5 ? { text: '0', culoare: CULORI.griDeschis } : { text: nr1(v) };
  p.tabel([
    { titlu: 'Ruta', latime: 60 }, { titlu: 'Capătul', latime: 150 }, { titlu: 'Doarme la', latime: 150 },
    { titlu: 'Seara la capăt', latime: 110, aliniere: 'end' }, { titlu: 'Navetă/zi', latime: 84, aliniere: 'end' }, { titlu: 'Gol seara/zi', latime: 96, aliniere: 'end' },
    { titlu: 'Optimizabil', latime: 100, aliniere: 'end' }, { titlu: 'Caz B', latime: 70, aliniere: 'end' }, { titlu: 'Mașina', latime: 110 },
  ], cuOptim.map((r) => [
    { text: String(r.ruta), bold: true },
    { text: r.capNord, culoare: CULORI.gri },
    { text: r.doarme ?? '—', culoare: CULORI.gri, mic: r.ordine === 'retur→tur' ? 'retur dimineața, tur seara' : undefined },
    { text: `${r.searaLaCapat}/${r.zile}`, culoare: r.searaLaCapat >= r.zile / 2 ? CULORI.text : CULORI.griDeschis },
    km(r.navetaMed), km(r.golSearaMed),
    { text: `−${nr(r.optimTotal)}`, culoare: CULORI.verde, bold: r.optimZi >= 10, fundal: r.optimZi >= 10 ? CULORI.verdeFundal : undefined, mic: `${nr1(r.optimZi)} km/zi` },
    r.cazB ? { text: String(r.cazB), culoare: CULORI.griDeschis } : { text: '0', culoare: CULORI.griDeschis },
    { text: r.masini.slice(0, 2).join(', '), culoare: CULORI.gri },
  ]), { gol: 'Nicio rută cu km optimizabili săptămâna asta.' });
  p.total(`Pe ${cuOptim.length} rute: −${nr(tot)} km pe săptămână`, `≈ −${nr(tot * 52 / 12)} km pe lună`);
  if (restul.length) p.nota(`Celelalte ${restul.length} rute n-au km optimizabili: fie dorm la capăt, fie sunt «caz B» (seara nu ajung la capăt), fie fac returul dimineața și dorm la Chișinău.`);
  p.nota('Verde încercuit = peste 10 km optimizabili pe zi. Naveta și golul sunt mediane pe săptămână, pe scheletul rutei (un drum, tur = retur). Unde doarme mașina vine din GPS, ultimul punct înainte de ora 03; sub 3 km de capăt nu e navetă.');
  return p.png();
}

/** luni, după ce VPS-ul a scris săptămâna; o dată pe săptămână (app_config.mejgorod_optimizari_poster_last) */
export async function trimitePosterMejgorod(o: { saptamina: string; pana_la: string; force?: boolean; dry?: boolean }):
  Promise<{ trimis: boolean; motiv?: string; rute?: number; optim?: number }> {
  const sb = getSupabase();
  const { data: last } = await sb.from('app_config').select('value').eq('key', MEJGOROD_POSTER_LAST_KEY).maybeSingle();
  if (!o.force && !o.dry && last?.value === o.saptamina) return { trimis: false, motiv: 'deja trimis pentru săptămâna asta' };
  const { data: rap } = await sb.from('lde_analiza_reguli').select('date').eq('uzina', 'MEJGOROD').eq('saptamina', o.saptamina).maybeSingle();
  const a = rap?.date as AnalizaMejgorod | null;
  if (!a?.rute?.length) return { trimis: false, motiv: 'analiza săptămânii nu e scrisă (mejgorod/cod/saptamanal.sh pe VPS)' };
  const optim = a.rute.reduce((s, r) => s + r.optimTotal, 0);
  const { data: g } = await sb.from('app_config').select('value').eq('key', LIVRARE_POSTER_CHAT_KEY).maybeSingle();
  const chat = (g?.value ?? '').trim();
  if (!chat) return { trimis: false, motiv: 'grupa livrărilor de uzină nu e legată (app_config.livrare_poster_chat_id)', rute: a.rute.length, optim };
  if (o.dry) return { trimis: false, motiv: 'dry', rute: a.rute.length, optim };
  const png = await generateMejgorodOptimizariImage({ ...a, saptamina: o.saptamina, pana_la: o.pana_la });
  const caption = `Rute interurbane · cât se putea economisi · ${perioadaText(o.saptamina, o.pana_la)}`;
  const r = await sendTelegramPhoto(chat, png, caption, `mejgorod-optimizari-${o.saptamina}.png`);
  if (!r.ok) return { trimis: false, motiv: 'Telegram n-a primit imaginea', rute: a.rute.length, optim };
  await sb.from('app_config').upsert({ key: MEJGOROD_POSTER_LAST_KEY, value: o.saptamina }, { onConflict: 'key' });
  return { trimis: true, rute: a.rute.length, optim };
}
