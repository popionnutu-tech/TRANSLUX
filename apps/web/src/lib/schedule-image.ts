import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import opentype from 'opentype.js';
import type { GraficRow } from '@/app/(dashboard)/grafic/actions';

/* ── Hi-res 2× scale (matches html2canvas scale:2) ── */
const S = 2;

/* ── Canvas ── */
const CANVAS_W = 900 * S;

/* ── Padding (16px at 1×, inside the border-box div) ── */
const PAD = 16 * S;

/* ── Table (868px at 1× = 900 - 2×16 padding, border-box) ── */
const TABLE_W = (900 - 32) * S;

/* ── Columns (tableLayout:fixed colgroup widths at 2×) ── */
const COL_W = {
  empty: 10 * S,
  route: (900 - 32 - 10 - 200 - 220) * S, // 438×2 = 876
  depart: 200 * S,
  driver: 220 * S,
};
const COL_X = {
  empty: PAD,
  route: PAD + COL_W.empty,
  depart: PAD + COL_W.empty + COL_W.route,
  driver: PAD + COL_W.empty + COL_W.route + COL_W.depart,
};

/* ── Row heights ── */
const LOGO_AREA = 76 * S;
const SUB_LINE = 24 * S;
const TH_H = 56 * S;
const ROW_H = 56 * S;

/* ── Colors ── */
const MAROON = '#9B1B30';
const MAROON_DK = '#6b1221';
const ROW_BG = ['#fdf6f0', '#f5ebe3'];

/* ── Font sizes (at 2×) ── */
const FS = {
  date: 28 * S,
  sub: 13 * S,
  th: 20 * S,
  time: 28 * S,
  route: 15 * S,
  stops: 11 * S,
  depart: 20 * S,
  phone: 18 * S,
  name: 13 * S,
};

/* ── Caches ── */
let _fR: opentype.Font | null = null;
let _fB: opentype.Font | null = null;
let _fI: opentype.Font | null = null;
let _logo: string | null = null;

function loadFont(name: string): opentype.Font {
  const p = path.join(process.cwd(), 'public', 'fonts', name);
  if (!fs.existsSync(p)) throw new Error(`Font not found: ${p}`);
  const buf = fs.readFileSync(p);
  return opentype.parse(buf.buffer as ArrayBuffer);
}

function fonts() {
  _fR ??= loadFont('OpenSans-Regular.ttf');
  _fB ??= loadFont('OpenSans-Bold.ttf');
  _fI ??= loadFont('CormorantGaramond-MediumItalic.ttf');
  return { r: _fR!, b: _fB!, i: _fI! };
}

function logoBase64(): string {
  if (!_logo) {
    const p = path.join(process.cwd(), 'public', 'translux-logo-bordo.png');
    _logo = fs.readFileSync(p).toString('base64');
  }
  return _logo;
}

/* ── SVG helpers ── */

/** Render text as SVG <path> (font-independent rendering) */
function textPath(
  font: opentype.Font,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
): string {
  const p = font.getPath(text, 0, 0, size);
  const bb = p.getBoundingBox();
  const w = bb.x2 - bb.x1;
  let ox: number;
  if (anchor === 'middle') ox = x - w / 2 - bb.x1;
  else if (anchor === 'end') ox = x - w - bb.x1;
  else ox = x - bb.x1;
  const d = font.getPath(text, ox, y, size).toPathData(2);
  return d ? `<path d="${d}" fill="${fill}"/>` : '';
}

/** Measure text width in pixels */
function textW(font: opentype.Font, text: string, size: number): number {
  const p = font.getPath(text, 0, 0, size);
  const bb = p.getBoundingBox();
  return bb.x2 - bb.x1;
}

/** Truncate text to fit within maxW pixels */
function truncText(font: opentype.Font, text: string, size: number, maxW: number): string {
  if (textW(font, text, size) <= maxW) return text;
  let t = text;
  while (t.length > 3 && textW(font, t + '…', size) > maxW) t = t.slice(0, -1);
  return t + '…';
}

/* ── Main image generator ── */

