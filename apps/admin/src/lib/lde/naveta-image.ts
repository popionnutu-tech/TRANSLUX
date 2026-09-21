import sharp from 'sharp';
import { fonts, logoBase64, textPath, truncText } from '../schedule-image';

/**
 * Posterul de navetă pe rutele de uzină — Ion, 19.09: «un poster în stil TRANSLUX,
 * săptămânal, pe navetă… în loc de ultimele două coloane: cât am economisi în aceste
 * două săptămâni și câți km a făcut pe navetă».
 *
 * Aceleași fonturi, același maro și același logo ca graficul Mejgorod și ca imaginea
 * penalităților (schedule-image.ts / driver-penalties-image.ts), ca să fie recunoscut ca
 * «mesaj de la parc». Un singur tabel: ~25 de rute încap lizibil pe o coloană.
 *
 * Navetă = km-ii șoferului în afara rutei (de acasă până la satul de start și înapoi),
 * fără brambura și fără drumurile la service. Economia = naveta × costul unui km: cu un
 * șofer din satul de start, drumul ăsta nu mai există.
 */
/**
 * Costul unui km — Ion, 21.09.2026: «livrarea o socotim asa norma litri * pret anre +
 * 1 leu/km reparatia la 20 locuri si 1.5 lei la daf + 1 leu salariu la sofer».
 *
 * Până acum erau două cifre rotunde puse cu mâna (10 lei/km la autobuz, 5 la microbuz,
 * Ion 19.09). Acum cifra se face din norma MAȘINII și din prețul motorinei al ZILEI —
 * amândouă sunt deja în bază și se actualizează singure (`lde_vehicle_types.norm_l_per_100km`,
 * `lde_diesel_price`, oglindit de price-worker din prețurile ANRE).
 *
 * Reparația: 1,50 lei/km DOAR la DAF («autobuz_mare»). «20 de locuri» din vorba lui Ion
 * sunt și microbuzele, și Sprinterele mari («autobuz_mic», 515/516/518) — toate iau 1,00.
 * Vechiul `leiPeKm` dădea 10 lei/km oricărei categorii cu «autobuz» în nume, deci și lui
 * Sprinter 518; acum el iese 7,20.
 */
export const REPARATIE_LEI_KM_DAF = 1.50;
export const REPARATIE_LEI_KM = 1.00;
export const SALARIU_LEI_KM = 1.00;
export const NORMA_IMPLICITA_L = 12.50;        // mașina fără tip știut: norma cea mai frecventă
export const PRET_IMPLICIT_LEI_L = 35.89;      // doar ca ultimă plasă, dacă lipsește tot tabelul de prețuri

export const reparatiaLeiKm = (categorie: string | null | undefined): number =>
  categorie === 'autobuz_mare' ? REPARATIE_LEI_KM_DAF : REPARATIE_LEI_KM;

/** normă litri/100 km × preț motorină + reparație + salariu */
export const leiPeKm = (
  { litri, categorie, pret }: { litri?: number | null; categorie?: string | null; pret?: number | null },
): number => ((Number(litri) || NORMA_IMPLICITA_L) / 100) * (Number(pret) || PRET_IMPLICIT_LEI_L)
  + reparatiaLeiKm(categorie) + SALARIU_LEI_KM;

/** Costul unui km când nu știm nici mașina, nici ziua — folosit doar ca ultim resort. */
export const LEI_PE_KM = leiPeKm({});

export interface BramburaRow {
  vehicle_id?: string;
  data: string;      // YYYY-MM-DD
  masina: string;    // «552BRAO · Sprinter 312»
  sofer: string;
  ruta: string;      // «Orhei 20» — nu se mai afișează, rămâne pentru caption/log
  unde: string;      // «Bălți 08:43–10:36 · Fedoreuca 11:48–12:03» — unde a fost, în afara rutei, și când
  km: number;
}

export interface LivrareRow {
  masina: string;         // «552BRAO · Sprinter 312»
  uzina: string;
  // Eticheta rutelor MAȘINII, gata făcută: «9 Mănoilești – Hîrcești» sau, la uzinele unde
  // o mașină are altă rută în fiecare tură (Ungheni), «9 Mănoilești + 17 Sineștii Vechi».
  ruta: string;
  sofer: string;          // «Popescu (Chiperceni)»
  zile: number;
  km_tur: number | null;
  total_zi: number;
  plin_zi: number;
  gol_ruta_zi: number;
  naveta_zi: number;
  naveta_total: number;   // pe toată perioada
  lei_km?: number;        // costul pe km al mașinii principale (autobuz 5,10 / microbuz 5,00)
}

