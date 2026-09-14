import sharp from 'sharp';
import { fonts, logoBase64, textPath, truncText } from './schedule-image';
import { PENALTY, ddmm, type WeeklyReport, type DriverWeekRow } from './driver-penalties';

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

const S = 2;
const PAD = 16 * S;
const GAP = 14 * S;
const MAROON = '#9B1B30';
const MAROON_DK = '#6b1221';
const RED = '#b3261e';
const GREY = '#666';
const ROW_BG = ['#fdf6f0', '#f5ebe3'];
const ROW_H = 24 * S;
const TH_H = 30 * S;
const LOGO_AREA = 54 * S;
const TITLE_H = 26 * S;
const SUB_H = 18 * S;
const FOOT_H = 34 * S;

/** Coloanele unui tabel (lățimi la 1×). */
const COLS = [
  { key: 'n', title: '№', w: 24, align: 'end' as const },
  { key: 'name', title: 'Водитель', w: 168, align: 'start' as const },
  { key: 'photos', title: 'Фото', w: 40, align: 'middle' as const },
  { key: 'uniform', title: 'Форма', w: 50, align: 'middle' as const },
  { key: 'groom', title: 'Опрятн.', w: 56, align: 'middle' as const },
  { key: 'week', title: 'Неделя', w: 62, align: 'end' as const },
  { key: 'month', title: 'Месяц', w: 60, align: 'end' as const },
];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0) * S;
const CANVAS_W = PAD * 2 + TABLE_W * 2 + GAP;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export async function generatePenaltyImage(report: WeeklyReport): Promise<Buffer> {
  const { r: fR, b: fB } = fonts();
  const rows = report.rows;
  const half = Math.ceil(rows.length / 2);
  const columns: DriverWeekRow[][] = [rows.slice(0, half), rows.slice(half)];
  const tableRows = half;

  const headerH = LOGO_AREA + TITLE_H + SUB_H + 10 * S;
  const H = headerH + TH_H + tableRows * ROW_H + FOOT_H + PAD;

  const svg: string[] = [];
  svg.push(`<rect width="${CANVAS_W}" height="${H}" fill="#ffffff"/>`);

  // Logo (același ca pe grafic) + titlu + regulile
  const logoH = 28 * S;
  const logoW = logoH * (1318 / 192);
  svg.push(`<image href="data:image/png;base64,${logoBase64()}" x="${(CANVAS_W - logoW) / 2}" y="${PAD}" width="${logoW}" height="${logoH}"/>`);
  const period = `${ddmm(report.weekStart)} – ${ddmm(report.weekEnd, true)}`;
  svg.push(textPath(fB, `ВНЕШНИЙ ВИД ВОДИТЕЛЕЙ · ${period}`, CANVAS_W / 2, LOGO_AREA + 16 * S, 17 * S, MAROON_DK, 'middle'));
  const rules = `Без формы ${PENALTY.NO_UNIFORM_LEI} лей/день · Неопрятный вид ${PENALTY.UNGROOMED_LEI} лей/день · Вместе ${PENALTY.NO_UNIFORM_LEI + PENALTY.UNGROOMED_LEI} · ${PENALTY.ESCALATION_DAYS}+ дней за месяц: +50% в следующем месяце`; // fără «→»: Open Sans n-are glifa
  svg.push(textPath(fR, rules, CANVAS_W / 2, LOGO_AREA + TITLE_H + 10 * S, 10.5 * S, GREY, 'middle'));
  svg.push(textPath(fR, 'Форма: вишнёвая майка TRANSLUX или белая / голубая рубашка · Фото — дни с фото · Форма / Опрятн. — дни с нарушением · Неделя / Месяц — лей', CANVAS_W / 2, LOGO_AREA + TITLE_H + SUB_H + 6 * S, 9.5 * S, GREY, 'middle'));

  const top = headerH;
  columns.forEach((col, ci) => {
    const x0 = PAD + ci * (TABLE_W + GAP);
    // antet
    svg.push(`<rect x="${x0}" y="${top}" width="${TABLE_W}" height="${TH_H}" fill="${MAROON}"/>`);
    let cx = x0;
    for (const c of COLS) {
      const w = c.w * S;
      const tx = c.align === 'start' ? cx + 6 * S : c.align === 'end' ? cx + w - 6 * S : cx + w / 2;
      svg.push(textPath(fB, c.title, tx, top + TH_H / 2 + 4 * S, 11 * S, '#fff', c.align));
      cx += w;
    }
    // rânduri
    for (let i = 0; i < tableRows; i++) {
      const y = top + TH_H + i * ROW_H;
      svg.push(`<rect x="${x0}" y="${y}" width="${TABLE_W}" height="${ROW_H}" fill="${ROW_BG[i % 2]}"/>`);
      const row = col[i];
      if (!row) continue;
      const idx = ci * half + i + 1;
      const noPhoto = row.photoDays === 0;
      const textY = y + ROW_H / 2 + 4.2 * S;
      const fsz = 11.5 * S;
      const nameColor = noPhoto ? '#999' : '#222';
      const num = (v: number, hot: boolean) => ({ text: noPhoto ? '—' : String(v), fill: noPhoto ? '#aaa' : hot && v > 0 ? RED : '#333' });

      let x = x0;
      const cells: Record<string, { text: string; fill: string; bold?: boolean }> = {
        n: { text: String(idx), fill: '#888' },
        name: { text: truncText(fR, row.name, fsz, COLS[1].w * S - 10 * S), fill: nameColor },
        photos: { text: noPhoto ? '—' : String(row.photoDays), fill: noPhoto ? '#aaa' : '#333' },
        uniform: num(row.noUniformDays, true),
        groom: num(row.ungroomedDays, true),
        week: { text: noPhoto ? '—' : String(row.weekLei), fill: noPhoto ? '#aaa' : row.weekLei > 0 ? RED : '#2e7d32', bold: row.weekLei > 0 },
        month: { text: noPhoto && row.monthLei === 0 ? '—' : String(row.monthLei) + (row.multiplier > 1 ? ` ×${row.multiplier}` : ''), fill: row.monthLei > 0 ? MAROON_DK : '#aaa' },
      };
      for (const c of COLS) {
        const w = c.w * S;
        const cell = cells[c.key];
        const tx = c.align === 'start' ? x + 6 * S : c.align === 'end' ? x + w - 6 * S : x + w / 2;
        svg.push(textPath(cell.bold ? fB : fR, esc(cell.text), tx, textY, fsz, cell.fill, c.align));
        x += w;
      }
    }
    svg.push(`<rect x="${x0}" y="${top}" width="${TABLE_W}" height="${TH_H + tableRows * ROW_H}" fill="none" stroke="${MAROON}" stroke-opacity="0.35" stroke-width="${S}"/>`);
  });

  // subsol: totaluri + statutul reținerii
  const fy = top + TH_H + tableRows * ROW_H + 14 * S;
  const t = report.totals;
  svg.push(textPath(fB, `Итого за неделю: ${t.driversWithViolations} водителей с нарушениями из ${t.driversWithPhotos} с фото · ${t.weekLei} лей`, PAD, fy + 4 * S, 12 * S, MAROON_DK, 'start'));
  const status = report.applied
    ? `Суммы удерживаются из зарплаты (с ${ddmm(PENALTY.APPLY_FROM, true)})`
    : `ЭТА НЕДЕЛЯ НЕ ПРИМЕНЯЕТСЯ — суммы начнут учитываться с ${ddmm(PENALTY.APPLY_FROM, true)}`;
  svg.push(textPath(fB, status, CANVAS_W - PAD, fy + 4 * S, 12 * S, report.applied ? RED : '#2e7d32', 'end'));

  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${H}">
${svg.join('\n')}
</svg>`;
  return await sharp(Buffer.from(svgStr)).png().toBuffer();
}
