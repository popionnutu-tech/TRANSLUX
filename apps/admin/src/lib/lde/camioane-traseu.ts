import { escapeHtml } from '@/lib/telegram-notify';

// ION-144 — mesajul zilnic din grupa camioanelor: abaterile de ieri ale cisternelor față de scheletul ideal.
// Ion, 29.09: «verifică ziua de ieri și dă un mesaj pentru toate mașinile», apoi «mașinile care sunt ok să nu apară».
// Rândurile le scrie VPS-ul (camioane/cod/verifica-zi.mjs) în lde_truck_route_checks; aici doar se formulează.

export type Abatere = { cod: string; text: string; km?: number | null };
export type Verificare = {
  placa: string;
  tip: 'incarcata' | 'goala' | 'biodiesel';
  de: string | null;
  pana: string | null;
  km_gps: number | null;
  km_ideal: number | null;
  km_plus: number | null;
  lei_plus: number | null;
  abateri: Abatere[];
  ok: boolean;
};

const TIP: Record<Verificare['tip'], string> = { incarcata: 'cu motorină', goala: 'gol', biodiesel: 'cu biodiesel' };
const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');
const ziRo = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Textul mesajului (HTML Telegram), împărțit în bucăți sub limita de 4096 de caractere. */
export function mesajTraseu(zi: string, randuri: Verificare[]): string[] {
  const abateri = randuri.filter((r) => !r.ok);
  const cap = `🚚 <b>Cisterne · traseul de ieri, ${ziRo(zi)}</b>`;
  if (!randuri.length) return [`${cap}\nNicio cursă încheiată ieri.`];
  if (!abateri.length) return [`${cap}\n✅ ${randuri.length} ${randuri.length === 1 ? 'drum' : 'drumuri'}, toate pe traseu.`];

  const kmPlus = abateri.reduce((s, r) => s + Math.max(0, r.km_plus ?? 0), 0);
  const leiPlus = abateri.reduce((s, r) => s + Math.max(0, r.lei_plus ?? 0), 0);
  const masini = [...new Set(abateri.map((r) => r.placa))];
  const blocuri: string[] = [
    `${cap}\n⚠️ Abateri: <b>${masini.length}</b> ${masini.length === 1 ? 'mașină' : 'mașini'}, ${abateri.length} din ${randuri.length} drumuri`
    + (kmPlus >= 1 ? ` · <b>+${nr(kmPlus)} km</b> ≈ ${nr(leiPlus)} lei` : ''),
  ];
  for (const placa of masini.sort()) {
    const ale = abateri.filter((r) => r.placa === placa);
    const linii = ale.map((r) => {
      const traseu = [r.de, r.pana].filter(Boolean).join(' → ');
      const km = r.km_plus != null && r.km_plus >= 1 && r.km_ideal ? ` · ${nr(r.km_gps ?? 0)} km în loc de ${nr(r.km_ideal)} (<b>+${nr(r.km_plus)}</b>)` : '';
      // km totali stau deja pe rândul cursei; sub el rămân doar cauzele (vama, drumul prin România, ZEL)
      const cauze = r.abateri.filter((a) => a.cod !== 'km' || !km).map((a) => `   – ${escapeHtml(a.text)}`).join('\n');
      return `• ${TIP[r.tip]}${traseu ? ` ${escapeHtml(traseu)}` : ''}${km}${cauze ? `\n${cauze}` : ''}`;
    });
    blocuri.push(`<b>${escapeHtml(placa)}</b>\n${linii.join('\n')}`);
  }
  blocuri.push('<i>Mașinile care au mers pe traseu nu apar. Traseul ideal: LDE → Schelet → Camioane.</i>');

  const bucati: string[] = []; let cur = '';
  for (const b of blocuri) {
    if (cur && cur.length + b.length + 2 > 3900) { bucati.push(cur); cur = ''; }
    cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) bucati.push(cur);
  return bucati;
}