export async function generateScheduleImage(
  rows: GraficRow[],
  date: string,
): Promise<Buffer> {
  const assigned = rows.filter(r => r.driver_id);
  const { r: fR, b: fB, i: fI } = fonts();
  const logo = logoBase64();

  const n = Math.max(assigned.length, 1);
  const H = PAD + LOGO_AREA + SUB_LINE + TH_H + n * ROW_H + PAD;

  const svg: string[] = [];

  // White background
  svg.push(`<rect width="${CANVAS_W}" height="${H}" fill="#fff"/>`);

  /* ── Header: TRANSLUX logo + date ── */
  const logoImgH = 36 * S;
  const logoY = PAD + (LOGO_AREA - logoImgH) / 2 - 4 * S;
  svg.push(
    `<image x="${PAD + 75 * S}" y="${logoY}" height="${logoImgH}"` +
    ` href="data:image/png;base64,${logo}" preserveAspectRatio="xMinYMid meet"/>`,
  );

  const [yr, mo, dy] = date.split('-');
  const dateText = `Grafic din: ${dy}.${mo}.${yr}`;
  const dateY = PAD + LOGO_AREA / 2 + FS.date * 0.3;
  svg.push(textPath(fI, dateText, CANVAS_W - PAD - 76 * S, dateY, FS.date, MAROON_DK, 'end'));

  /* ── Sub-header: "Mai multe detalii: translux.md" ── */
  const subBaseY = PAD + LOGO_AREA + FS.sub;
  const sub1 = 'Mai multe detalii: ';
  const sub2 = 'translux.md';
  const w1 = textW(fR, sub1, FS.sub);
  const w2 = textW(fB, sub2, FS.sub);
  const subX = (CANVAS_W - w1 - w2) / 2;
  svg.push(textPath(fR, sub1, subX, subBaseY, FS.sub, MAROON));
  svg.push(textPath(fB, sub2, subX + w1, subBaseY, FS.sub, MAROON));

  /* ── Table ── */
  const tableY = PAD + LOGO_AREA + SUB_LINE;
  const tableH = TH_H + n * ROW_H;
  const bw = 2 * S; // border width

  // Outer border
  svg.push(`<rect x="${PAD}" y="${tableY}" width="${TABLE_W}" height="${tableH}" fill="none" stroke="${MAROON}" stroke-width="${bw}"/>`);

  // Header row background
  svg.push(`<rect x="${PAD}" y="${tableY}" width="${TABLE_W}" height="${TH_H}" fill="${MAROON}"/>`);

  // Header text
  const thMidY = tableY + TH_H / 2;

  // "RUTA" (left-aligned in route column)
  svg.push(textPath(fB, 'RUTA', COL_X.route + 50 * S, thMidY + FS.th * 0.35, FS.th, '#fff'));

  // "PLECARE DIN / CHIȘINĂU" (centered, two lines)
  const departCx = COL_X.depart + COL_W.depart / 2;
  svg.push(textPath(fB, 'PLECARE DIN', departCx, thMidY - 2 * S, FS.th * 0.82, '#fff', 'middle'));
  svg.push(textPath(fB, 'CHIȘINĂU', departCx, thMidY + FS.th * 0.75, FS.th * 0.82, '#fff', 'middle'));

  // "NR. ȘOFER" (centered)
  const driverCx = COL_X.driver + COL_W.driver / 2;
  svg.push(textPath(fB, 'NR. ȘOFER', driverCx, thMidY + FS.th * 0.35, FS.th, '#fff', 'middle'));

  /* ── Data rows ── */
  const bodyY = tableY + TH_H;
  const cellPad = 10 * S;

  for (let i = 0; i < assigned.length; i++) {
    const row = assigned[i];
    const rY = bodyY + i * ROW_H;

    // Alternating background
    svg.push(`<rect x="${PAD + bw / 2}" y="${rY}" width="${TABLE_W - bw}" height="${ROW_H}" fill="${ROW_BG[i % 2]}"/>`);

    // Bottom divider line
    if (i < assigned.length - 1) {
      svg.push(`<line x1="${PAD}" y1="${rY + ROW_H}" x2="${PAD + TABLE_W}" y2="${rY + ROW_H}" stroke="rgba(155,27,48,0.15)" stroke-width="1"/>`);
    }

    // Column dividers
    svg.push(`<line x1="${COL_X.depart}" y1="${rY}" x2="${COL_X.depart}" y2="${rY + ROW_H}" stroke="rgba(155,27,48,0.1)" stroke-width="1"/>`);
    svg.push(`<line x1="${COL_X.driver}" y1="${rY}" x2="${COL_X.driver}" y2="${rY + ROW_H}" stroke="rgba(155,27,48,0.1)" stroke-width="1"/>`);

    // ── Route column: time + route name + stops ──
    const timeBaseY = rY + ROW_H * 0.42;

    // Departure time from Nord (big bold)
    svg.push(textPath(fB, row.time_nord, COL_X.route + cellPad, timeBaseY, FS.time, MAROON_DK));
    const timeWidth = textW(fB, row.time_nord, FS.time);

    // Route name (next to time)
    const routeName = row.dest_to.replace(/^Chi[sș]in[aă]u\s*[-–]\s*/i, '') + ' - Chișinău';
    const routeX = COL_X.route + cellPad + timeWidth + 8 * S;
    const maxRouteW = COL_X.depart - routeX - cellPad;
    svg.push(textPath(fB, truncText(fB, routeName, FS.route, maxRouteW), routeX, timeBaseY, FS.route, '#333'));

    // Stops (smaller, below)
    if (row.stops) {
      const stopsY = timeBaseY + 14 * S;
      const maxStopsW = COL_W.route - 2 * cellPad;
      svg.push(textPath(fR, truncText(fR, row.stops, FS.stops, maxStopsW), COL_X.route + cellPad, stopsY, FS.stops, '#888'));
    }

    // ── Departure from Chișinău ──
    if (row.time_chisinau) {
      const dtY = rY + ROW_H / 2 + FS.depart * 0.35;
      svg.push(textPath(fB, row.time_chisinau, departCx, dtY, FS.depart, MAROON_DK, 'middle'));
    }

    // ── Driver phone + name ──
    if (row.driver_phone) {
      const phoneY = rY + ROW_H * 0.38;
      svg.push(textPath(fB, row.driver_phone, driverCx, phoneY, FS.phone, MAROON_DK, 'middle'));
      if (row.driver_name) {
        svg.push(textPath(fR, row.driver_name, driverCx, phoneY + 16 * S, FS.name, '#555', 'middle'));
      }
    }
  }

  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${H}">
${svg.join('\n')}
</svg>`;

  return await sharp(Buffer.from(svgStr)).png().toBuffer();
}
