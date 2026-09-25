import sharp from 'sharp';
import type opentype from 'opentype.js';
import { fonts, logoBase64, textPath, truncText } from './schedule-image';

/**
 * Șablonul posterelor TRANSLUX (Ion, 25.09.2026: «fă un design mai nou la acest poster, noi îl
 * folosim acest șablon peste multe lucruri»). Un singur loc pentru fundal, antet, carduri și
 * tabel, ca toate posterele din grupe să arate la fel. Totul e SVG cu text desenat ca path
 * (fonturile nu depind de mașina pe care rulează), apoi PNG prin sharp.
 *
 * Folosire: const p = poster({ latime: 820, titlu, subtitlu, eticheta });
 *           p.carduri([...]); p.tabel(coloane, randuri); p.nota('…'); const png = await p.png();
 */
export const CULORI = {
  fundal: '#f6f1ec', card: '#ffffff', bordo: '#8f1a2e', bordoInchis: '#5e1020', text: '#231a1c',
  gri: '#6e6466', griDeschis: '#a39a9c', linie: '#eadfd6', zebra: '#fbf7f3', antetTabel: '#f3e8e1',
  verde: '#23794a', verdeFundal: '#e4f2e9', rosu: '#b3261e',
};
const S = 2;   // totul se desenează la 2×, pentru telefoane

export type Aliniere = 'start' | 'end' | 'middle';
export interface Coloana { titlu: string; latime: number; aliniere?: Aliniere }
export interface Celula { text: string; culoare?: string; bold?: boolean; fundal?: string; mic?: string; marime?: number;
  /** rândul mic de sub text: implicit 9 pt, gri */
  micMarime?: number; micCuloare?: string }
export interface Card { eticheta: string; titlu: string; text: string; valoare?: string; subValoare?: string }
export interface Bilet { ora: string; ruta: string; sub?: string;
  /** rând mic, gri, pe toată lățimea cardului (satele rutei) */ sate?: string;
  /** textul mare din bandă (telefonul; pe graficul șoferilor, numele) și cel mic alături */ telefon: string; nume?: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function textW(f: opentype.Font, t: string, size: number) { const b = f.getPath(t, 0, 0, size).getBoundingBox(); return b.x2 - b.x1; }
/** împarte un text în rânduri care încap în `max` px */
export function rupe(f: opentype.Font, t: string, size: number, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of t.split(/\s+/)) { const c = cur ? `${cur} ${w}` : w; if (textW(f, c, size) <= max || !cur) cur = c; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur); return out;
}

/** «069123456» / «37369123456» → «+373 69 123 456» (ca pe translux.md, lib/phone.ts din web: Ion, 23.09 —
 *  numărul MEREU cu +373, ca să sune și de peste hotare). Altceva rămâne cum e. */
export function telefon(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  const n = /^373\d{8}$/.test(d) ? d.slice(3) : /^0\d{8}$/.test(d) ? d.slice(1) : /^\d{8}$/.test(d) ? d : null;
  return n ? `+373 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}` : String(raw ?? '');
}

