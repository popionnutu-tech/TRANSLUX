// Prețurile destinațiilor principale, EXACT cum le arată site-ul.
//
// Sursa adevărului e aceeași ca la apps/web (getPopularPrices): km-ul cel mai
// scurt dintre două opriri din v_interurban_v2_km_pairs, înmulțit cu tariful
// perioadei și rotunjit. Nu recalculăm altfel: un anunț care spune alt preț
// decât pagina de pe care omul îl verifică e mai rău decât niciun anunț.
//
// Deosebirea față de site: acolo tariful e «al zilei de azi», aici îl cerem
// pentru o DATĂ anume — ca să putem pune alături prețul de azi și cel care
// intră în vigoare vineri.
import { getSupabase } from '@/lib/supabase';

export interface RutaPopulara {
  from: string; to: string;
  from_ro: string; to_ro: string;
  from_ru: string; to_ru: string;
}

/** Aceleași 12 destinații ca pe prima pagină a site-ului și în propunerea de tarif. */
export const RUTE_POPULARE: RutaPopulara[] = [
  { from: 'chisinau', to: 'balti', from_ro: 'Chișinău', to_ro: 'Bălți', from_ru: 'Кишинёв', to_ru: 'Бэлць' },
  { from: 'chisinau', to: 'singerei', from_ro: 'Chișinău', to_ro: 'Sîngerei', from_ru: 'Кишинёв', to_ru: 'Сынжерей' },
  { from: 'chisinau', to: 'cupcini', from_ro: 'Chișinău', to_ro: 'Cupcini', from_ru: 'Кишинёв', to_ru: 'Купчинь' },
  { from: 'chisinau', to: 'edinet', from_ro: 'Chișinău', to_ro: 'Edineț', from_ru: 'Кишинёв', to_ru: 'Единец' },
  { from: 'chisinau', to: 'corjeuti', from_ro: 'Chișinău', to_ro: 'Corjeuți', from_ru: 'Кишинёв', to_ru: 'Коржеуць' },
  { from: 'chisinau', to: 'briceni', from_ro: 'Chișinău', to_ro: 'Briceni', from_ru: 'Кишинёв', to_ru: 'Бричень' },
  { from: 'chisinau', to: 'ocnita', from_ro: 'Chișinău', to_ro: 'Ocnița', from_ru: 'Кишинёв', to_ru: 'Окница' },
  { from: 'chisinau', to: 'grimancauti', from_ro: 'Chișinău', to_ro: 'Grimăncăuți', from_ru: 'Кишинёв', to_ru: 'Гримэнкэуць' },
  { from: 'chisinau', to: 'larga', from_ro: 'Chișinău', to_ro: 'Larga', from_ru: 'Кишинёв', to_ru: 'Ларга' },
  { from: 'chisinau', to: 'lipcani', from_ro: 'Chișinău', to_ro: 'Lipcani', from_ru: 'Кишинёв', to_ru: 'Липкань' },
  { from: 'chisinau', to: 'otaci', from_ro: 'Chișinău', to_ro: 'Otaci', from_ru: 'Кишинёв', to_ru: 'Отачь' },
  { from: 'chisinau', to: 'criva', from_ro: 'Chișinău', to_ro: 'Criva', from_ru: 'Кишинёв', to_ru: 'Крива' },
];

export interface Tarife { rateLong: number | null; rateSub: number | null }

/**
 * Tariful valabil la o dată. Aceeași cădere ca pe site: dacă nicio perioadă nu
 * acoperă data, ia cea mai recentă începută — prețurile nu au voie să iasă 0.
 */
export async function tarifeLaData(date: string): Promise<Tarife> {
  const supabase = getSupabase();
  const acoperind = await supabase
    .from('tariff_periods')
    .select('rate_interurban_long, rate_suburban')
    .lte('period_start', date).gte('period_end', date)
    .order('period_start', { ascending: false }).limit(1).maybeSingle();

  let p = acoperind.data as { rate_interurban_long: number; rate_suburban: number } | null;
  if (!p) {
    const ultima = await supabase
      .from('tariff_periods')
      .select('rate_interurban_long, rate_suburban')
      .lte('period_start', date)
      .order('period_start', { ascending: false }).limit(1).maybeSingle();
    p = ultima.data as { rate_interurban_long: number; rate_suburban: number } | null;
  }
  return {
    rateLong: p ? Number(p.rate_interurban_long) : null,
    rateSub: p ? Number(p.rate_suburban) : null,
  };
}

