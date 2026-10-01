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

function blocMasina(r: Verificare): string {
  const traseu = r.de ? [r.de, r.pana].filter(Boolean).join(' → ') : r.pana ? `→ ${r.pana}` : '';
  const out = [`<b>${escapeHtml(r.placa)}</b> · ${TIP[r.tip]}${traseu ? ` ${escapeHtml(traseu)}` : ''}`];
  const plus = r.km_plus != null && r.km_plus >= 1 ? r.km_plus : null;
  if (plus && r.km_ideal) out.push(`${nr(r.km_gps ?? 0)} км вместо ${nr(r.km_ideal)} · <b>+${nr(plus)} км</b>`);
  // cauzele: fără totalul (km), fără traseu și fără stări; mărunțișurile «info» sub 10 km nu ajută la înțeles
  const cauze = r.abateri.filter((a) => a.cod !== 'traseu' && a.cod !== 'km' && a.cod !== 'stai' && !(a.cod === 'info' && Math.abs(a.km ?? 0) < 10));
  cauze.sort((x, y) => (y.km ?? -1e9) - (x.km ?? -1e9));
  const suma = cauze.reduce((t, a) => t + (a.km ?? 0), 0);
  if (plus && plus - suma >= 15 && !cauze.some((a) => /остальное/.test(a.text))) cauze.push({ cod: 'info', text: 'прочее, без точной причины (терминал, манёвры, неточность GPS)', km: Math.round(plus - suma) });
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
  const abateri = randuri.filter((r) => !r.ok);
  const cap = `🚚 <b>Цистерны · отчёт за ${ziRo(zi)}</b>`;
  if (!randuri.length) return [`${cap}\nВчера рейсов не закончилось.`];
  if (!abateri.length) return [`${cap}\n✅ Рейсов: ${randuri.length}, все по маршруту.`];
  const kmPlus = abateri.reduce((t, r) => t + Math.max(0, r.km_plus ?? 0), 0);
  const masini = [...new Set(abateri.map((r) => r.placa))];
  const blocuri: string[] = [`${cap}\nОтклонения: машин <b>${masini.length}</b>${kmPlus >= 1 ? `, лишних <b>+${nr(kmPlus)} км</b>` : ''}`];
  // mașinile cu cei mai mulți km în plus întâi
  const ordine = masini.sort((p, q) => abateri.filter((r) => r.placa === q).reduce((t, r) => t + (r.km_plus ?? 0), 0) - abateri.filter((r) => r.placa === p).reduce((t, r) => t + (r.km_plus ?? 0), 0));
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
