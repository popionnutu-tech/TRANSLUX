import sharp from 'sharp';
import { fonts, logoBase64, textPath, truncText } from './schedule-image';
import type { RandPret, OfertaBalti } from './price-popular';

/**
 * Imaginea cu prețurile noi (Ion, 15.09: «fiecare joi când se face update la
 * prețuri — noile prețuri în formă imagini cu principalele locații schimbare
 * preț; și se spune: pentru informație adițională vizitați site-ul»).
 *
 * Bilingvă, ca tot ce ajunge sub ochii pasagerului: rândul principal e în
 * română, sub el numele rusesc. Aceleași fonturi, același maro și același logo
 * ca graficul și ca imaginea penalităților — se recunoaște «de la parc».
 *
 * «→» nu se poate: Open Sans nu are glifa (aceeași capcană ca la imaginea
 * penalităților). Ruta se scrie cu cratimă, ca pe grafic.
 */

const S = 2;
const PAD = 18 * S;
const MAROON = '#9B1B30';
const MAROON_DK = '#6b1221';
const RED = '#b3261e';
const GREEN = '#2e7d32';
const GREY = '#666';
const GREY_L = '#999';
const ROW_BG = ['#fdf6f0', '#f5ebe3'];

const ROW_H = 40 * S;
const TH_H = 32 * S;
const LOGO_AREA = 58 * S;
const TITLE_H = 30 * S;
const SUB_H = 26 * S;
const FOOT_H = 46 * S;

const COLS = [
  { key: 'ruta', title: 'Destinația · Направление', w: 250, align: 'start' as const },
  { key: 'vechi', title: 'Acum · Сейчас', w: 96, align: 'end' as const },
  { key: 'nou', title: 'Nou · Новая', w: 116, align: 'end' as const },
  { key: 'delta', title: '', w: 62, align: 'end' as const },
];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0) * S;
const CANVAS_W = PAD * 2 + TABLE_W;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** «19.09.2026» din «2026-09-19» — dată calendaristică, fără fus orar. */
export function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const ZILE_RO = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const ZILE_RU = ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы'];

function ziua(iso: string): { ro: string; ru: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { ro: ZILE_RO[dow], ru: ZILE_RU[dow] };
}

export interface PriceImageInput {
  randuri: RandPret[];
  /** Ziua din care se aplică prețurile noi (ISO). */
  aplicaDin: string;
  /** Adresa pe care o citește pasagerul pentru restul destinațiilor. */
  site: string;
  /** Oferta Bălți - Chișinău, dacă există: pe ea omul chiar plătește mai puțin. */
  oferta?: OfertaBalti | null;
}

