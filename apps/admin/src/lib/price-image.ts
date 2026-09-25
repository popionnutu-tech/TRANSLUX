import { poster, CULORI } from './poster-sablon';
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
  // Șablonul posterelor (Ion, 25.09: «aplică peste tot noul format»); conținutul rămâne același,
  // bilingv: rândul principal în română, sub el rusește.
  const z = ziua(aplicaDin);
  const p = poster({ supratitlu: 'Prețuri noi · Новые цены', titlu: `Din ${z.ro}, ${ddmmyyyy(aplicaDin)}`,
    subtitlu: `С ${z.ru}, ${ddmmyyyy(aplicaDin)}. Principalele destinații cu preț schimbat · Основные направления с изменённой ценой.`,
    eticheta: ddmmyyyy(aplicaDin) });
  p.tabel([{ titlu: 'Destinația · Направление', latime: 330 }, { titlu: 'Acum · Сейчас', latime: 120, aliniere: 'end' },
    { titlu: 'Nou · Новая', latime: 130, aliniere: 'end' }, { titlu: '', latime: 80, aliniere: 'end' }],
    randuri.map((r) => {
      const d = r.vechi !== null ? r.nou - r.vechi : 0;
      return [
        { text: `${r.from_ro} - ${r.to_ro}`, bold: true, mic: `${r.from_ru} - ${r.to_ru}` },
        { text: r.vechi !== null ? `${r.vechi} lei` : '—', culoare: CULORI.griDeschis, marime: 14 },
        { text: `${r.nou} lei`, bold: true, culoare: CULORI.bordoInchis, marime: 16 },
        r.vechi === null ? { text: '' } : d === 0 ? { text: 'fără', culoare: CULORI.griDeschis }
          : { text: `${d > 0 ? '+' : '-'}${Math.abs(d)}`, bold: true, culoare: d > 0 ? CULORI.rosu : CULORI.verde, fundal: d > 0 ? '#f8e3e0' : CULORI.verdeFundal },
      ];
    }));
  // Oferta sub tabel, nu ca rând: e singurul preț care nu iese din tarif × km.
  if (oferta) p.total(`Bălți - Chișinău: ${oferta.cuReducere} lei în loc de ${oferta.intreg}`, `Бэлць - Кишинёв: ${oferta.cuReducere} лей вместо ${oferta.intreg}`);
  p.nota(`Toate destinațiile și orarul: ${site} · Все направления и расписание: ${site}`);
  return p.png();
}
