import { poster, CULORI } from '../poster-sablon';

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
const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');

export async function generateLivrareImage(rows: LivrareRow[], opts: { titlu: string; perioada: string; zileLucratoare: number; brambura?: BramburaRow[]; pretMotorina?: number }): Promise<Buffer> {
  // Șablonul posterelor (Ion, 25.09: «aplică peste tot noul format»); conținutul rămâne cel stabilit
  // (Ion 19–22.09): livrarea pe mașină și economia ei, apoi km neagreați.
  const lei2 = (v: number) => v.toFixed(2).replace('.', ',');
  const p = poster({ latime: 1000, supratitlu: opts.titlu, titlu: 'Livrare (подача) pe rutele de uzină', eticheta: opts.perioada,
    subtitlu: `Livrare = km-ii șoferului în afara rutei (casă – satul de start), fără service și fără drumuri neobișnuite · ${opts.zileLucratoare} zile lucrătoare. `
      + `Economie = livrare × costul km-ului mașinii: norma ei × ${lei2(opts.pretMotorina ?? PRET_IMPLICIT_LEI_L)} lei/l (ANRE) + ${lei2(REPARATIE_LEI_KM)} lei reparație (${lei2(REPARATIE_LEI_KM_DAF)} la DAF) + ${lei2(SALARIU_LEI_KM)} lei salariu.` });
  let sumNaveta = 0, sumLei = 0, sumPlin = 0, sumTotal = 0;
  p.tabel([
    { titlu: 'Mașina', latime: 150 }, { titlu: 'Ruta (nume – start real)', latime: 186 }, { titlu: 'Cine (locuiește)', latime: 150 },
    { titlu: 'Total/zi', latime: 60, aliniere: 'end' }, { titlu: 'Rută, km', latime: 58, aliniere: 'end' }, { titlu: 'Plin/zi', latime: 58, aliniere: 'end' },
    { titlu: 'Goi pe rută', latime: 66, aliniere: 'end' }, { titlu: 'Livrare/zi', latime: 66, aliniere: 'end' },
    { titlu: 'Livrare, km', latime: 78, aliniere: 'end' }, { titlu: 'Economie, lei', latime: 92, aliniere: 'end' },
  ], rows.map((row) => {
    const lei = row.naveta_total * (row.lei_km ?? LEI_PE_KM);
    sumNaveta += row.naveta_total; sumLei += lei; sumPlin += row.plin_zi; sumTotal += row.total_zi;
    const mare = row.naveta_zi >= 50;
    return [
      { text: row.masina, culoare: CULORI.gri },
      { text: `${UZINA_SCURT[row.uzina] ?? row.uzina} ${row.ruta}`, bold: mare },
      { text: row.sofer },
      { text: nr(row.total_zi) },
      { text: row.km_tur == null ? '—' : nr(row.km_tur) },
      { text: nr(row.plin_zi) },
      { text: row.gol_ruta_zi > 0 ? nr(row.gol_ruta_zi) : '0', culoare: row.gol_ruta_zi > 0 ? CULORI.text : CULORI.griDeschis },
      { text: nr(row.naveta_zi), bold: mare, culoare: mare ? CULORI.rosu : row.naveta_zi >= 20 ? CULORI.text : CULORI.verde },
      { text: nr(row.naveta_total), bold: mare, culoare: mare ? CULORI.rosu : CULORI.text },
      { text: nr(lei), bold: mare, culoare: mare ? CULORI.rosu : row.naveta_total > 0 ? CULORI.bordoInchis : CULORI.griDeschis, fundal: mare ? '#f8e3e0' : undefined },
    ];
  }), { compact: true });
  p.total(`Total livrare: ${nr(sumNaveta)} km în ${opts.zileLucratoare} zile = ${nr(sumLei)} lei`, `Plin ${nr(sumPlin)} km/zi din ${nr(sumTotal)} km/zi pe zonă`);
  p.nota('Rută = de la satul de start până la uzină · Goi pe rută = întoarcerile goale între sat și poartă, impuse de turele uzinei — nu se optimizează · «navetă» = mașina care duce omul la autobuz · roșu = peste 50 km livrare pe zi.');
  const br = opts.brambura ?? [];
  p.tabel([{ titlu: 'Ziua', latime: 60 }, { titlu: 'Mașina', latime: 150 }, { titlu: 'Șofer', latime: 110 },
    { titlu: 'Km neagreați (brambura) — unde a fost, în afara rutei · când', latime: 420 }, { titlu: 'Km', latime: 80, aliniere: 'end' }],
    br.map((b) => [
      { text: `${b.data.slice(8, 10)}.${b.data.slice(5, 7)}` }, { text: b.masina, culoare: CULORI.gri }, { text: b.sofer },
      { text: b.unde || '—' }, { text: nr(b.km), bold: true, culoare: CULORI.rosu },
    ]), { compact: true, gol: 'Nicio zi cu km neagreați în perioadă' });
  p.nota('Km neagreați = km în afara rutei peste ziua obișnuită a mașinii (mediana zilelor ei + 15 km), fără service; doar zilele cu peste 20 km.');
  return p.png();
}
