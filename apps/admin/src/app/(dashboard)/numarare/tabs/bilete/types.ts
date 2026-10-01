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