/** Ziua ca pe etichetă: «vineri, 25 septembrie». */
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const ZILE_RO = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
export function ziText(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${ZILE_RO[d.getUTCDay()]}, ${d.getUTCDate()} ${LUNI_RO[d.getUTCMonth()]}`;
}

export function poster(opts: { latime?: number; titlu: string; subtitlu?: string; eticheta?: string; supratitlu?: string;
  /** format fix (TikTok / Reels / Stories): înălțime = lățime × 16/9, conținutul centrat între zonele sigure */
  format916?: boolean;
  /** antet de afiș public (graficul postat pe Facebook): logoul pe toată lățimea, dedesubt supratitlul mare cu
   *  data alături, apoi titlul; capetele tabelului și nota mai mari (Ion, 25.09: «încă mai mare, în special
   *  partea de sus TRANSLUX», ION-72) */
  antetMare?: boolean }) {
  const { r: fR, b: fB } = fonts();
  const W = (opts.latime ?? 820) * S, PAD = 28 * S, IN = W - 2 * PAD;
  const svg: string[] = [];
  let y = PAD;
  const mare = !!opts.antetMare;

  if (mare) {
    const logoH = IN * (192 / 1318);
    svg.push(`<image href="data:image/png;base64,${logoBase64()}" x="${PAD}" y="${y}" width="${IN}" height="${logoH}"/>`);
    y += logoH + 38 * S;
    if (opts.supratitlu) svg.push(textPath(fB, opts.supratitlu, PAD, y, 27 * S, CULORI.bordo, 'start'));
    if (opts.eticheta) {
      const fs = 15 * S, w = textW(fB, opts.eticheta, fs) + 32 * S, h = 38 * S;
      svg.push(`<rect x="${W - PAD - w}" y="${y - h / 2 - 9 * S}" width="${w}" height="${h}" rx="${h / 2}" fill="${CULORI.bordo}"/>`);
      svg.push(textPath(fB, opts.eticheta, W - PAD - w / 2, y - 3.5 * S, fs, '#fff', 'middle'));
    }
    y += 36 * S;
    for (const l of rupe(fB, opts.titlu, 25 * S, IN)) { svg.push(textPath(fB, l, PAD, y, 25 * S, CULORI.text, 'start')); y += 30 * S; }
    if (opts.subtitlu) { y -= 2 * S; for (const l of rupe(fR, opts.subtitlu, 13 * S, IN)) { svg.push(textPath(fR, l, PAD, y, 13 * S, CULORI.gri, 'start')); y += 18 * S; } }
    y += 2 * S;
  } else {
  // antet: logo stânga, eticheta (perioada) dreapta, apoi supratitlu, titlu, subtitlu
  // logo mare, ca pe graficul Mejgorod (Ion, 25.09: «TRANSLUX să fie mare, ca și la grafic»); pe posterul
  // îngust (graficul Mejgorod pentru telefon) logoul se micșorează cât să nu intre sub eticheta cu data
  const etFs = 13 * S, etW = opts.eticheta ? textW(fB, opts.eticheta, etFs) + 30 * S : 0;
  const logoW = Math.min(50 * S * (1318 / 192), IN - (etW ? etW + 16 * S : 0)), logoH = logoW * (192 / 1318);
  svg.push(`<image href="data:image/png;base64,${logoBase64()}" x="${PAD}" y="${y}" width="${logoW}" height="${logoH}"/>`);
  if (opts.eticheta) {
    const fs = etFs, w = etW, h = 34 * S;
    svg.push(`<rect x="${W - PAD - w}" y="${y + (logoH - h) / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${CULORI.bordo}"/>`);
    svg.push(textPath(fB, opts.eticheta, W - PAD - w / 2, y + logoH / 2 + 5 * S, fs, '#fff', 'middle'));
  }
  y += logoH + 30 * S;
  // supratitlul spune a cui e foaia (uzina, linia) — mare, bordo (Ion, 25.09: «LEAR Ungheni să fie mai mare»)
  if (opts.supratitlu) { svg.push(textPath(fB, opts.supratitlu, PAD, y + 4 * S, 20 * S, CULORI.bordo, 'start')); y += 34 * S; }
  for (const l of rupe(fB, opts.titlu, 22 * S, IN)) { svg.push(textPath(fB, l, PAD, y, 22 * S, CULORI.text, 'start')); y += 28 * S; }
  if (opts.subtitlu) { y -= 4 * S; for (const l of rupe(fR, opts.subtitlu, 11 * S, IN)) { svg.push(textPath(fR, l, PAD, y, 11 * S, CULORI.gri, 'start')); y += 16 * S; } }
  y += 14 * S;
  }

  const api = {
    W, PAD, IN, get y() { return y; },
    /** carduri egale pe un rând: etichetă mică, titlu, text scurt, valoare mare jos */
    carduri(carduri: Card[]) {
      const gap = 12 * S, n = carduri.length, w = (IN - gap * (n - 1)) / n, pi = 14 * S;
      const randuri = carduri.map(c => rupe(fR, c.text, 10 * S, w - 2 * pi));
      const maxR = Math.max(...randuri.map(r => r.length));
      const h = pi + 12 * S + 20 * S + maxR * 14 * S + (carduri.some(c => c.valoare) ? 40 * S : 0) + pi;
      carduri.forEach((c, i) => {
        const x = PAD + i * (w + gap);
        svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${12 * S}" fill="${CULORI.card}" stroke="${CULORI.linie}" stroke-width="${S}"/>`);
        svg.push(`<rect x="${x}" y="${y + 14 * S}" width="${4 * S}" height="${28 * S}" rx="${2 * S}" fill="${CULORI.bordo}"/>`);
        let cy = y + pi + 8 * S;
        svg.push(textPath(fB, c.eticheta.toUpperCase(), x + pi, cy, 9 * S, CULORI.bordo, 'start')); cy += 20 * S;
        svg.push(textPath(fB, truncText(fB, c.titlu, 13 * S, w - 2 * pi), x + pi, cy, 13 * S, CULORI.text, 'start')); cy += 18 * S;
        for (const l of randuri[i]) { svg.push(textPath(fR, l, x + pi, cy, 10 * S, CULORI.gri, 'start')); cy += 14 * S; }
        if (c.valoare) {
          const vy = y + h - pi - 6 * S;
          svg.push(textPath(fB, c.valoare, x + pi, vy, 18 * S, CULORI.verde, 'start'));
          if (c.subValoare) svg.push(textPath(fR, c.subValoare, x + w - pi, vy, 9.5 * S, CULORI.griDeschis, 'end'));
        }
      });
      y += h + 18 * S;
      return api;
    },
    /** tabel într-un card alb, antet deschis, rânduri în zebră; `lat` e în puncte, se scalează la lățimea utilă */
    /** tabel într-un card alb, antet deschis, rânduri în zebră; `latime` e în puncte relative, se scalează.
     *  `coloane: 2` pune lista în două tabele alăturate (liste lungi: ~65 de șoferi); `compact` = rând scund. */
    tabel(cols: Coloana[], randuri: Celula[][], opt: { gol?: string; mare?: number; coloane?: 1 | 2; compact?: boolean;
      /** înălțimea rândului în puncte (implicit 42 cu rând mic, 30 fără, 24 compact) */ rand?: number } = {}) {
      const n = opt.coloane ?? 1, gap = 12 * S, lat = (IN - gap * (n - 1)) / n;
      const jum = Math.ceil(randuri.length / n);
      const bucati = n === 1 ? [randuri] : [randuri.slice(0, jum), randuri.slice(jum)];
      const areMic = randuri.some(r => r.some(c => c.mic));
      const TH = (mare ? 36 : 34) * S, RH = (opt.rand ?? (areMic ? 42 : opt.compact ? 24 : 30)) * S, fs = (opt.mare ?? (opt.compact ? 10.5 : 11)) * S;
      const h = TH + Math.max(1, jum) * RH;
      bucati.forEach((rows, bi) => {
        const X = PAD + bi * (lat + gap);
        const tot = cols.reduce((s, c) => s + c.latime, 0), k = lat / tot;
        svg.push(`<rect x="${X}" y="${y}" width="${lat}" height="${h}" rx="${12 * S}" fill="${CULORI.card}"/>`);
        svg.push(`<path d="M${X} ${y + 12 * S} a${12 * S} ${12 * S} 0 0 1 ${12 * S} -${12 * S} h${lat - 24 * S} a${12 * S} ${12 * S} 0 0 1 ${12 * S} ${12 * S} v${TH - 12 * S} h-${lat} z" fill="${CULORI.antetTabel}"/>`);
        const xs: number[] = []; let cx = X; for (const c of cols) { xs.push(cx); cx += c.latime * k; }
        const tx = (i: number, a: Aliniere) => a === 'end' ? xs[i] + cols[i].latime * k - 16 * S : a === 'middle' ? xs[i] + cols[i].latime * k / 2 : xs[i] + 10 * S;
        const thS = (mare ? 12.5 : 9.5) * S;
        cols.forEach((c, i) => c.titlu && svg.push(textPath(fB, truncText(fB, c.titlu, thS, c.latime * k - 12 * S), tx(i, c.aliniere ?? 'start'), y + TH / 2 + (mare ? 5 : 4) * S, thS, CULORI.bordoInchis, c.aliniere ?? 'start')));
        if (!rows.length && opt.gol && bi === 0) svg.push(textPath(fR, opt.gol, X + 14 * S, y + TH + RH / 2 + 4 * S, fs, CULORI.verde, 'start'));
        rows.forEach((r, j) => {
          const ry = y + TH + j * RH;
          // ultimul rând în zebră își rotunjește colțurile de jos, ca să nu iasă din card
          if (j % 2 === 1) svg.push(j === rows.length - 1 && rows.length === jum
            ? `<path d="M${X + S} ${ry} h${lat - 2 * S} v${RH - 12 * S} a${11 * S} ${11 * S} 0 0 1 -${11 * S} ${11 * S} h-${lat - 24 * S} a${11 * S} ${11 * S} 0 0 1 -${11 * S} -${11 * S} z" fill="${CULORI.zebra}"/>`
            : `<rect x="${X + S}" y="${ry}" width="${lat - 2 * S}" height="${RH}" fill="${CULORI.zebra}"/>`);
          if (j > 0) svg.push(`<rect x="${X + 10 * S}" y="${ry}" width="${lat - 20 * S}" height="${S / 2}" fill="${CULORI.linie}"/>`);
          r.forEach((c, i) => {
            const a = cols[i].aliniere ?? 'start', f = c.bold ? fB : fR, max = cols[i].latime * k - 14 * S;
            const fsC = c.marime ? c.marime * S : fs;
            const t = truncText(f, c.text, fsC, max);
            if (c.fundal) { const w = textW(f, t, fsC) + 14 * S, x = a === 'end' ? tx(i, a) - w + 7 * S : a === 'middle' ? tx(i, a) - w / 2 : tx(i, a) - 7 * S;
              const ph = Math.min(RH - 8 * S, fsC + 12 * S), py = (c.mic ? ry + RH / 2 - 1 * S : ry + RH / 2 + fsC * 0.36) - fsC * 0.36 - ph / 2;
              svg.push(`<rect x="${x}" y="${py}" width="${w}" height="${ph}" rx="${ph / 2}" fill="${c.fundal}"/>`); }
            const yT = c.mic ? ry + RH / 2 - 1 * S : ry + RH / 2 + fsC * 0.36;
            svg.push(textPath(f, esc(t), tx(i, a), yT, fsC, c.culoare ?? CULORI.text, a));
            if (c.mic) { const mS = (c.micMarime ?? 9) * S;
              svg.push(textPath(fR, esc(truncText(fR, c.mic, mS, max)), tx(i, a), ry + RH / 2 + mS + 4 * S, mS, c.micCuloare ?? CULORI.gri, a)); }
          });
        });
        svg.push(`<rect x="${X}" y="${y}" width="${lat}" height="${h}" rx="${12 * S}" fill="none" stroke="${CULORI.linie}" stroke-width="${S}"/>`);
      });
      y += h + 16 * S;
      return api;
    },
    /** o cursă = un card, două pe rând (graficul public al interurbanelor, Ion 25.09: «în așa stil», ION-72):
     *  ora mare bordo, alături ruta și un rând mic sub ea, jos banda cu telefonul și prenumele */
    bilete(bilete: Bilet[], opt: { gol?: string } = {}) {
      if (!bilete.length) {
        if (opt.gol) { svg.push(textPath(fR, opt.gol, PAD, y + 14 * S, 13 * S, CULORI.verde, 'start')); y += 30 * S; }
        return api;
      }
      // rândul cu satele (graficul șoferilor) lungește toate cardurile deodată, ca rândurile să rămână egale
      const ex = bilete.some(b => b.sate) ? 15 * S : 0;
      const gap = 8 * S, w = (IN - gap) / 2, h = 78 * S + ex, pi = 12 * S;
      const oraS = 28 * S, rutaS = 14 * S, subS = 11.5 * S, sateS = 10.5 * S, numeS = 11 * S;
      bilete.forEach((b, i) => {
        const x = PAD + (i % 2) * (w + gap), cy = y + Math.floor(i / 2) * (h + gap);
        svg.push(`<rect x="${x}" y="${cy}" width="${w}" height="${h}" rx="${12 * S}" fill="${CULORI.card}" stroke="${CULORI.linie}" stroke-width="${S}"/>`);
        svg.push(textPath(fB, esc(b.ora), x + pi, cy + 32 * S, oraS, CULORI.bordo, 'start'));
        const xr = x + pi + textW(fB, b.ora, oraS) + 10 * S, maxR = x + w - pi - xr;
        svg.push(textPath(fB, esc(truncText(fB, b.ruta, rutaS, maxR)), xr, cy + 24 * S, rutaS, CULORI.text, 'start'));
        if (b.sub) svg.push(textPath(fB, esc(truncText(fB, b.sub, subS, maxR)), xr, cy + 39 * S, subS, CULORI.bordoInchis, 'start'));
        if (b.sate) svg.push(textPath(fR, esc(truncText(fR, b.sate, sateS, w - 2 * pi)), x + pi, cy + 54 * S, sateS, CULORI.gri, 'start'));
        const by = cy + 46 * S + ex, lat = w - 2 * pi;
        svg.push(`<rect x="${x + pi - 5 * S}" y="${by}" width="${lat + 10 * S}" height="${24 * S}" rx="${7 * S}" fill="${CULORI.antetTabel}"/>`);
        // textul mare al benzii se strânge (până la 12 pt) ca să încapă și cel mic alături, întreg
        let telS = 15.5 * S;
        const loc = () => textW(fB, b.telefon, telS) + (b.nume ? 8 * S + textW(fR, b.nume, numeS) : 0);
        while (telS > 12 * S && loc() > lat) telS -= 0.5 * S;
        // tot nu încap: se scurtează textul mare, cel mic (telefonul, pe graficul șoferilor) rămâne întreg
        const mic = b.nume ? 8 * S + textW(fR, b.nume, numeS) : 0;
        const txt = truncText(fB, b.telefon, telS, Math.max(lat / 2, lat - mic));
        svg.push(textPath(fB, esc(txt), x + pi, by + 17.5 * S, telS, CULORI.text, 'start'));
        if (b.nume) {
          const xn = x + pi + textW(fB, txt, telS) + 8 * S, maxN = x + w - pi - xn;
          if (maxN > 20 * S) svg.push(textPath(fR, esc(truncText(fR, b.nume, numeS, maxN)), xn, by + 17 * S, numeS, CULORI.gri, 'start'));
        }
      });
      y += Math.ceil(bilete.length / 2) * (h + gap) - gap + 16 * S;
      return api;
    },
    /** rând de total: text stânga îngroșat, text dreapta gri */
    total(stanga: string, dreapta?: string) {
      svg.push(textPath(fB, stanga, PAD, y + 6 * S, 14 * S, CULORI.bordoInchis, 'start'));
      if (dreapta) svg.push(textPath(fR, dreapta, W - PAD, y + 6 * S, 11 * S, CULORI.gri, 'end'));
      y += 26 * S; return api;
    },
    nota(text: string) {
      const fs = (mare ? 13 : 9.5) * S; if (mare) y += 6 * S;
      for (const l of rupe(fR, text, fs, IN)) { svg.push(textPath(fR, l, PAD, y, fs, CULORI.gri, 'start')); y += 14 * S; } y += 4 * S; return api;
    },
    async png(): Promise<Buffer> {
      const Hc = y + PAD - 10 * S;
      // 9:16 umplut de sus până jos, conținutul centrat; zonele goale lăsate pentru bara TikTok micșorau totul
      // (ION-72). Ce nu încape nu se taie: foaia crește în jos.
      const H = opts.format916 ? Math.max(Math.round(W * 16 / 9), Math.ceil(Hc)) : Hc;
      const dy = opts.format916 ? Math.max(0, (H - Hc) / 2) : 0;
      const s = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${CULORI.fundal}"/><g transform="translate(0 ${dy})">${svg.join('')}</g></svg>`;
      return sharp(Buffer.from(s)).png().toBuffer();
    },
  };
  return api;
}
