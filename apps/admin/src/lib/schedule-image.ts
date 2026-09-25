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
  // telefonul (Ion, 07–08.09); public/site = carduri cu ora din nord, ruta, ora din Chișinău, telefon +
  // prenume (ION-72). Telefonul MEREU +373 (Ion, 23.09).
  const assigned = rows.filter(r => r.driver_id);
  // primele 3 sate de pe traseu; când trei nu încap sub rută (peste ~34 de semne), rămân două, fără «…»
  const satele = (stops?: string) => {
    const s = (stops || '').split('/').map(x => x.trim()).filter(x => x && !/^Intersec/i.test(x));
    const trei = s.slice(0, 3).join(' · ');
    return trei.length > 34 ? s.slice(0, 2).join(' · ') : trei;
  };
  const pagina = opts.pagina && opts.pagini && opts.pagini > 1 ? ` · ${opts.pagina} din ${opts.pagini}` : '';
  if (opts.forDrivers) {
    // Se citește de pe telefon (Ion, 25.09: «fă normal șriftul, umple locul maximal»): imaginea
    // îngustă, ca Telegram s-o arate pe toată lățimea ecranului fără s-o micșoreze, literele mari.
    // «– Chișinău» se repeta pe fiecare rând — toate cursele din nord merg la Chișinău, o spune subtitlul.
    const p = poster({ latime: 540, supratitlu: 'Grafic Mejgorod', titlu: 'Plecările din nord', eticheta: ziText(date),
      subtitlu: `${assigned.length} ${assigned.length === 1 ? 'cursă' : 'curse'} spre Chișinău, cu șofer. Cursele anulate nu apar.` });
    p.tabel([{ titlu: 'Ora', latime: 56 }, { titlu: 'Ruta', latime: 166 }, { titlu: 'Mașina', latime: 94 }, { titlu: 'Șoferul', latime: 186 }],
      assigned.map(r => [
        { text: r.time_nord, bold: true, culoare: CULORI.bordo, marime: 15 },
        { text: r.dest_to.replace(/^Chi[sș]in[aă]u\s*[-–]\s*/i, ''), bold: true, marime: 13.5,
          // Ion, 25.09: «cu șrift mic sub rută satele, 3» — primele trei opriri, fără intersecții
          mic: satele(r.stops), micMarime: 10.5 },
        { text: r.vehicle_plate?.trim() || '—', bold: true, marime: 15 },
        { text: r.driver_full_name || r.driver_name || '—', bold: true, marime: 13.5,
          mic: telefon(r.driver_phone), micMarime: 12.5, micCuloare: CULORI.text },
      ]), { gol: 'Nicio cursă cu șofer în ziua asta.', rand: 50 });
    return p.png();
  }

  // Afișul public se postează ca Reels (1080×1920) și se citește de pe telefon: o cursă = un card, două pe
  // rând, literele mari (Ion, 25.09: «e foarte nevăzibil și neclar mic» → «pentru interurbane grafic în așa
  // stil», ION-72). Toate cursele merg la Chișinău, deci ruta e doar capătul din nord; satele nu mai încap.
  const p = poster({ latime: 540, antetMare: true, format916: true, supratitlu: 'Curse interurbane',
    titlu: `Programul zilei${pagina}`, eticheta: ziText(date) });
  p.bilete(assigned.map(r => ({
    ora: r.time_nord,
    ruta: r.dest_to.replace(/^Chi[sș]in[aă]u\s*[-–]\s*/i, ''),
    sub: r.time_chisinau ? `Din Chișinău ${r.time_chisinau}` : undefined,
    telefon: telefon(r.driver_phone) || '—',
    nume: r.driver_name ?? undefined,
  })), { gol: 'Nicio cursă în ziua asta.' });
  p.nota(opts.pagina && opts.pagini && opts.pagina < opts.pagini
    ? `Toate spre Chișinău · rezervări la șofer · continuarea pe imaginea ${opts.pagina + 1}`
    : 'Toate spre Chișinău · rezervări la șofer · translux.md');
  return p.png();
}

/* ── Edineț-Chișinău image generator (second type) ── */

export async function generateScheduleEdinetImage(
  rows: GraficEdinetRow[],
  date: string,
): Promise<Buffer> {
  // Format 9:16 (Reels / Stories) pe foaia îngustă, ca pe telefon să nu se micșoreze, pe carduri ca
  // interurbanele (Ion, 25.09: «aplică aceste și la Edineț», ION-72): ora din Edineț mare, alături Bălți,
  // sub ea ora de plecare din Chișinău, jos telefonul cu prenumele.
  const assigned = rows.filter(r => r.driver_id);
  const p = poster({ latime: 540, antetMare: true, format916: true, supratitlu: 'Edineț – Chișinău',
    titlu: 'Programul zilei', eticheta: ziText(date) });
  p.bilete(assigned.map(r => ({
    ora: r.hour_edinet || '—',
    ruta: r.hour_balti ? `Bălți ${r.hour_balti}` : 'Edineț',
    sub: r.time_chisinau_retur ? `Din Chișinău ${r.time_chisinau_retur}` : undefined,
    telefon: telefon(r.driver_phone) || '—',
    nume: r.driver_name ?? undefined,
  })), { gol: 'Nicio cursă în ziua asta.' });
  p.nota('Din Edineț prin Bălți spre Chișinău · rezervări la șofer · translux.md');
  return p.png();
}
