import { escapeHtml } from '@/lib/telegram-notify';

// ION-144 — mesajul zilnic din grupa camioanelor: abaterile de ieri ale cisternelor față de scheletul ideal.
// Ion, 29.09: «verifică ziua de ieri și dă un mesaj pentru toate mașinile», apoi «mașinile care sunt ok să nu apară».
// Rândurile le scrie VPS-ul (camioane/cod/verifica-zi.mjs) în lde_truck_route_checks; aici doar se formulează.

// cod 'traseu' = drumul ideal și cel real (orașele); cod 'info' = parte din km în plus care nu e abatere în sine;
// cod 'km' = totalul (stă pe rândul cursei). Părțile cu km se adună la km_plus (vama + România + Moldova + restul).
export type Abatere = { cod: string; text: string; km?: number | null; ideal?: string; real?: string };
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

// pe rusă (Ion, 30.09: «toată comunicarea de azi înainte în rusă»); textele abaterilor vin deja pe rusă de pe VPS
const TIP: Record<Verificare['tip'], string> = { incarcata: 'с дизелем', goala: 'пустой', biodiesel: 'с биодизелем' };
const nr = (x: number) => Math.round(x).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
const ziRo = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Textul mesajului (HTML Telegram), împărțit în bucăți sub limita de 4096 de caractere. */
export function mesajTraseu(zi: string, randuri: Verificare[]): string[] {
  const abateri = randuri.filter((r) => !r.ok);
  const cap = `🚚 <b>Цистерны · маршрут за вчера, ${ziRo(zi)}</b>`;
  if (!randuri.length) return [`${cap}\nВчера рейсов не закончилось.`];
  if (!abateri.length) return [`${cap}\n✅ Рейсов: ${randuri.length}, все по маршруту.`];

  const kmPlus = abateri.reduce((s, r) => s + Math.max(0, r.km_plus ?? 0), 0);
  const masini = [...new Set(abateri.map((r) => r.placa))];
  const blocuri: string[] = [
    `${cap}\n⚠️ Отклонения: машин <b>${masini.length}</b>, рейсов ${abateri.length} из ${randuri.length}`
    + (kmPlus >= 1 ? ` · <b>+${nr(kmPlus)} км</b>` : ''), // fără lei (Ion, 29.09)
  ];
  for (const placa of masini.sort()) {
    const ale = abateri.filter((r) => r.placa === placa);
    // Ion, 29.09: «nu e clar de unde km în plus». Drumul ideal și cel real unul sub altul, apoi totalul și părțile,
    // fiecare cu km în față — se adună exact la total.
    const linii = ale.map((r) => {
      const traseu = [r.de, r.pana].filter(Boolean).join(' → ');
      const out = [`• ${TIP[r.tip]}${traseu ? ` ${escapeHtml(traseu)}` : ''}`];
      const tr = r.abateri.find((a) => a.cod === 'traseu');
      if (tr?.ideal) out.push(`   надо: ${escapeHtml(tr.ideal)}`);
      if (tr?.real) out.push(`   было: ${escapeHtml(tr.real)}`);
      const parti = r.abateri.filter((a) => a.cod !== 'traseu' && a.cod !== 'km');
      const cuKm = parti.filter((a) => a.km != null && Math.abs(a.km) >= 1);
      const plus = r.km_plus != null && r.km_plus >= 1 ? r.km_plus : null;
      if (plus) out.push(`   <b>+${nr(plus)} км</b>${cuKm.length ? ', из них:' : ''}`);
      else if (cuKm.length) out.push('   лишние км:');
      for (const a of cuKm) out.push(`   <code>${(a.km! >= 0 ? '+' : '−') + nr(Math.abs(a.km!))}</code> ${escapeHtml(a.text)}`);
      for (const a of parti.filter((x) => !cuKm.includes(x))) out.push(`   ⚠ ${escapeHtml(a.text)}`);
      return out.join('\n');
    });
    blocuri.push(`<b>${escapeHtml(placa)}</b>\n${linii.join('\n')}`);
  }
  blocuri.push('<i>Машины, которые ехали по маршруту, здесь не показаны. Км не по маршруту не засчитываются ни в солярку, ни в зарплату. Маршруты — в закреплённых картах.</i>');

  const bucati: string[] = []; let cur = '';
  for (const b of blocuri) {
    if (cur && cur.length + b.length + 2 > 3900) { bucati.push(cur); cur = ''; }
    cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) bucati.push(cur);
  return bucati;
}
