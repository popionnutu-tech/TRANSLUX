// ============================================================================
// LDE — propunerea de repartizare: ce schimb de șoferi micșorează km-ii goi.
//
// Logică PURĂ, testată. Nu schimbă nimic: întoarce sugestii cu câștigul lor, iar omul
// decide. Ion, 17.09: minimizăm km-ii goi casă ↔ prima stație ȘI retururile goale.
//
// Se propun SCHIMBURI ÎNTRE DOI ȘOFERI, nu o re-repartizare totală. Motivul e practic:
// un schimb între doi oameni se poate face luni dimineața și se poate explica în două
// fraze; o hartă nouă a întregii uzine nu.
// ============================================================================

/** Fereastra maximă a paginii. Aici, nu în actions.ts: acolo e 'use server', unde se pot
 *  exporta doar funcții async. */
export const ZILE_MAX = 30;

/** Distanța în km între două puncte. Aceeași formulă ca în worker (km-core.hav). */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export type Baza = { lat: number; lon: number };
export type RutaCost = {
  factory_route_id: string;
  eticheta: string;
  /** primul punct al etalonului de tur — de unde începe cursa cu pasageri */
  primaStatie: Baza | null;
  /** ultimul punct al etalonului de retur — unde se termină */
  ultimaStatie: Baza | null;
};
export type SoferCurent = {
  driver_id: string;
  nume: string;
  baza: Baza | null;
  /** rutele pe care le face intr-o zi, IN ORDINEA TURELOR */
  rute: string[];
};

export type Propunere = {
  a: { driver_id: string; nume: string; de_pe: string; pe: string };
  b: { driver_id: string; nume: string; de_pe: string; pe: string };
  km_acum: number;
  km_dupa: number;
  economie_km_zi: number;
};

/**
 * Costul unei perechi șofer↔rută: km-ii goi de acasă la prima stație și de la ultima
 * înapoi acasă. `null` când nu se poate calcula — acele perechi NU primesc o estimare
 * inventată, ies din propunere (precedentul `km_ideal NULL` din migr. 300).
 */
export function costPereche(baza: Baza | null, ruta: RutaCost): number | null {
  if (!baza || !ruta.primaStatie || !ruta.ultimaStatie) return null;
  return +(haversineKm(baza, ruta.primaStatie) + haversineKm(ruta.ultimaStatie, baza)).toFixed(2);
}

/**
 * Km-ii goi ai unui sofer pe ZIUA INTREAGA, nu pe o singura ruta.
 *
 * Ion, 17.09: «pot fi situatii cand o tura si a doua sunt din zone similare, si optimal ar
 * fi sofer din sat care se afla intre aceste 2 zone». Are dreptate, iar varianta dinainte
 * n-avea cum s-o vada: socoteam doar dus-intors pentru o singura ruta, deci omul care sta
 * LA MIJLOC intre cele doua zone nu avea niciun avantaj — dimpotriva, iesea mai scump
 * decat cel lipit de una din ele.
 *
 * Ziua reala a unui sofer cu doua ture are TREI bucati goale:
 *   acasa -> prima statie a turei 1
 *   ultima statie a turei 1 -> prima statie a turei 2   (intoarcerea intre ture)
 *   ultima statie a ultimei ture -> acasa
 *
 * Bucata din mijloc e tocmai «returul gol» cerut de la inceput (partea „3" din «1+3»).
 * Cu ea in suma, satul dintre cele doua zone castiga singur.
 */
export function costZi(baza: Baza | null, rute: RutaCost[]): number | null {
  if (!baza || !rute.length) return null;
  if (rute.some((r) => !r.primaStatie || !r.ultimaStatie)) return null;   // o necunoscuta strica suma
  // Intre ture masina TRECE PE ACASA — masurat 17.09: in 576 din 723 de zile cu doua ture
  // (79,7%) are o oprire la sub 2 km de baza intre schimburi. Deci ziua e o suma de
  // dus-intors, nu un lant continuu; asta face ca satul asezat intre cele doua zone sa
  // castige cu adevarat, nu doar sa iasa la egalitate.
  let km = 0;
  for (const r of rute) km += haversineKm(baza, r.primaStatie!) + haversineKm(r.ultimaStatie!, baza);
  return +km.toFixed(2);
}

export function propuneriSchimb(
  soferi: SoferCurent[],
  rute: Map<string, RutaCost>,
  minEconomieKm = 5,
): Propunere[] {
  const out: Propunere[] = [];
  const set = (s: SoferCurent) => s.rute.map((id) => rute.get(id)).filter(Boolean) as RutaCost[];
  const eticheta = (s: SoferCurent) => set(s).map((r) => r.eticheta).join(' + ') || '—';

  for (let i = 0; i < soferi.length; i++) {
    for (let j = i + 1; j < soferi.length; j++) {
      const s1 = soferi[i], s2 = soferi[j];
      const r1 = set(s1), r2 = set(s2);
      if (!r1.length || !r2.length) continue;
      if (r1.map((r) => r.factory_route_id).join('|') === r2.map((r) => r.factory_route_id).join('|')) continue;

      const acum1 = costZi(s1.baza, r1), acum2 = costZi(s2.baza, r2);
      const dupa1 = costZi(s1.baza, r2), dupa2 = costZi(s2.baza, r1);
      if (acum1 == null || acum2 == null || dupa1 == null || dupa2 == null) continue;

      const acum = acum1 + acum2, dupa = dupa1 + dupa2;
      const economie = +(acum - dupa).toFixed(2);
      if (economie < minEconomieKm) continue;
      out.push({
        a: { driver_id: s1.driver_id, nume: s1.nume, de_pe: eticheta(s1), pe: eticheta(s2) },
        b: { driver_id: s2.driver_id, nume: s2.nume, de_pe: eticheta(s2), pe: eticheta(s1) },
        km_acum: +acum.toFixed(1), km_dupa: +dupa.toFixed(1), economie_km_zi: economie,
      });
    }
  }
  return out.sort((x, y) => y.economie_km_zi - x.economie_km_zi);
}

/** Economia totală dacă se aplică propunerile care nu se calcă (fiecare șofer o dată). */
export function economieCumulata(propuneri: Propunere[]): { aplicabile: Propunere[]; km_zi: number } {
  const folositi = new Set<string>();
  const aplicabile: Propunere[] = [];
  for (const p of propuneri) {
    if (folositi.has(p.a.driver_id) || folositi.has(p.b.driver_id)) continue;
    folositi.add(p.a.driver_id); folositi.add(p.b.driver_id);
    aplicabile.push(p);
  }
  return { aplicabile, km_zi: +aplicabile.reduce((s, p) => s + p.economie_km_zi, 0).toFixed(1) };
}
