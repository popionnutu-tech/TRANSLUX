'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';

// Raportul săptămânal al celor trei reguli de economie (ION-48). Îl scrie duminică seara
// lear-analiza.mjs de pe VPS, un rând pe uzină și pe săptămână. Aici se citește ultimul.
//
// Forma lui `date` e a workerului și se schimbă odată cu el, de asta tipurile de mai jos sunt
// descriptive, nu impuse: dacă workerul adaugă un câmp, pagina nu se strică, doar nu-l arată.

export type RutaMasina = {
  id: string; tura: 'A' | 'B'; capat: string; loc: number;
  etalon: number; acoperire: number;
  // rute duse în ACELEAȘI curse (032BRAT: B15 prin satele lui B13); etalonul e al drumului mai lung
  comasat?: string[]; etalon_propriu?: number;
};

export type Regula = { zi: number; km: number; lei: number };

export type MasinaRand = {
  masina: string;
  tip: string | null;
  lei_km: number | null;
  casa: string | null;
  casa_dedusa?: boolean;
  zile_lucrate: number;
  zile_masurate: number;
  ore_poarta: number;
  azi: number;
  // ziua fără drumurile la parc (reparație) — cu ea se compară regulile
  azi_fara_parc?: number;
  rute: RutaMasina[];
  rutele_de_4?: number;
  alte?: number;
  alte_la_uzina?: number;
  alte_la_parc?: number;
  alte_aiurea?: number;
  // unde se întâmplă km-ii «aiurea» — dovada steagului, ca să nu fie doar o cifră
  locuri_aiurea?: {
    loc: string; km_zi: number; ore: number; zile: number; de_la_uzina: number;
    // orele locale în care se strâng kilometrii — ele spun dacă e muncă de uzină sau nu
    cand?: { ora: number; km_zi: number }[];
  }[];
  d_casa?: number;
  d_uzina?: number;
  d_casa_pe_capat?: { id: string; capat: string; km: number }[];
  r1?: Regula;
  r3?: Regula;
  km_baza?: { km: number; zile: number; km_aici: number; dif: number };
  // ⚠ ce modelul nu poate explica
  steaguri: string[];
  // ⓘ fapte citite din urmă, lămurite: ruta schimbată față de listă, capăt neatins, rută împărțită
  note?: string[];
  // mișcările în timpul liber — «lanțul muncii» (ION-57); lipsește la rapoartele de dinainte
  liber?: TimpLiberMasina;
};

// O oprire dintr-o ieșire în timpul liber: unde a urcat sau coborât cineva.
export type OprireLibera = { loc: string | null; min: number; ora: string };
// O cursă din afara lanțului muncii. `eticheta`: liber = nicio ancoră; neclar = nu se poate spune
// (gol de semnal, zona parcului fără oprire, marginea datelor); navetă = între două case;
// ocol = km din afara culoarelor într-o cursă de muncă (listat, nu intră în alarmă).
export type IesireLibera = {
  zi: string; de_la: string; pana_la: string; km: number; departare: number;
  eticheta: 'liber' | 'neclar' | 'navetă' | 'ocol';
  motiv?: string; nota?: string | null;
  km_ocol?: number; km_alimentare?: number;
  loc_principal: string | null; repetat: boolean; opriri: OprireLibera[];
};
export type TimpLiberMasina = {
  km: number; prag_km: number; peste_prag: boolean; zile: number;
  km_lucru?: number; km_reparatie?: number; km_naveta?: number; km_neclar?: number;
  km_neanalizat?: number; km_ocol?: number; km_alimentare?: number; km_nevazut?: number;
  iesiri: IesireLibera[]; si_altele?: number;
  control?: { km_curse: number; km_zi: number; km_stationare: number } | null;
};

export type Deplasare = {
  masina: string; zi: string; de_la: string; pana_la: string;
  ore: number; km: number; departare: number; unde: string;
  // «brambura» = ieșire de peste 5 km care nu e nici rută, nici drum de acasă, nici pe la poartă;
  // drumurile la parcul de la Bălți (reparație) nu se scriu deloc (Ion, 24.09)
  fel?: 'reparație' | 'de lămurit' | 'brambura';
};

export type Raport = {
  uzina: string;
  saptamina: string;
  pana_la: string;
  schelet_fixat: string;
  zile_luna: number;
  rulat_la: string;
  masini: MasinaRand[];
  steaguri: { masina?: string; fel: string; text: string }[];
  deplasari: Deplasare[];
  doar_trecute?: { masina: string; zile: number; ore: number; km_zi: number }[];
  total: {
    r1: number; r3: number; masini_uzina: number; masini_r1: number; masini_r3: number;
    control?: { km_aici: number; km_baza: number; dif: number };
  };
  // rezumatul timpului liber pe flotă (ION-57); null când baza n-are ferestre de ceas
  timp_liber?: {
    prag_km: number; km_total: number; masini_peste_prag: string[];
    ferestre: { sens: 'tur' | 'retur'; shift_number: number; de_la_min: number; pana_la_min: number }[];
    zile_lucru: { sambata: boolean; duminica: boolean };
    sambata: { zi: string; masini_la_poarta: number }[];
  } | null;
};

export async function getRaport(uzina = 'LEAR Ungheni', saptamina?: string): Promise<Raport | null> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const supabase = getSupabase();
  // Un singur rând: cel cerut, altfel cel mai recent. NICIODATĂ SELECT * în liste (regula din
  // migr. 206), dar aici `date` ESTE raportul întreg — nu se poate îngusta fără să rupem pagina.
  let q = supabase
    .from('lde_analiza_reguli')
    .select('uzina, saptamina, rulat_la, date')
    .eq('uzina', uzina);
  if (saptamina) q = q.eq('saptamina', saptamina);
  const { data, error } = await q
    .order('saptamina', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`lde_analiza_reguli: ${error.message}`);
  if (!data) return null;
  return { ...(data.date as Raport), rulat_la: data.rulat_la, saptamina: data.saptamina };
}

export async function getSaptamani(uzina = 'LEAR Ungheni'): Promise<string[]> {
  const session = await verifySession();
  requireRole(session, 'ADMIN');
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('lde_analiza_reguli')
    .select('saptamina')
    .eq('uzina', uzina)
    .order('saptamina', { ascending: false })
    .limit(26);
  if (error) throw new Error(`lde_analiza_reguli: ${error.message}`);
  return (data ?? []).map((r) => r.saptamina as string);
}
