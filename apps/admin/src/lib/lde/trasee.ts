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
  factory_route_id: string;
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
  if (!baza || !ruta.primaStatie) return null;
  const dus = haversineKm(baza, ruta.primaStatie);
  const intors = ruta.ultimaStatie ? haversineKm(ruta.ultimaStatie, baza) : dus;
  return +(dus + intors).toFixed(2);
}

/**
 * Perechile de șoferi care, dacă ar face schimb de rute, ar scădea suma km-ilor goi.
 * Ordonate după economie. `minEconomieKm` taie zgomotul: sub el nu merită deranjul.
 */
export function propuneriSchimb(
  soferi: SoferCurent[],
  rute: Map<string, RutaCost>,
  minEconomieKm = 5,
): Propunere[] {
  const out: Propunere[] = [];
  for (let i = 0; i < soferi.length; i++) {
    for (let j = i + 1; j < soferi.length; j++) {
      const s1 = soferi[i], s2 = soferi[j];
      if (s1.factory_route_id === s2.factory_route_id) continue;
      const r1 = rute.get(s1.factory_route_id), r2 = rute.get(s2.factory_route_id);
      if (!r1 || !r2) continue;

      const acum1 = costPereche(s1.baza, r1), acum2 = costPereche(s2.baza, r2);
      const dupa1 = costPereche(s1.baza, r2), dupa2 = costPereche(s2.baza, r1);
      // o singură necunoscută strică toată comparația → perechea se sare, nu se ghicește
      if (acum1 == null || acum2 == null || dupa1 == null || dupa2 == null) continue;

      const acum = acum1 + acum2, dupa = dupa1 + dupa2;
      const economie = +(acum - dupa).toFixed(2);
      if (economie < minEconomieKm) continue;
      out.push({
        a: { driver_id: s1.driver_id, nume: s1.nume, de_pe: r1.eticheta, pe: r2.eticheta },
        b: { driver_id: s2.driver_id, nume: s2.nume, de_pe: r2.eticheta, pe: r1.eticheta },
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
