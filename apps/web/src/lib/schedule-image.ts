import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import opentype from 'opentype.js';
import type { GraficRow } from '@/app/(dashboard)/grafic/actions';

// Template dimensions (pre-printed routes PNG)
const TPL_W = 896;
const TPL_H = 1200;

// Output canvas: 9:16 for Instagram Reels/Stories
const OUT_W = 1080;
const OUT_H = 1920;

// Scale template down to leave ~130px safe zone on each side
const SCALE = 0.91;
const SCALED_W = Math.round(TPL_W * SCALE); // ~815
const SCALED_H = Math.round(TPL_H * SCALE); // ~1092
const PAD_X = Math.round((OUT_W - SCALED_W) / 2); // ~133px
const PAD_Y = Math.round((OUT_H - SCALED_H) / 2); // ~414px
const BG_COLOR = '#F5EDE0'; // cream background matching template

// Layout constants (coordinates on the output canvas — scaled)
const LAYOUT = {
  WIDTH: OUT_W,
  HEIGHT: OUT_H,
  DATE_X: Math.round(500 * SCALE) + PAD_X,
  DATE_Y: Math.round(85 * SCALE) + PAD_Y,
  DATE_SIZE: Math.round(38 * SCALE),
  DRIVER_X: Math.round(805 * SCALE) + PAD_X,
  TABLE_TOP: Math.round(285 * SCALE) + PAD_Y,
  ROW_HEIGHT: Math.round(67 * SCALE),
  NAME_GAP: Math.round(22 * SCALE),
  PHONE_SIZE: Math.round(22 * SCALE),
  NAME_SIZE: Math.round(16 * SCALE),
};

// Caches
const templateCache = new Map<string, Buffer>();
let fontRegular: opentype.Font | null = null;
let fontBold: opentype.Font | null = null;
let fontDateItalic: opentype.Font | null = null;

function loadOTFont(name: string): opentype.Font {
  const fontPath = path.join(process.cwd(), 'public', 'fonts', name);
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Font not found: ${fontPath}`);
  }
  const buffer = fs.readFileSync(fontPath);
  return opentype.parse(buffer.buffer as ArrayBuffer);
}

function getFonts(): { regular: opentype.Font; bold: opentype.Font; dateItalic: opentype.Font } {
  if (!fontRegular) fontRegular = loadOTFont('OpenSans-Regular.ttf');
  if (!fontBold) fontBold = loadOTFont('OpenSans-Bold.ttf');
  if (!fontDateItalic) fontDateItalic = loadOTFont('CormorantGaramond-MediumItalic.ttf');
  return { regular: fontRegular, bold: fontBold, dateItalic: fontDateItalic };
}

function getTemplate(page: 1 | 2): Buffer {
  const key = `schedule-p${page}`;
  if (!templateCache.has(key)) {
    const p = path.join(process.cwd(), 'public', 'templates', `${key}.png`);
    if (!fs.existsSync(p)) {
      throw new Error(`Template not found: ${p}`);
    }
    templateCache.set(key, fs.readFileSync(p));
  }
  return templateCache.get(key)!;
}

/** Render text as SVG path (font-independent rendering) */
function textToPath(
  font: opentype.Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  anchor: 'start' | 'middle' = 'start'
): string {
  const p = font.getPath(text, 0, 0, fontSize);
  const bb = p.getBoundingBox();
  let ox = x - (anchor === 'middle' ? (bb.x2 - bb.x1) / 2 : 0) - bb.x1;
  const d = font.getPath(text, ox, y, fontSize).toPathData(2);
  return d ? `<path d="${d}" fill="${fill}"/>` : '';
}

/** Build SVG overlay: only date + driver phone/name */
function buildSvg(rows: GraficRow[], date: string): string {
  const fonts = getFonts();
  const { WIDTH, HEIGHT, DATE_X, DATE_Y, DATE_SIZE, DRIVER_X, TABLE_TOP, ROW_HEIGHT, NAME_GAP, PHONE_SIZE, NAME_SIZE } = LAYOUT;

  const [y, m, d] = date.split('-');
  const dateDisplay = `${d}.${m}.${y}`;

  let paths = '';

  // Date (italic serif, matching "Grafic din:" style)
  paths += textToPath(fonts.dateItalic, dateDisplay, DATE_X, DATE_Y, DATE_SIZE, '#4a2028');

  // Nr. Șofer: phone + name per row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phoneY = TABLE_TOP + i * ROW_HEIGHT;
    const nameY = phoneY + NAME_GAP;

    if (row.driver_phone) {
      paths += textToPath(fonts.bold, row.driver_phone, DRIVER_X, phoneY, PHONE_SIZE, '#4a2028', 'middle');
    }
    if (row.driver_name) {
      paths += textToPath(fonts.regular, row.driver_name, DRIVER_X, nameY, NAME_SIZE, '#4a2028', 'middle');
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
${paths}
</svg>`;
}

/** Generate schedule image: 1080×1920 canvas + scaled centered template + date + driver overlay */
export async function generateScheduleImage(
  rows: GraficRow[],
  date: string,
  page: 1 | 2
): Promise<Buffer> {
  const templateBuffer = getTemplate(page);
  const svg = buildSvg(rows, date);

  // Scale template down for safe margins
  const scaledTemplate = await sharp(templateBuffer)
    .resize(SCALED_W, SCALED_H)
    .toBuffer();

  // Create 1080×1920 canvas with cream background, center scaled template on it
  return await sharp({
    create: { width: OUT_W, height: OUT_H, channels: 3, background: BG_COLOR },
  })
    .composite([
      { input: scaledTemplate, top: PAD_Y, left: PAD_X },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
