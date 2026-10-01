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

// pe rusă (Ion, 30.09: «toată comunicarea de azi înainte în rusă»); textele abaterilor vin deja pe rusă de pe VPS.
// Forma (Ion, 01.10: «dă așa în grupă raportul, dar un pic mai scurt, să fie foarte clar, și așa mereu»): pe mașină
// traseul, «X км вместо Y · +Z», apoi cauzele numerotate cu km în față; la sfârșit cât a stat (ZEL, vamă).
const TIP: Record<Verificare['tip'], string> = { incarcata: 'дизель', goala: 'пустой', biodiesel: 'биодизель' };
const nr = (x: number) => Math.round(x).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
const ziRo = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

// Ion, 01.10: «tot ce e legat de neprecizii și de terminal — nu include». Fără «прочее» și fără restul nemăsurat:
// +km ai mașinii = suma cauzelor numite (vama, drumul prin România/Moldova, baza, după ZEL), nu diferența brută față de ideal.
function cauzeleMasinii(r: Verificare): Abatere[] {
  const c = r.abateri.filter((a) => a.cod !== 'traseu' && a.cod !== 'km' && a.cod !== 'stai' && !/остальное/.test(a.text)
    && !(a.cod === 'info' && Math.abs(a.km ?? 0) < 10));
  return c.sort((x, y) => (y.km ?? -1e9) - (x.km ?? -1e9));
}
const kmCauze = (c: Abatere[]) => c.reduce((t, a) => t + Math.max(0, a.km ?? 0), 0);

function blocMasina(r: Verificare): string {
  const traseu = r.de ? [r.de, r.pana].filter(Boolean).join(' → ') : r.pana ? `→ ${r.pana}` : '';
  const cauze = cauzeleMasinii(r);
  const plus = kmCauze(cauze);
  const out = [`<b>${escapeHtml(r.placa)}</b> · ${TIP[r.tip]}${traseu ? ` ${escapeHtml(traseu)}` : ''}${plus >= 1 ? ` · <b>+${nr(plus)} км</b>` : ''}`];
  cauze.forEach((a, i) => {
    const km = a.km != null && Math.abs(a.km) >= 1 ? `${a.km >= 0 ? '+' : '−'}${nr(Math.abs(a.km))} — ` : '';
    out.push(`${i + 1}. ${km}${escapeHtml(a.text)}`);
  });
  const stai = r.abateri.find((a) => a.cod === 'stai');
  if (stai) out.push(`<i>${escapeHtml(stai.text.charAt(0).toUpperCase() + stai.text.slice(1))}</i>`);
  return out.join('\n');
}

/** Textul mesajului (HTML Telegram), împărțit în bucăți sub limita de 4096 de caractere. */
export function mesajTraseu(zi: string, randuri: Verificare[]): string[] {
  // un drum doar cu «km în plus» fără cauză numită (neprecizie GPS, terminal) nu se arată
  const abateri = randuri.filter((r) => !r.ok && cauzeleMasinii(r).length > 0);
  const cap = `🚚 <b>Цистерны · отчёт за ${ziRo(zi)}</b>`;
  if (!randuri.length) return [`${cap}\nВчера рейсов не закончилось.`];
  if (!abateri.length) return [`${cap}\n✅ Рейсов: ${randuri.length}, все по маршруту.`];
  const kmPlus = abateri.reduce((t, r) => t + kmCauze(cauzeleMasinii(r)), 0);
  const masini = [...new Set(abateri.map((r) => r.placa))];
  const blocuri: string[] = [`${cap}\nОтклонения: машин <b>${masini.length}</b>${kmPlus >= 1 ? `, лишних <b>+${nr(kmPlus)} км</b>` : ''}`];
  // mașinile cu cei mai mulți km în plus întâi
  const kmMasina = (p: string) => abateri.filter((r) => r.placa === p).reduce((t, r) => t + kmCauze(cauzeleMasinii(r)), 0);
  const ordine = masini.sort((p, q) => kmMasina(q) - kmMasina(p));
  for (const placa of ordine) blocuri.push(abateri.filter((r) => r.placa === placa).map(blocMasina).join('\n\n'));
  blocuri.push('<i>Остальные машины — по маршруту. Км не по маршруту не засчитываются ни в солярку, ни в зарплату.</i>');

  const bucati: string[] = []; let cur = '';
  for (const b of blocuri) {
    if (cur && cur.length + b.length + 2 > 3900) { bucati.push(cur); cur = ''; }
    cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur) bucati.push(cur);
  return bucati;
}