export const UZINA_SCURT: Record<string, string> = {
  SEBN_ORHEI: 'Orhei', SEBN_STRASENI: 'Strășeni', DRAXELMAIER_BALTI: 'Draxelmaier',
  LEAR_UNGHENI: 'Ungheni', LEAR_FLORESTI: 'Florești', TROX_BRICENI: 'Trox',
};
const S = 2;
const PAD = 16 * S;
const MAROON = '#9B1B30';
const MAROON_DK = '#6b1221';
const RED = '#b3261e';
const GREEN = '#2e7d32';
const GREY = '#666';
const ROW_BG = ['#fdf6f0', '#f5ebe3'];
const ROW_H = 24 * S;
const TH_H = 34 * S;
const LOGO_AREA = 54 * S;
const TITLE_H = 26 * S;
const SUB_H = 18 * S;
const FOOT_H = 40 * S;

const COLS = [
  { key: 'masina', title: 'Mașina', w: 150, align: 'start' as const },
  { key: 'ruta', title: 'Ruta (nume – start real)', w: 186, align: 'start' as const },
  { key: 'sofer', title: 'Cine (locuiește)', w: 150, align: 'start' as const },
  { key: 'total', title: 'Total km/zi', w: 64, align: 'end' as const },
  { key: 'km_tur', title: 'Rută, km', w: 54, align: 'end' as const },
  { key: 'plin', title: 'Plin/zi', w: 56, align: 'end' as const },
  { key: 'gol', title: 'Goi pe rută', w: 64, align: 'end' as const },
  { key: 'naveta', title: 'Livrare/zi', w: 64, align: 'end' as const },
  { key: 'naveta_total', title: 'Livrare, km', w: 78, align: 'end' as const },
  { key: 'lei', title: 'Economie, lei', w: 92, align: 'end' as const },
];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0) * S;
const CANVAS_W = PAD * 2 + TABLE_W;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');

const BRAMBURA_COLS = [
  { key: 'data', title: 'Ziua', w: 60, align: 'start' as const },
  { key: 'masina', title: 'Mașina', w: 150, align: 'start' as const },
  { key: 'sofer', title: 'Șofer', w: 100, align: 'start' as const },
  { key: 'unde', title: 'Unde a fost, în afara rutei · când', w: 420, align: 'start' as const },
  { key: 'km', title: 'Km neagreați', w: 100, align: 'end' as const },
];
const BRAMBURA_W = BRAMBURA_COLS.reduce((s, c) => s + c.w, 0) * S;

