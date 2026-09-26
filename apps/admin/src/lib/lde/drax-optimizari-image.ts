import { poster, CULORI } from '../poster-sablon';
import { perioadaText } from './lear-optimizari-image';
import { getSupabase } from '../supabase';
import { sendTelegramPhoto } from '../telegram-notify';
import { LIVRARE_POSTER_CHAT_KEY } from './livrare-poster';
import { PRAG_INDICATII_KM, type AnalizaDrax, type MasinaDrax } from './drax-analiza';

/**
 * Posterul săptămânal Drăxlmaier Bălți (ION-94, F3; regulile §8, §10.5). Cifrele NU se socotesc aici: sunt cardurile rândului
 * «DRAXELMAIER» din lde_analiza_reguli (Σ rândurilor mașinilor, scrise luni de drax/cod/saptamanal/scrie-analiza.mjs).
 *
 * Regula B e «cost de azi», nu economie garantată (§8.1): titlul spune «cât costă azi drumul casă – rută», iar separat ce se
 * poate tăia cu o dispoziție (R1b + R3). R1a (marginile zilei) se taie doar cu alt șofer din satul de start. Doar km: fără lei,
 * fără casă, fără ore, fără nume de oameni; rutele apar cu denumirea lor (§10.5). Fontul n-are «↔» și «→» — pe poster «–».
 *
 * Posterul NU pleacă până la «da»-ul lui Ion: ruta îl trimite doar cu ?poster=1, și nimic nu cheamă ?poster=1 (lear-saptamanal.sh
 * cheamă doar ?liber=1&dry=1). Cheia de dedup: app_config.drax_optimizari_poster_last.
 */
export const DRAX_POSTER_LAST_KEY = 'drax_optimizari_poster_last';

const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');
const numeLinie = (lin: string) => lin.split('|').join(' – ');

/** rutele mașinii pe poster: cele mai dese două, cu denumirea (linia = capătul) */
export const ruteMasina = (m: MasinaDrax) =>
  m.rute.slice().sort((a, b) => b.zile - a.zile || b.km - a.km).slice(0, 2).map((r) => numeLinie(r.r)).join(', ') || '—';

