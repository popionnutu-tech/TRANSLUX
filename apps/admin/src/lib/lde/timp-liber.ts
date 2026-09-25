// Mesajul de luni către ADMIN despre mișcările în timpul liber ale autobuzelor LEAR (ION-57).
//
// Ion, 24.09.2026: «am nevoie automatizat, nu manual să mă uit» — dar și, 21.09: «nu am nevoie
// toate aceste să vină la mine». Deci UN mesaj pe săptămână, doar când o mașină e peste prag;
// altfel `null` = tăcere. Textul poartă doar kilometrii și numărul de ieșiri pe mașină — opririle
// (loc, oră, durată — date personale ale șoferului) rămân pe pagina ADMIN.
//
// Funcție pură: nu citește nimic, ca să se poată testa. HTML-ul e construit aici, câmp cu câmp
// scăpat; plafonul de lungime se aplică pe linii întregi, niciodată pe un șir deja scăpat.
import { escapeHtml } from '@/lib/telegram-notify';
import type { TimpLiberMasina } from '@/app/(dashboard)/lde/reguli/actions';

export const PLAFON = 3500;   // octeți sub limita Telegram de 4096, cu loc pentru antet și link

const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export function perioada(saptamina: string, panaLa: string): string {
  const a = new Date(`${saptamina}T12:00:00Z`), b = new Date(`${panaLa}T12:00:00Z`);
  const luna = (d: Date) => LUNI[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${luna(b)}`
    : `${a.getUTCDate()} ${luna(a)} – ${b.getUTCDate()} ${luna(b)}`;
}
const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

export function textTimpLiber(
  saptamina: string, panaLa: string,
  masini: { masina: string; liber?: TimpLiberMasina }[],
  pragKm: number, baseUrl: string,
): string | null {
  // liber și brambura se numără separat (Ion, 25.09): intră oricine e peste prag la oricare din ele
  const peste = masini.filter((m) => m.liber?.peste_prag || m.liber?.peste_prag_brambura)
    .sort((a, b) => ((b.liber?.km ?? 0) + (b.liber?.km_brambura ?? 0)) - ((a.liber?.km ?? 0) + (a.liber?.km_brambura ?? 0)));
  if (!peste.length) return null;
  const nLiber = peste.filter((m) => m.liber?.peste_prag).length, nBr = peste.filter((m) => m.liber?.peste_prag_brambura).length;
  const antet = `⚠️ <b>LEAR Ungheni · timp liber · ${escapeHtml(perioada(saptamina, panaLa))}</b>\n` +
    [nLiber ? `peste ${pragKm} km în afara muncii: ${nLiber}` : '', nBr ? `brambura peste ${pragKm} km: ${nBr}` : ''].filter(Boolean).join(' · ') + '.';
  // linkul se construiește NUMAI din rândul bazei (coloana date), niciodată din query
  const link = `${baseUrl}/lde/reguli?saptamina=${encodeURIComponent(saptamina)}`;
  const subsol = `\n<a href="${link}">unde, când, cu ce opriri — pe pagină</a>`;
  const linii: string[] = [];
  for (const m of peste) {
    const L = m.liber!;
    const zile = `${L.zile} ${L.zile === 1 ? 'zi' : 'zile'}`;
    const ies = L.iesiri.filter((x) => x.eticheta === 'liber');
    const repet = ies.filter((x) => x.repetat).length;
    const parti: string[] = [];
    if (L.peste_prag) parti.push(`${n1(L.km)} km liber în ${zile}, ${ies.length} ${ies.length === 1 ? 'ieșire' : 'ieșiri'}` + (repet ? `, ${repet} în același loc în zile diferite` : ''));
    if (L.peste_prag_brambura) parti.push(`${n1(L.km_brambura ?? 0)} km brambura în cursele de muncă`);
    linii.push(`• <b>${escapeHtml(m.masina)}</b> — ${parti.join('; ')}`);
  }
  // plafonul: linii întregi, cât încap, cu o linie de rest
  let text = antet;
  let puse = 0;
  for (const l of linii) {
    if ((text + '\n' + l + subsol).length + 40 > PLAFON) break;
    text += '\n' + l; puse++;
  }
  if (puse < linii.length) text += `\n… și încă ${linii.length - puse}`;
  return text + subsol;
}

// mesajul când raportul de luni lipsește: o singură linie, fără dedup (cronul cheamă ruta o dată)
export function textRaportLipsa(saptaminaAsteptata: string): string {
  return `⛔ Raportul LEAR pentru săptămâna din ${escapeHtml(saptaminaAsteptata)} lipsește din lde_analiza_reguli — rularea de luni n-a scris nimic.`;
}