export async function generateLivrareImage(rows: LivrareRow[], opts: { titlu: string; perioada: string; zileLucratoare: number; brambura?: BramburaRow[]; pretMotorina?: number }): Promise<Buffer> {
  const { r: fR, b: fB } = fonts();
  // trei rânduri de subtitlu: ce e livrarea · cum se face leul · cum se citesc coloanele.
  // Formula lui Ion (normă × preț + reparație + salariu) nu încape lângă definiție.
  const SUB_DY = 14 * S;
  const headerH = LOGO_AREA + TITLE_H + SUB_H + 10 * S + SUB_DY;
  const brambura = opts.brambura ?? [];
  // secțiunea de brambura: titlu + antet + rânduri (sau un rând «fără»)
  const BR_TITLE_H = 30 * S;
  const bramburaH = BR_TITLE_H + TH_H + Math.max(1, brambura.length) * ROW_H + 8 * S;
  const H = headerH + TH_H + rows.length * ROW_H + FOOT_H + bramburaH + PAD;

  const svg: string[] = [];
  svg.push(`<rect width="${CANVAS_W}" height="${H}" fill="#ffffff"/>`);
  const logoH = 28 * S;
  const logoW = logoH * (1318 / 192);
  svg.push(`<image href="data:image/png;base64,${logoBase64()}" x="${(CANVAS_W - logoW) / 2}" y="${PAD}" width="${logoW}" height="${logoH}"/>`);
  svg.push(textPath(fB, `${opts.titlu} · ${opts.perioada}`, CANVAS_W / 2, LOGO_AREA + 16 * S, 17 * S, MAROON_DK, 'middle'));
  // subtitlurile nu se pot lăți: canvasul e cât tabelul. Se taie la lățimea lui, nu se revarsă.
  const lei2 = (v: number) => v.toFixed(2).replace('.', ',');
  const sub = (text: string, y: number, size: number) =>
    svg.push(textPath(fR, truncText(fR, text, size, CANVAS_W - 2 * PAD), CANVAS_W / 2, y, size, GREY, 'middle'));
  const y1 = LOGO_AREA + TITLE_H + 10 * S;
  sub(`Livrare (подача) = km-ii șoferului în afara rutei (casă – satul de start), fără service și fără drumuri neobișnuite · ${opts.zileLucratoare} zile lucrătoare`, y1, 10.5 * S);
  sub(`Economie = livrare × costul km-ului mașinii: norma ei de motorină × ${lei2(opts.pretMotorina ?? PRET_IMPLICIT_LEI_L)} lei/l (prețul ANRE al zilei)`
    + ` + ${lei2(REPARATIE_LEI_KM)} lei reparație (${lei2(REPARATIE_LEI_KM_DAF)} la DAF) + ${lei2(SALARIU_LEI_KM)} lei salariu`, y1 + SUB_DY, 9.5 * S);
  sub('Rută = de la satul de start până la uzină · Goi pe rută = întoarcerile goale între sat și poartă, impuse de turele uzinei — nu se optimizează'
    + ' · «navetă» = mașina care duce omul la autobuz, nu face rută', LOGO_AREA + TITLE_H + SUB_H + 6 * S + SUB_DY, 9.5 * S);

  const top = headerH;
  const x0 = PAD;
  svg.push(`<rect x="${x0}" y="${top}" width="${TABLE_W}" height="${TH_H}" fill="${MAROON}"/>`);
  let cx = x0;
  for (const c of COLS) {
    const w = c.w * S;
    const tx = c.align === 'start' ? cx + 6 * S : cx + w - 6 * S;
    svg.push(textPath(fB, c.title, tx, top + TH_H / 2 + 4 * S, 10.5 * S, '#fff', c.align));
    cx += w;
  }
  let sumNaveta = 0, sumLei = 0, sumPlin = 0, sumTotal = 0;
  rows.forEach((row, i) => {
    const y = top + TH_H + i * ROW_H;
    svg.push(`<rect x="${x0}" y="${y}" width="${TABLE_W}" height="${ROW_H}" fill="${ROW_BG[i % 2]}"/>`);
    const textY = y + ROW_H / 2 + 4.2 * S;
    const fsz = 11.5 * S;
    const lei = row.naveta_total * (row.lei_km ?? LEI_PE_KM);
    sumNaveta += row.naveta_total; sumLei += lei; sumPlin += row.plin_zi; sumTotal += row.total_zi;
    const uz = (UZINA_SCURT[row.uzina] ?? row.uzina) + ' ';
    const numeRuta = `${uz}${row.ruta}`;
    const mare = row.naveta_zi >= 50;
    const cells: Record<string, { text: string; fill: string; bold?: boolean }> = {
      masina: { text: truncText(fR, row.masina, fsz, COLS[0].w * S - 10 * S), fill: '#444' },
      ruta: { text: truncText(fR, numeRuta, fsz, COLS[1].w * S - 10 * S), fill: '#222', bold: mare },
      sofer: { text: truncText(fR, row.sofer, fsz, COLS[2].w * S - 10 * S), fill: '#222' },
      total: { text: nr(row.total_zi), fill: '#333' },
      km_tur: { text: row.km_tur == null ? '—' : nr(row.km_tur), fill: '#333' },
      plin: { text: nr(row.plin_zi), fill: '#333' },
      gol: { text: row.gol_ruta_zi > 0 ? nr(row.gol_ruta_zi) : '0', fill: row.gol_ruta_zi > 0 ? '#333' : '#aaa' },
      naveta: { text: nr(row.naveta_zi), fill: mare ? RED : row.naveta_zi >= 20 ? '#333' : GREEN, bold: mare },
      naveta_total: { text: nr(row.naveta_total), fill: mare ? RED : '#333', bold: mare },
      lei: { text: nr(lei), fill: mare ? RED : row.naveta_total > 0 ? MAROON_DK : '#aaa', bold: mare },
    };
    let x = x0;
    for (const c of COLS) {
      const w = c.w * S;
      const cell = cells[c.key];
      const tx = c.align === 'start' ? x + 6 * S : x + w - 6 * S;
      svg.push(textPath(cell.bold ? fB : fR, esc(cell.text), tx, textY, fsz, cell.fill, c.align));
      x += w;
    }
  });
  svg.push(`<rect x="${x0}" y="${top}" width="${TABLE_W}" height="${TH_H + rows.length * ROW_H}" fill="none" stroke="${MAROON}" stroke-opacity="0.35" stroke-width="${S}"/>`);

  const fy = top + TH_H + rows.length * ROW_H + 14 * S;
  svg.push(textPath(fB, `Total livrare: ${nr(sumNaveta)} km în ${opts.zileLucratoare} zile = ${nr(sumLei)} lei`, PAD, fy + 4 * S, 12 * S, MAROON_DK, 'start'));
  svg.push(textPath(fR, `Plin ${nr(sumPlin)} km/zi din ${nr(sumTotal)} km/zi pe zonă`, CANVAS_W - PAD, fy + 4 * S, 12 * S, GREY, 'end'));
  svg.push(textPath(fR, 'Cifrele vin din urma GPS a fiecărei mașini, pe fiecare cursă; roșu = peste 50 km livrare pe zi — aici un șofer din satul de start schimbă cel mai mult', PAD, fy + 20 * S, 9.5 * S, GREY, 'start'));

  // ── km neagreați (brambura) în perioadă — Ion, 19.09 ──
  const by = fy + FOOT_H;
  svg.push(textPath(fB, `KM NEAGREAȚI (BRAMBURA) · ${opts.perioada}`, PAD, by + 12 * S, 13 * S, MAROON_DK, 'start'));
  svg.push(textPath(fR, 'Km în afara rutei peste ziua obișnuită a mașinii (mediana zilelor ei + 15 km), fără drumurile la service; doar zilele cu peste 20 km', PAD, by + 25 * S, 9.5 * S, GREY, 'start'));
  const bt = by + BR_TITLE_H;
  svg.push(`<rect x="${PAD}" y="${bt}" width="${BRAMBURA_W}" height="${TH_H}" fill="${MAROON}"/>`);
  let bx = PAD;
  for (const c of BRAMBURA_COLS) {
    const w = c.w * S;
    const tx = c.align === 'start' ? bx + 6 * S : bx + w - 6 * S;
    svg.push(textPath(fB, c.title, tx, bt + TH_H / 2 + 4 * S, 10.5 * S, '#fff', c.align));
    bx += w;
  }
  if (!brambura.length) {
    const y = bt + TH_H;
    svg.push(`<rect x="${PAD}" y="${y}" width="${BRAMBURA_W}" height="${ROW_H}" fill="${ROW_BG[0]}"/>`);
    svg.push(textPath(fR, 'Nicio zi cu km neagreați în perioadă', PAD + 6 * S, y + ROW_H / 2 + 4.2 * S, 11.5 * S, GREEN, 'start'));
  }
  brambura.forEach((b, i) => {
    const y = bt + TH_H + i * ROW_H;
    svg.push(`<rect x="${PAD}" y="${y}" width="${BRAMBURA_W}" height="${ROW_H}" fill="${ROW_BG[i % 2]}"/>`);
    const textY = y + ROW_H / 2 + 4.2 * S;
    const fsz = 11.5 * S;
    const cells: Record<string, string> = {
      data: `${b.data.slice(8, 10)}.${b.data.slice(5, 7)}`,
      masina: truncText(fR, b.masina, fsz, BRAMBURA_COLS[1].w * S - 10 * S),
      sofer: truncText(fR, b.sofer, fsz, BRAMBURA_COLS[2].w * S - 10 * S),
      unde: truncText(fR, b.unde || '—', fsz, BRAMBURA_COLS[3].w * S - 10 * S),
      km: nr(b.km),
    };
    let x = PAD;
    for (const c of BRAMBURA_COLS) {
      const w = c.w * S;
      const tx = c.align === 'start' ? x + 6 * S : x + w - 6 * S;
      svg.push(textPath(c.key === 'km' ? fB : fR, esc(cells[c.key]), tx, textY, fsz, c.key === 'km' ? RED : '#222', c.align));
      x += w;
    }
  });
  svg.push(`<rect x="${PAD}" y="${bt}" width="${BRAMBURA_W}" height="${TH_H + Math.max(1, brambura.length) * ROW_H}" fill="none" stroke="${MAROON}" stroke-opacity="0.35" stroke-width="${S}"/>`);

  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_W}" height="${H}">
${svg.join('\n')}
</svg>`;
  return await sharp(Buffer.from(svgStr)).png().toBuffer();
}