export async function generateDraxOptimizariImage(a: AnalizaDrax): Promise<Buffer> {
  const c = a.economie.carduri;
  const p = poster({
    latime: 1000,
    supratitlu: 'Drăxlmaier Bălți · regula B',
    titlu: 'Cât costă azi drumul casă – rută',
    subtitlu: 'Km goi de acasă la prima cursă și seara înapoi (R1a), ocolul pe acasă între curse (R1b) și drumul acasă între tur și retur (R3). Cost de azi, nu economie garantată.',
    eticheta: perioadaText(a.saptamina, a.pana_la),
  });
  const peste = (a.indicatii?.peste_prag ?? 0);
  p.carduri([
    { eticheta: 'Cost de azi · regula B', titlu: 'Drumul casă – rută', text: c.deLamurit.B >= 0.5 ? `din care ${nr(c.deLamurit.B)} km de lămurit (posibile curse ale firmei).` : 'R1a + R1b + R3, extrapolat pe zilele lucrate.', valoare: `${nr(c.B)} km` },
    { eticheta: 'Se poate tăia cu o dispoziție', titlu: 'R1b + R3', text: 'Între curse mașina așteaptă la capăt sau la uzină, nu acasă; între tur și retur, lângă uzină.', valoare: `${nr(c.R1bR3)} km` },
    { eticheta: 'Marginile zilei (R1a)', titlu: 'Doar cu alt șofer', text: 'Drumul de acasă la prima cursă și seara înapoi — se taie doar cu un șofer din satul de start.', valoare: `${nr(c.R1a)} km` },
    { eticheta: `Peste ${PRAG_INDICATII_KM} km pe săptămână`, titlu: `${peste} ${peste === 1 ? 'mașină' : 'mașini'}`, text: c.nemasurate.length ? `${c.nemasurate.length} ${c.nemasurate.length === 1 ? 'mașină nemăsurată' : 'mașini nemăsurate'} (fără zi măsurabilă).` : 'Pe R1b + R3, la mașinile cu cel puțin 3 zile măsurate.', valoare: `${peste}` },
  ]);
  const masini = a.masini.filter((m) => (m.extrapolat.B ?? 0) >= 0.5)
    .sort((x, y) => ((y.extrapolat.R1b ?? 0) + (y.extrapolat.R3 ?? 0)) - ((x.extrapolat.R1b ?? 0) + (x.extrapolat.R3 ?? 0)));
  const verde = (v: number) => v >= PRAG_INDICATII_KM;
  p.tabel([
    { titlu: 'Mașina', latime: 110 }, { titlu: 'Linii', latime: 330 }, { titlu: 'Zile', latime: 70, aliniere: 'end' },
    { titlu: 'R1b', latime: 100, aliniere: 'end' }, { titlu: 'R3', latime: 90, aliniere: 'end' }, { titlu: 'R1a', latime: 100, aliniere: 'end' },
  ], masini.map((m) => {
    const d = (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0);
    return [
      { text: m.m, bold: true },
      { text: ruteMasina(m), culoare: CULORI.gri },
      { text: `${m.zileIncluse}/${m.zile}`, culoare: CULORI.gri },
      { text: nr(m.extrapolat.R1b ?? 0), bold: verde(d), culoare: verde(d) ? CULORI.verde : CULORI.text, fundal: verde(d) ? CULORI.verdeFundal : undefined },
      { text: nr(m.extrapolat.R3 ?? 0), culoare: CULORI.text },
      { text: nr(m.extrapolat.R1a ?? 0), culoare: CULORI.gri },
    ];
  }), { gol: 'Nicio mașină cu drum casă – rută săptămâna asta.' });
  p.total(`Pe ${masini.length} mașini: R1b + R3 ${nr(c.R1bR3)} km · R1a ${nr(c.R1a)} km · B ${nr(c.B)} km`);
  p.nota(`Zile = zile măsurate / zile lucrate luni–vineri; km extrapolați pe zilele lucrate. Verde = R1b + R3 peste ${PRAG_INDICATII_KM} km pe săptămână. Ziua fiecărei mașini, bucată cu bucată: în LDE, Raport livrări, fila Drăxlmaier.`);
  return p.png();
}

/**
 * Posterul săptămânii în grupa livrărilor (doar din ruta cu ?poster=1, după «da»). O dată pe săptămână (cheia de dedup), `force`
 * retrimite. Rândul îl dă ruta (deja citit și verificat cu esteAnalizaDrax).
 */
export async function trimitePosterDrax(a: AnalizaDrax, o: { force?: boolean } = {}): Promise<{ trimis: boolean; motiv?: string }> {
  const sb = getSupabase();
  const { data: last } = await sb.from('app_config').select('value').eq('key', DRAX_POSTER_LAST_KEY).maybeSingle();
  if (!o.force && last?.value === a.saptamina) return { trimis: false, motiv: 'deja trimis pentru săptămâna asta' };
  const { data: g } = await sb.from('app_config').select('value').eq('key', LIVRARE_POSTER_CHAT_KEY).maybeSingle();
  const chat = (g?.value ?? '').trim();
  if (!chat) return { trimis: false, motiv: 'grupa livrărilor de uzină nu e legată (app_config.livrare_poster_chat_id)' };
  const png = await generateDraxOptimizariImage(a);
  const r = await sendTelegramPhoto(chat, png, `Drăxlmaier Bălți · cât costă azi drumul casă – rută · ${perioadaText(a.saptamina, a.pana_la)}`, `drax-optimizari-${a.saptamina}.png`);
  if (!r.ok) return { trimis: false, motiv: 'Telegram n-a primit imaginea' };
  await sb.from('app_config').upsert({ key: DRAX_POSTER_LAST_KEY, value: a.saptamina }, { onConflict: 'key' });
  return { trimis: true };
}