export async function generatePriceImage({ randuri, aplicaDin, site, oferta }: PriceImageInput): Promise<Buffer> {
  const { r: fR, b: fB } = fonts();
  const z = ziua(aplicaDin);

  const ofertaH = oferta ? 34 * S : 0;
  const headerH = LOGO_AREA + TITLE_H + SUB_H + 8 * S;
  const H = headerH + TH_H + randuri.length * ROW_H + ofertaH + FOOT_H + PAD;

  const svg: string[] = [];
  svg.push(`<rect width="${CANVAS_W}" height="${H}" fill="#ffffff"/>`);

  const logoH = 30 * S;
  const logoW = logoH * (1318 / 192);
  svg.push(`<image href="data:image/png;base64,${logoBase64()}" x="${(CANVAS_W - logoW) / 2}" y="${PAD}" width="${logoW}" height="${logoH}"/>`);
  svg.push(textPath(fB, 'PREȚURI NOI · НОВЫЕ ЦЕНЫ', CANVAS_W / 2, LOGO_AREA + 18 * S, 19 * S, MAROON_DK, 'middle'));
  svg.push(textPath(fB, `din ${z.ro}, ${ddmmyyyy(aplicaDin)} · с ${z.ru}, ${ddmmyyyy(aplicaDin)}`,
    CANVAS_W / 2, LOGO_AREA + TITLE_H + 12 * S, 13 * S, MAROON, 'middle'));

  const top = headerH;
  svg.push(`<rect x="${PAD}" y="${top}" width="${TABLE_W}" height="${TH_H}" fill="${MAROON}"/>`);
  let cx = PAD;
  for (const c of COLS) {
    const w = c.w * S;
    const tx = c.align === 'start' ? cx + 8 * S : cx + w - 8 * S;
    if (c.title) svg.push(textPath(fB, c.title, tx, top + TH_H / 2 + 4 * S, 11 * S, '#fff', c.align));
    cx += w;
  }

  randuri.forEach((r, i) => {
    const y = top + TH_H + i * ROW_H;
    svg.push(`<rect x="${PAD}" y="${y}" width="${TABLE_W}" height="${ROW_H}" fill="${ROW_BG[i % 2]}"/>`);

    let x = PAD;
    const wRuta = COLS[0].w * S;
    const ro = `${r.from_ro} - ${r.to_ro}`;
    const ru = `${r.from_ru} - ${r.to_ru}`;
    svg.push(textPath(fB, esc(truncText(fB, ro, 14 * S, wRuta - 16 * S)), x + 8 * S, y + 17 * S, 14 * S, '#222', 'start'));
    svg.push(textPath(fR, esc(truncText(fR, ru, 11 * S, wRuta - 16 * S)), x + 8 * S, y + 32 * S, 11 * S, GREY, 'start'));
    x += wRuta;

    const wVechi = COLS[1].w * S;
    svg.push(textPath(fR, r.vechi !== null ? `${r.vechi} lei` : '—', x + wVechi - 8 * S, y + ROW_H / 2 + 5 * S, 14 * S, GREY_L, 'end'));
    x += wVechi;

    const wNou = COLS[2].w * S;
    svg.push(textPath(fB, `${r.nou} lei`, x + wNou - 8 * S, y + ROW_H / 2 + 5 * S, 17 * S, MAROON_DK, 'end'));
    x += wNou;

    const wD = COLS[3].w * S;
    if (r.vechi !== null && r.nou !== r.vechi) {
      const d = r.nou - r.vechi;
      svg.push(textPath(fB, `${d > 0 ? '+' : '-'}${Math.abs(d)}`, x + wD - 8 * S, y + ROW_H / 2 + 5 * S, 14 * S, d > 0 ? RED : GREEN, 'end'));
    } else if (r.vechi !== null) {
      svg.push(textPath(fR, 'fără', x + wD - 8 * S, y + ROW_H / 2 + 4 * S, 11 * S, GREY_L, 'end'));
    }
  });

  svg.push(`<rect x="${PAD}" y="${top}" width="${TABLE_W}" height="${TH_H + randuri.length * ROW_H}" fill="none" stroke="${MAROON}" stroke-opacity="0.35" stroke-width="${S}"/>`);

  // Oferta se scrie SUB tabel, nu ca rând în el: e singurul preț din anunț care
  // nu iese din tarif × km, iar un rând obișnuit ar face-o să pară o greșeală.
  const subTabel = top + TH_H + randuri.length * ROW_H;
  if (oferta) {
    svg.push(textPath(fB,
      `Bălți - Chișinău: ${oferta.cuReducere} lei în loc de ${oferta.intreg} · Бэлць - Кишинёв: ${oferta.cuReducere} лей вместо ${oferta.intreg}`,
      CANVAS_W / 2, subTabel + 22 * S, 12.5 * S, GREEN, 'middle'));
  }

  const fy = subTabel + ofertaH + 20 * S;
  svg.push(textPath(fB, `Toate destinațiile și orarul: ${site}`, CANVAS_W / 2, fy, 13 * S, MAROON_DK, 'middle'));
  svg.push(textPath(fR, `Все направления и расписание: ${site}`, CANVAS_W / 2, fy + 17 * S, 12 * S, GREY, 'middle'));

  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${H}">
${svg.join('\n')}
</svg>`;
  return await sharp(Buffer.from(svgStr)).png().toBuffer();
}
