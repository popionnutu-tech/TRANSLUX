// Formele răspunsurilor din rapoartele «Bilete aparat» (funcțiile get_tiki_* din migrarea 446).

export interface TikiBatch {
  id: number;
  file_name: string;
  uploaded_at: string;
  uploaded_by: string | null;
  rows_in_file: number;
  rows_excluded: Record<string, number>;
  rows_dup_in_file: number;
  rows_sent: number;
  rows_inserted: number;
  date_min: string | null;
  date_max: string | null;
  status: 'in_progress' | 'done' | 'failed';
  error: string | null;   // rulările automate din Mobilet (migr. 451)
}

/** Refacerea vederilor (ION-166): ce așteaptă noaptea, ultimul pas. */
export interface TikiRefacereStare {
  luni_in_asteptare: string[];
  zile_numarare: number;
  ultimul_pas: { la: string; tip: string; luna: string | null; ms: number } | null;
  pas_maxim_ms_24h: number | null;
}

export interface TikiMeta {
  date_min: string | null;
  date_max: string | null;
  tickets: number;
  routes: { name: string; tickets: number }[];
  drivers: { name: string; tickets: number }[];
}

export interface TikiSummary {
  tickets: number;
  lei: number;
  card: number;
  dedus: number;
  nedet: number;
  anulare: number;
  tur: number;
  retur: number;
  lei_tur: number;
  lei_retur: number;
  trip_days: number;      // curse efectuate (zi + rută + oră + direcție), fără «Anulare»
  trip_tickets: number;   // biletele de pe aceste curse
  days: number;
  drivers: number;
  daily: { d: string; tickets: number; lei: number }[];
}

export interface TikiDriverRow {
  driver: string;
  trip_days: number;
  days: number;
  tickets: number;
  lei: number;
  card: number;
  expected: number;       // cât ar fi vândut un șofer mediu pe aceleași curse
  routes: { route: string; tickets: number }[];
  routes_n: number;
  vehicles: number;
}

export interface TikiRouteRow {
  route: string;
  time: string | null;
  direction: 'tur' | 'retur' | 'necunoscut';
  anulare: boolean;
  trip_days: number;
  tickets: number;
  lei: number;
  card: number;
  dedus: number;
  nedet: number;
  drivers_n: number;
  top_drivers: { driver: string; trips: number; per_trip: number }[];
}

export interface TikiPairRow {
  pair: string;
  tickets: number;
  lei: number;
  tur: number;
  retur: number;
  fara_sens: number;
  statii: number;
  dedus: number;
}

export interface TikiMonthly {
  date_max: string | null;
  months: { m: string; tickets: number; lei: number; days: number; last: string }[];
  weeks: { w: string; tickets: number; lei: number; days: number }[];
}

export interface Filters {
  from: string;
  to: string;
  route: string;
  driver: string;
}

// ─── ION-159: Orar · Față de anul trecut · Cine merge pe rută (migr. 452, ziua cursei Mobilet) ───

export type Leg = 'nord_chisinau' | 'chisinau_nord';

export interface OrarLeg {
  leg: Leg;
  bilete: number;
  lei: number;
  plecari: number;
  plecari_fara_bilete: number;
  din_grafic: boolean;             // plecările din grafic (din 04.04.2026), altfel doar zilele cu bilete
  plin_tiki: number | null;        // % = om×km TIKI / (locuri × km picior); null = locuri necunoscute
  bilete_an_trecut: number | null; // aceleași etichete TIKI, aceeași fereastră cu 364 de zile în urmă
  eticheta_comuna: boolean;        // eticheta e vândută și de mașinile altei rute — fără semnal individual
  zile_sapt: Record<string, number> | null;   // '1'..'7' (luni..duminică) → mediana biletelor pe plecare
  saptamani: [string, number][] | null;       // [luni-ul săptămânii, bilete] pe 2 ani până la sfârșitul intervalului
}

export interface OrarRoute {
  route_id: number;
  coridor: string;
  nume: string;
  time_nord: string | null;
  time_chisinau: string | null;
  picioare: OrarLeg[];
}

export interface TikiCalitate {
  surse: Record<string, number>;   // masina / sofer / eticheta_luna / eticheta_2026 / override / nelegat / anulare → bilete
  zi_vanzare: number;              // bilete fără zi de cursă sigură (luată ziua vânzării)
  coada: number;                   // luni încă de refăcut
  ultima_zi: string | null;
}

export interface TendintaLuna {
  luna: string;      // 'YYYY-MM'
  coridor: string;   // inclusiv 'Anulare'
  bilete: number;
  lei: number;
  zile: number;
  ultima_zi: string;
}

export interface TikiTendinta {
  luni: TendintaLuna[];
  ultima_zi: string | null;
  tarif: { luna: string; pret: number }[];  // prețul modal Chișinău–Bălți pe lună (treptele de tarif)
}

export interface ClientiRoute {
  route_id: number;
  nume: string;
  coridor: string;
  picioare_numarate: number;
  picioare_eligibile: number;
  plecari: number;
  oameni_numarati: number | null;   // minim
  oameni_tiki: number | null;       // exact
  om_km_numarat: number | null;     // exact
  om_km_tiki_min: number | null;
  om_km_tiki_max: number | null;
  neconcordante: number;
}

