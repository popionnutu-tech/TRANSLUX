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
