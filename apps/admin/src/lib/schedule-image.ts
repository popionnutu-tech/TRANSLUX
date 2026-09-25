import fs from 'fs';
import path from 'path';
import opentype from 'opentype.js';
import type { GraficEdinetRow } from '@/app/(dashboard)/grafic/actions';
import { poster, CULORI, telefon, ziText } from './poster-sablon';

/* Desenarea graficelor stă în poster-sablon.ts (Ion, 25.09: «aplică peste tot noul format»);
   aici rămân fonturile, logoul și randarea text→path, comune tuturor imaginilor. */

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

// Exportate pentru imaginea penalităților de aspect (driver-penalties-image.ts):
// aceleași fonturi, același logo, același randare text→path.
export function fonts() {
  _fR ??= loadFont('OpenSans-Regular.ttf');
  _fB ??= loadFont('OpenSans-Bold.ttf');
  _fI ??= loadFont('CormorantGaramond-MediumItalic.ttf');
  return { r: _fR!, b: _fB!, i: _fI! };
}

export function logoBase64(): string {
  if (!_logo) {
    const p = path.join(process.cwd(), 'public', 'translux-logo-bordo.png');
    _logo = fs.readFileSync(p).toString('base64');
  }
  return _logo;
}

/* ── SVG helpers ── */

