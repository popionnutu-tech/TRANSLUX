import { poster, CULORI } from './poster-sablon';
import { PENALTY, ddmm, type WeeklyReport } from './driver-penalties';

/**
 * Imaginea săptămânală cu penalitățile de aspect (Ion, 14.09: «imaginea trebuie
 * să fie nu mare dar informativă și fiecare șofer să se găsească acolo»).
 *
 * ~65 de șoferi interurbani nu încap lizibil pe o coloană: Telegram strânge poza la
 * 1280 px pe latura lungă, iar 65 de rânduri ar ieși la ~15 px fiecare. De aceea
 * lista e împărțită în DOUĂ tabele alăturate, ~33 de rânduri fiecare — imaginea
 * rămâne aproape pătrată și rândul ține ~30 px după strângere.
 *
 * Aceleași fonturi și același maro ca graficul Mejgorod (schedule-image.ts), ca
 * șoferii să recunoască «mesajul de la parc». Textul e în rusă, ca tot ce pleacă
 * în grupa șoferilor (Ion, 11.09).
 */

export async function generatePenaltyImage(report: WeeklyReport): Promise<Buffer> {
  // Șablonul posterelor (Ion, 25.09: «aplică peste tot noul format»). Conținutul rămâne: în rusă,
  // două tabele alăturate ca să încapă ~65 de șoferi lizibil după ce Telegram strânge poza.
  const period = `${ddmm(report.weekStart)} – ${ddmm(report.weekEnd, true)}`;
  const p = poster({ latime: 900, supratitlu: 'Внешний вид водителей', titlu: `Неделя ${period}`, eticheta: period,
    subtitlu: `Без формы ${PENALTY.NO_UNIFORM_LEI} лей/день · Неопрятный вид ${PENALTY.UNGROOMED_LEI} лей/день · Вместе ${PENALTY.NO_UNIFORM_LEI + PENALTY.UNGROOMED_LEI} · ${PENALTY.ESCALATION_DAYS}+ дней за месяц: +50% в следующем месяце. Форма: вишнёвая майка TRANSLUX или белая / голубая рубашка.` });
  let nr = 0;
  p.tabel([{ titlu: '№', latime: 36, aliniere: 'end' }, { titlu: 'Водитель', latime: 160 }, { titlu: 'Фото', latime: 42, aliniere: 'middle' },
    { titlu: 'Форма', latime: 60, aliniere: 'middle' }, { titlu: 'Опрятн.', latime: 58, aliniere: 'middle' },
    { titlu: 'Неделя', latime: 60, aliniere: 'end' }, { titlu: 'Месяц', latime: 66, aliniere: 'end' }],
    report.rows.map((row) => {
      nr++;
      const fara = row.photoDays === 0;
      const num = (v: number) => ({ text: fara ? '—' : String(v), culoare: fara ? CULORI.griDeschis : v > 0 ? CULORI.rosu : CULORI.text, bold: !fara && v > 0 });
      return [
        { text: String(nr), culoare: CULORI.griDeschis },
        { text: row.name, culoare: fara ? CULORI.griDeschis : CULORI.text },
        { text: fara ? '—' : String(row.photoDays), culoare: fara ? CULORI.griDeschis : CULORI.text },
        num(row.noUniformDays), num(row.ungroomedDays),
        { text: fara ? '—' : String(row.weekLei), bold: row.weekLei > 0, culoare: fara ? CULORI.griDeschis : row.weekLei > 0 ? CULORI.rosu : CULORI.verde,
          fundal: row.weekLei > 0 ? '#f8e3e0' : undefined },
        { text: fara && row.monthLei === 0 ? '—' : String(row.monthLei) + (row.multiplier > 1 ? ` ×${row.multiplier}` : ''), culoare: row.monthLei > 0 ? CULORI.bordoInchis : CULORI.griDeschis },
      ];
    }), { coloane: 2, compact: true });
  const t = report.totals;
  p.total(`Итого за неделю: ${t.driversWithViolations} водителей с нарушениями из ${t.driversWithPhotos} с фото · ${t.weekLei} лей`,
    report.applied ? `Суммы удерживаются из зарплаты (с ${ddmm(PENALTY.APPLY_FROM, true)})` : `Не применяется — суммы с ${ddmm(PENALTY.APPLY_FROM, true)}`);
  p.nota('Фото — дни с фото · Форма / Опрятн. — дни с нарушением · Неделя / Месяц — лей.');
  return p.png();
}
