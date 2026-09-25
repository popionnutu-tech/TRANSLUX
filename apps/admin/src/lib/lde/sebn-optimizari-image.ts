import { poster, CULORI, type Celula } from '../poster-sablon';
import type { LivrareRow } from './naveta-image';
import type { TimpLiberMasina } from '@/app/(dashboard)/lde/reguli/actions';
import { perioadaText } from './lear-optimizari-image';

/**
 * Posterul săptămânal «cât se putea economisi» la SEBN Orhei și Strășeni (ION-60).
 *
 * Ion, 25.09.2026: «dă posterul în așa stil — LEAR Ungheni · cât se putea economisi». Același șablon
 * (poster-sablon.ts) și aceleași reguli de formă ca la LEAR: doar km, fără lei și fără nume de oameni.
 * La SEBN regulile 1–3 de la LEAR nu se aplică (mașina trebuie să fie în sat la fiecare schimbare de
 * tură), deci ce se poate tăia e LIVRAREA — drumul de acasă până la începerea cursei — plus km liberi
 * și km brambura după regula §11.
 *
 * Livrarea vine din incarcaLivrare() (luni–vineri, ca posterul de livrare), liberul și brambura din
 * raportul săptămânal sebn-liber.mjs (lde_analiza_reguli «SEBN»).
 */
const nr = (v: number) => Math.round(v).toLocaleString('ro-RO').replace(/ /g, ' ');

export interface MasinaLiber { masina: string; casa: string | null; liber: TimpLiberMasina }