export interface ClientiZi {
  zi: string; leg: Leg; eligibil: boolean;
  oameni_numarati: number; oameni_tiki: number;
  om_km: number; om_km_tiki_min: number; om_km_tiki_max: number;
}

export interface ClientiTronson {
  leg: Leg; stop_order: number; stop: string; km: number; km_next: number | null;
  numarat: number; tiki_min: number; tiki_max: number; zile: number;
}

export interface TikiClienti {
  rute: ClientiRoute[];
  zile: ClientiZi[] | null;
  tronsoane: ClientiTronson[] | null;
}

// De unde până unde (migr. 458): clienții TIKI din bilete, ceilalți = Numărare − TIKI pe tronsoane.
export interface OdPair { de_la: string; pana_la: string; calatorii: number; pct: number | null; pe_zi: number; lei?: number }
export interface TikiOd {
  zile_numarare: number;
  zile_tiki: number;
  tiki: OdPair[];
  tiki_total: number | null;
  tiki_total_pe_zi: number | null;
  ceilalti: OdPair[];
  ceilalti_total: number | null;
  ceilalti_total_pe_zi: number | null;
}

// Oamenii omiși de TIKI dar numărați în Numărare, pe pereche fără sens (migr. 459).
export interface TikiOmisi {
  zile: number;
  perechi: { cheie: string; de_la: string; pana_la: string; oameni: number; tur: number | null; retur: number | null }[];
}
// «Piața» pe pereche (ION-171, migr. 463): lunile încheiate din interval cu rând calculat (piata_pereche_luna).
export type PiataTip = 'coada' | 'balti' | 'trunchi' | 'local' | 'mic';  // mic = sat sub pragul «orașe / sate foarte mari» (Ion, 02.10): doar bilete + ~omiși
export interface PiataCursa { firma: string; cursa: string; sens: Leg; ora: string; bpp: number | null; factor_ora?: number; locuri?: number; tranzit: number; luna: number }
export interface PiataPereche {
  cheie: string; de_la: string; pana_la: string; tip: PiataTip;
  bilete: number;
  omisi: number | null;               // estimare (tiki_ceilalti_od), extrapolată la zilele lunii
  omisi_acoperire: number | null;     // zile numărate ÷ zile lună
  conc_min: number; conc_max: number; // concurenți, 5/7 … 7/7
  piata_min: number; piata_max: number;
  cota: number | null;                // bilete ÷ mijlocul intervalului (doar coada / balti)
  oras: number | null; bazin: number | null; bazin_echiv: number | null;
  aford_net: number | null; aford_pensie: number | null;
  steaguri: string[] | null;
  detalii: { raion?: string | null; bilete_baza?: number | null; delta?: number; zile?: number; curse?: PiataCursa[] } | null;
  luni: number;
}
export interface Piata {
  luni: string[];                     // 'YYYY-MM' încheiate, conținute în interval, cu rând
  prima_luna: string;                 // '2026-05-01'
  parametri: Record<string, unknown>;
  perechi: PiataPereche[];
}

// ── ION-167: trei rapoarte (migr. 466) ──────────────────────────────────────────────────────────────────────────────────
export interface PerechePe { cheie: string; de_la: string | null; pana_la: string | null }

export interface TikiComparatie {
  zile_a: number;
  zile_b: number;
  numarare_a: boolean;
  numarare_b: boolean;
  rute_circulate: number;
  rute_incluse: number;
  rute_excluse: { route: number; de_la: string; acop_a: number | null; acop_b: number | null }[];
  perechi: (PerechePe & { tiki_a: number; tiki_b: number; fara_a: number; fara_b: number })[];
}

export interface TikiRuta {
  route: number;
  de_la: string;
  pana_la: string;
  time_nord: string | null;
  time_chisinau: string | null;
  zile_circulate: number;
  zile_numarate: number;
  tiki: number;
  lei: number;
  tiki_c: number;
  fara_c: number;
  top: (PerechePe & { tiki: number; fara: number })[];
  top_tiki: (PerechePe & { tiki: number })[];       // după biletele TIKI pe toate zilele (migr. 472)
  mici: number;          // bilete TIKI mici: drum fără Chișinău sau sub 50 lei, toate zilele (migr. 473)
  mici_fara_c: number;   // fără bilet pe perechi fără Chișinău, zilele complet numărate
}

/** Rută × lună, ultimele 24 de luni (migr. 471): graficul fiecărei rute. */
export interface TikiRutaLuna {
  route: number;
  luna: string;               // 'YYYY-MM'
  zile_circulate: number;
  zile_numarate: number;
  tiki: number;
  tiki_c: number;
  fara_c: number;
}

export interface TikiRutaPerechi {
  zile_circulate: number;
  zile_numarate: number;
  perechi: (PerechePe & { leg: Leg | '?'; tiki: number; tiki_c: number; fara: number })[];
}

export interface TikiSoferV2 {
  sofer: string;
  zile: number;
  curse: number;
  bilete: number;
  lei: number;
  curse_comp: number;
  bilete_comp: number;
  asteptat: number;
  ruta: number | null;
  ruta_de_la: string | null;
  ruta_ora: string | null;
}

export interface TikiSoferi {
  soferi: TikiSoferV2[];
  bilete_fara_sofer: number;
  bilete_fara_ruta: number;
  bilete_total: number;
}