/** Render text as SVG <path> (font-independent rendering) */
export function textPath(
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
export function truncText(font: opentype.Font, text: string, size: number, maxW: number): string {
  if (textW(font, text, size) <= maxW) return text;
  let t = text;
  while (t.length > 3 && textW(font, t + '…', size) > maxW) t = t.slice(0, -1);
  return t + '…';
}

/* ── Main image generator ── */

export interface ScheduleImageOptions {
  /**
   * Varianta pentru grupa șoferilor «Mejgorod». Ion, 07.09: «se adaugă doar
   * numele și familia complet»; Ion, 08.09: «doar în el să apară numele complet
   * șofer și număr mașina», apoi: «scoate de sub denumirea rutelor satele, doar
   * denumirea rutei — fiecare rând mai îngust; numărul mașinii pune în loc de ora
   * plecare din Chișinău, să fie mare». Deci: RUTA (ora + numele rutei, fără
   * opriri, rând scund) | MAȘINA (numărul, mare) | ȘOFER (numele complet,
   * telefonul sub el). Imaginea publică (site, descărcare) rămâne neschimbată:
   * opriri, ora din Chișinău, telefon + prenume.
   */
  forDrivers?: boolean;
  /** imaginea publică e pe două foi (ca la print): «1 din 2» în titlu și trimitere la continuare */
  pagina?: number;
  pagini?: number;
}

/** Ce are nevoie imaginea dintr-un rând — GraficRow îl satisface. */
export interface ScheduleImageRow {
  driver_id: string | null;
  /** ora plecării din nord */
  time_nord: string;
  time_chisinau: string;
  dest_to: string;
  stops?: string;
  vehicle_plate: string | null;
  driver_phone: string | null;
  driver_name: string | null;
  driver_full_name?: string | null;
}

export async function generateScheduleImage(
  rows: ScheduleImageRow[],
  date: string,
  opts: ScheduleImageOptions = {},
): Promise<Buffer> {
  // Șablonul posterelor (poster-sablon.ts) — Ion, 25.09: «aplică peste tot noul format».
  // Conținutul rămâne cel stabilit: Mejgorod = ora din nord, ruta, MAȘINA mare, șoferul complet cu
  // telefonul (Ion, 07–08.09); public/site = ora din nord, ruta cu opriri, ora din Chișinău, telefon +
  // prenume. Telefonul MEREU +373 (Ion, 23.09).
  const assigned = rows.filter(r => r.driver_id);
  const ruta = (dest: string) => `${dest.replace(/^Chi[sș]in[aă]u\s*[-–]\s*/i, '')} – Chișinău`;
  const pagina = opts.pagina && opts.pagini && opts.pagini > 1 ? ` · ${opts.pagina} din ${opts.pagini}` : '';
  if (opts.forDrivers) {
    const p = poster({ supratitlu: 'Grafic Mejgorod', titlu: 'Plecările din nord', eticheta: ziText(date),
      subtitlu: `${assigned.length} ${assigned.length === 1 ? 'cursă' : 'curse'} cu șofer. Cursele anulate nu apar.` });
    // Ion, 25.09: «nu se vede bine datele în spația nume șofer» — numele bold și mare, telefonul negru, coloana mai lată.
    p.tabel([{ titlu: 'Ora', latime: 66 }, { titlu: 'Ruta', latime: 230 }, { titlu: 'Mașina', latime: 124 }, { titlu: 'Șoferul', latime: 290 }],
      assigned.map(r => [
        { text: r.time_nord, bold: true, culoare: CULORI.bordo, marime: 14 },
        { text: ruta(r.dest_to), bold: true },
        { text: r.vehicle_plate?.trim() || '—', bold: true, marime: 15 },
        { text: r.driver_full_name || r.driver_name || '—', bold: true, marime: 13.5,
          mic: telefon(r.driver_phone), micMarime: 11.5, micCuloare: CULORI.text },
      ]), { gol: 'Nicio cursă cu șofer în ziua asta.' });
    return p.png();
  }
  const p = poster({ supratitlu: 'Curse interurbane', titlu: `Programul zilei${pagina}`, eticheta: ziText(date),
    subtitlu: 'Din nord spre Chișinău și înapoi. Rezervări și întrebări direct la șofer, la numărul din dreptul cursei.' });
  p.tabel([{ titlu: 'Din nord', latime: 76 }, { titlu: 'Ruta', latime: 330 }, { titlu: 'Din Chișinău', latime: 100 }, { titlu: 'Contact', latime: 200 }],
    assigned.map(r => [
      { text: r.time_nord, bold: true, culoare: CULORI.bordo, marime: 14 },
      { text: ruta(r.dest_to), bold: true, mic: (r.stops || '').replace(/\s*\/\s*/g, ' · ') },
      { text: r.time_chisinau || '—', bold: true, marime: 14 },
      { text: telefon(r.driver_phone) || '—', bold: true, mic: r.driver_name ?? '' },
    ]), { gol: 'Nicio cursă în ziua asta.' });
  p.nota(opts.pagina && opts.pagini && opts.pagina < opts.pagini
    ? `Continuarea pe imaginea ${opts.pagina + 1} din ${opts.pagini}. Mai multe detalii: translux.md`
    : 'Mai multe detalii: translux.md · orele pot varia cu câteva minute în funcție de drum.');
  return p.png();
}

/* ── Edineț-Chișinău image generator (second type) ── */

export async function generateScheduleEdinetImage(
  rows: GraficEdinetRow[],
  date: string,
): Promise<Buffer> {
  // Format 9:16 fix (TikTok / Reels / Stories), pe șablonul nou; zonele de sus și de jos rămân libere.
  const assigned = rows.filter(r => r.driver_id);
  const p = poster({ supratitlu: 'Edineț – Chișinău', titlu: 'Programul zilei', eticheta: ziText(date),
    subtitlu: 'Plecări din Edineț și din Bălți spre Chișinău, și înapoi din Chișinău. Rezervări la șofer.', format916: true });
  p.tabel([{ titlu: 'Edineț', latime: 120, aliniere: 'middle' }, { titlu: 'Bălți', latime: 120, aliniere: 'middle' },
    { titlu: 'Chișinău (retur)', latime: 150, aliniere: 'middle' }, { titlu: 'Contact', latime: 230 }],
    assigned.map(r => [
      { text: r.hour_edinet || '—', bold: true, culoare: CULORI.bordo, marime: 15 },
      { text: r.hour_balti || '—', bold: true, marime: 15 },
      { text: r.time_chisinau_retur || '—', bold: true, marime: 15 },
      { text: telefon(r.driver_phone) || '—', bold: true, mic: r.driver_name ?? '' },
    ]), { gol: 'Nicio cursă în ziua asta.' });
  p.nota('Mai multe detalii: translux.md');
  return p.png();
}