export async function generateSebnOptimizariImage(o: {
  saptamina: string; pana_la: string; livrare: LivrareRow[]; liber: MasinaLiber[] | null;
  /** Ion, 25.09: «doar auto mai mult 40 km» — pe poster doar mașinile cu peste atâția km livrare pe zi
   *  (sau cu km liberi / brambura peste atât pe săptămână); restul flotei se spune într-un rând */
  prag?: number;
}): Promise<Buffer> {
  const placa = (s: string) => s.split(' · ')[0];
  const lib = new Map((o.liber ?? []).map((m) => [m.masina, m]));
  // satul din «Popescu (Chiperceni)» — pe poster nu apar oameni, doar unde doarme mașina
  const sat = (s: string) => s.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
  const rows = o.livrare.map((r) => {
    const L = lib.get(placa(r.masina));
    return { masina: r.masina, casa: sat(r.sofer) ?? L?.casa ?? null, ruta: r.ruta, kmSapt: r.total_zi * r.zile,
      livrare: r.naveta_total, livrareZi: r.naveta_zi,
      liber: L ? L.liber.km : null, brambura: L ? (L.liber.km_brambura ?? 0) : null,
      pestePragLiber: !!L?.liber.peste_prag, pestePragBrambura: !!L?.liber.peste_prag_brambura };
  }).sort((a, b) => b.livrare - a.livrare);
  const prag = o.prag ?? 40;
  const toate = rows;
  const peste = (r: typeof rows[number]) => r.livrareZi > prag || (r.liber ?? 0) > prag || (r.brambura ?? 0) > prag;
  const aratate = toate.filter(peste), restul = toate.filter((r) => !peste(r));
  const tLiv = aratate.reduce((s, r) => s + r.livrare, 0);
  const tRest = restul.reduce((s, r) => s + r.livrare, 0);
  const tLib = (o.liber ?? []).reduce((s, m) => s + (m.liber.km || 0), 0);
  const tBr = (o.liber ?? []).reduce((s, m) => s + (m.liber.km_brambura || 0), 0);

  const p = poster({
    latime: 960,
    supratitlu: 'SEBN Orhei și Strășeni',
    titlu: 'Cât se putea economisi săptămâna trecută',
    subtitlu: 'Km pe care fiecare mașină i-ar fi făcut mai puțin, cu aceleași rute și aceiași oameni.',
    eticheta: perioadaText(o.saptamina, o.pana_la),
  });
  p.carduri([
    { eticheta: 'Livrare', titlu: 'Șofer din satul de start', text: 'Fără drumul de acasă până la începerea cursei: șoferul locuiește la capătul rutei sau mașina așteaptă acolo între ture.', valoare: `−${nr(tLiv)} km`, subValoare: 'luni–vineri' },
    { eticheta: 'Brambura', titlu: 'Drum neobișnuit', text: 'Km pe un drum pe care mașina n-a mers în nicio altă zi a săptămânii, în drumurile de muncă.', valoare: `${nr(tBr)} km`, subValoare: 'toată săptămâna' },
    { eticheta: 'Km liberi', titlu: 'Fără legătură cu uzina', text: 'Curse care nu ating poarta SEBN și nu merg pe ruta mașinii — nici reparație, nici altă uzină.', valoare: `${nr(tLib)} km`, subValoare: 'toată săptămâna' },
  ]);
  const km = (v: number | null, peste: boolean): Celula => v == null ? { text: '—', culoare: CULORI.griDeschis }
    : v < 5 ? { text: '0', culoare: CULORI.griDeschis }
    : { text: nr(v), bold: peste, culoare: peste ? CULORI.rosu : CULORI.text, fundal: peste ? '#f8e3e0' : undefined };
  p.tabel([
    { titlu: 'Mașina', latime: 150 }, { titlu: 'Doarme la', latime: 124 }, { titlu: 'Ruta', latime: 196 },
    { titlu: 'Acum, km/săpt.', latime: 104, aliniere: 'end' }, { titlu: 'Livrare/zi', latime: 84, aliniere: 'end' },
    { titlu: 'Livrare, km', latime: 90, aliniere: 'end' }, { titlu: 'Km liberi', latime: 76, aliniere: 'end' },
    { titlu: 'Km brambura', latime: 80, aliniere: 'end' },
  ], aratate.map((r) => [
    { text: r.masina.replace('Sprinter ', 'Spr '), bold: true },
    { text: r.casa ?? '—', culoare: CULORI.gri },
    { text: r.ruta, culoare: CULORI.gri },
    { text: nr(r.kmSapt) },
    r.livrareZi < 1 ? { text: '0', culoare: CULORI.griDeschis } : { text: nr(r.livrareZi), bold: r.livrareZi >= 50, culoare: r.livrareZi >= 50 ? CULORI.verde : CULORI.text },
    r.livrare < 1 ? { text: '0', culoare: CULORI.griDeschis }
      : { text: `−${nr(r.livrare)}`, culoare: CULORI.verde, bold: r.livrareZi >= 50, fundal: r.livrareZi >= 50 ? CULORI.verdeFundal : undefined },
    km(r.liber, r.pestePragLiber), km(r.brambura, r.pestePragBrambura),
  ]), { gol: `Nicio mașină cu peste ${prag} km livrare pe zi în săptămâna asta.` });
  p.total(`La aceste ${aratate.length} mașini: −${nr(tLiv)} km pe săptămână`, `≈ −${nr(tLiv * 52 / 12)} km pe lună`);
  if (restul.length) p.nota(`Pe poster doar mașinile cu peste ${prag} km livrare pe zi. Celelalte ${restul.length} mai au împreună −${nr(tRest)} km livrare pe săptămână (sub ${prag} km/zi fiecare).`);
  p.nota('Verde încercuit = peste 50 km livrare pe zi — acolo un șofer din satul de start schimbă cel mai mult. Livrarea se socotește luni–vineri, din cursele scrise în fiecare noapte; fără drumurile la reparație și fără brambura.');
  p.nota('Km liberi și brambura, pe toată săptămâna, după regula §11 (ca la LEAR); roșu = peste 50 km. O cursă care merge pe ruta mașinii fără să atingă poarta e muncă, nu liber.');
  return p.png();
}