interface PerecheKm { km: number; from_district: string | null; to_district: string | null; start_district: string | null }

/** Ambele opriri în raionul de plecare al rutei → tarif suburban; altfel interurban. */
function alegeRata(p: PerecheKm, rateLong: number, rateSub: number): number {
  if (p.start_district && p.from_district === p.start_district && p.to_district === p.start_district) return rateSub;
  return rateLong;
}

/** Kilometrajul fiecărei rute populare, citit o singură dată pentru ambele tarife. */
export async function kmRutePopulare(): Promise<Map<string, PerecheKm>> {
  const supabase = getSupabase();
  const out = new Map<string, PerecheKm>();
  await Promise.all(RUTE_POPULARE.map(async (r) => {
    const { data } = await supabase
      .from('v_interurban_v2_km_pairs')
      .select('km, from_district, to_district, start_district')
      .eq('from_stop', r.from).eq('to_stop', r.to)
      .order('km', { ascending: true }).limit(1);
    const row = data?.[0] as PerecheKm | undefined;
    if (row) out.set(`${r.from}>${r.to}`, { ...row, km: Number(row.km) });
  }));
  return out;
}

export function pretRuta(pereche: PerecheKm | undefined, t: Tarife): number | null {
  if (!pereche || !t.rateLong || !t.rateSub) return null;
  const km = pereche.km;
  if (!(km > 0 && km < 1000)) return null;
  return Math.round(km * alegeRata(pereche, t.rateLong, t.rateSub));
}

// Oferta permanentă Bălți - Chișinău: prețul întreg minus 20 de lei. Regula NU e
// aici de capul ei — o scrie funcția update_prices_by_rate_v2 în tabela `offers`
// la fiecare schimbare de tarif (ROUND(133 × rata) și GREATEST(preț - 20, 0)).
// O repetăm fiindcă anunțul pleacă JOI, iar rândul din `offers` se rescrie abia
// vineri, la intrarea în vigoare: citit atunci, ar da prețul vechi.
export const BALTI_KM = 133;
export const BALTI_REDUCERE = 20;

export interface OfertaBalti { intreg: number; cuReducere: number }

export function ofertaBalti(rateLong: number | null): OfertaBalti | null {
  if (!rateLong) return null;
  const intreg = Math.round(BALTI_KM * rateLong);
  return { intreg, cuReducere: Math.max(intreg - BALTI_REDUCERE, 0) };
}

export interface RandPret {
  from_ro: string; to_ro: string; from_ru: string; to_ru: string;
  vechi: number | null;
  nou: number;
}

/**
 * Prețurile principalelor destinații înainte și după data intrării în vigoare.
 * `vechi` lipsește (null) doar dacă nu se poate calcula — rândul tot se arată,
 * fără săgeata de schimbare, ca destinația să nu dispară din anunț.
 */
export async function comparaPreturi(
  ziVeche: string,
  ziNoua: string,
): Promise<{ randuri: RandPret[]; tarifVechi: Tarife; tarifNou: Tarife }> {
  const [tarifVechi, tarifNou, km] = await Promise.all([
    tarifeLaData(ziVeche), tarifeLaData(ziNoua), kmRutePopulare(),
  ]);
  const randuri: RandPret[] = [];
  for (const r of RUTE_POPULARE) {
    const pereche = km.get(`${r.from}>${r.to}`);
    const nou = pretRuta(pereche, tarifNou);
    if (nou === null) continue; // fără km nu avem ce scrie pe imagine
    randuri.push({
      from_ro: r.from_ro, to_ro: r.to_ro, from_ru: r.from_ru, to_ru: r.to_ru,
      vechi: pretRuta(pereche, tarifVechi), nou,
    });
  }
  return { randuri, tarifVechi, tarifNou };
}
