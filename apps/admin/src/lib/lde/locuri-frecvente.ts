// Locurile unde camioanele stau mult, descoperite din opririle GPS deja calculate
// de workerul de noapte (lde_gps_stops). Ion, 01.09: «каждая точка, где водитель
// сидит больше времени, чтобы определялось нашим диспетчером, что это за точка».
//
// Funcții pure: primesc opririle și punctele cunoscute, întorc locurile de propus.
import { haversineKm } from './camioane';

export type OprireGps = {
  vehicleId: string;
  plate: string;
  lat: number;
  lng: number;
  dwellMin: number;
  arrivalAt: string;
  locality: string | null;
};

export type PunctCunoscut = { id: string; name: string; lat: number | null; lng: number | null; radiusM: number };

export type LocFrecvent = {
  cheie: string;
  lat: number;
  lng: number;
  vizite: number;
  camioane: number;
  oreTotal: number;
  ultimaVizita: string;
  /** Denumirea localității cea mai des întâlnită pe opririle din grup — sugestie de nume. */
  sugestie: string | null;
  /** Raza care acoperă întinderea reală a opririlor, în metri — sugestie pentru nomenclator. */
  razaSugerata: number;
  placi: string[];
};

/** Grila de grupare: ~500 m. Sub ea, aceeași parcare apare ca zece locuri diferite. */
const PAS_GRID = 0.005;
/** Grupurile mai apropiate de atât se contopesc: grila taie un loc mare (portul
 *  Constanța) în 4 celule vecine, iar dispecerul ar vedea același loc de 4 ori.
 *  Pragul e puțin peste diagonala unei celule (≈0,67 km la 47°N): destul cât să
 *  lipească celulele lipite, prea puțin cât să înghită stația de peste drum.
 *  La 1,5 km înghițea (review 01.09). */
const RAZA_CONTOPIRE_KM = 0.8;
/** Raza sugerată la botez: cât de întins e locul, cu margini omenești. */
const RAZA_MIN_M = 300;
// Plafon 1500 m: raza intră direct în detecția de sosire a workerului, iar cea
// mai largă rază folosită azi (portul Constanța) e tot 1500. Peste atât, două
// puncte vecine ar începe să se suprapună.
const RAZA_MAX_M = 1500;

/** Un loc e «cunoscut» dacă intră în raza unui punct din nomenclator. */
export function esteCunoscut(loc: { lat: number; lng: number }, puncte: PunctCunoscut[]): boolean {
  return puncte.some((p) => {
    if (p.lat === null || p.lng === null) return false;
    // Raza punctului, dar minim 500 m: un punct cu rază mică ar lăsa aceeași
    // parcare să apară la nesfârșit ca «loc nou».
    const razaKm = Math.max(p.radiusM, 500) / 1000;
    return haversineKm(loc, { lat: p.lat, lng: p.lng }) <= razaKm;
  });
}

/**
 * Locurile de propus dispecerului: grupate, fără cele deja în nomenclator,
 * ordonate după cât de mult contează (ore totale de staționare).
 */
export function locuriFrecvente(
  opriri: OprireGps[],
  puncteCunoscute: PunctCunoscut[],
  optiuni?: { minVizite?: number; maxRezultate?: number; minOreLaOVizita?: number },
): LocFrecvent[] {
  const minVizite = optiuni?.minVizite ?? 2;
  // 250, nu 30: pe 60 de zile ies 99 de locuri necunoscute, iar plafonul de 30
  // ascundea două treimi — exact vămile și parcările de așteptare din străinătate.
  // 100 se atingea la fir, deci ar fi tăiat din nou la câteva camioane în plus.
  const maxRezultate = optiuni?.maxRezultate ?? 250;
  // O singură oprire, dar lungă, e tot un loc: uzina străină vizitată o dată la
  // câteva săptămâni cădea sub pragul de 2 vizite oricât ar fi stat camionul acolo.
  const minOreLaOVizita = optiuni?.minOreLaOVizita ?? 12;

  const grupuri = new Map<string, OprireGps[]>();
  for (const o of opriri) {
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) continue;
    const cheie = `${Math.round(o.lat / PAS_GRID)}|${Math.round(o.lng / PAS_GRID)}`;
    const g = grupuri.get(cheie);
    if (g) g.push(o); else grupuri.set(cheie, [o]);
  }

  // Contopim celulele vecine: două grupuri ale aceluiași loc, despărțite doar de
  // marginea grilei, trebuie să rămână un singur rând.
  const centre = [...grupuri.entries()]
    .map(([cheie, lista]) => ({
      cheie,
      lista,
      lat: lista.reduce((s, o) => s + o.lat, 0) / lista.length,
      lng: lista.reduce((s, o) => s + o.lng, 0) / lista.length,
    }))
    .sort((a, b) => b.lista.length - a.lista.length);

  const contopite: { cheie: string; lista: OprireGps[]; lat: number; lng: number }[] = [];
  for (const g of centre) {
    const vecin = contopite.find((c) => haversineKm({ lat: c.lat, lng: c.lng }, { lat: g.lat, lng: g.lng }) <= RAZA_CONTOPIRE_KM);
    if (vecin) { vecin.lista.push(...g.lista); continue; }
    contopite.push({ ...g, lista: [...g.lista] });
  }

  const out: LocFrecvent[] = [];
  for (const { cheie, lista, lat, lng } of contopite) {
    // Centrul rămâne al celulei celei mai dense, nu media tuturor opririlor lipite:
    // media pleacă spre celulele alăturate și poate cădea între două locuri reale,
    // ba chiar iese din raza unui punct deja botezat, care s-ar propune din nou.
    if (esteCunoscut({ lat, lng }, puncteCunoscute)) continue;

    const camioane = new Set(lista.map((o) => o.vehicleId));
    const ore = lista.reduce((s, o) => s + o.dwellMin, 0) / 60;
    if (lista.length < minVizite && ore < minOreLaOVizita) continue;

    // Sugestia de nume: localitatea cea mai frecventă din opririle grupului.
    const nume = new Map<string, number>();
    for (const o of lista) if (o.locality) nume.set(o.locality, (nume.get(o.locality) ?? 0) + 1);
    const sugestie = [...nume.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Raza sugerată: cât de departe de centru ajung opririle. Constanta 500 m
    // lăsa portul sau vama pe jumătate în afară — locul se propunea la nesfârșit,
    // iar workerul rata sosirile (raza punctului intră în detecția GPS).
    const intindereM = lista.reduce((max, o) => Math.max(max, haversineKm({ lat, lng }, o) * 1000), 0);
    const razaSugerata = Math.min(RAZA_MAX_M, Math.max(RAZA_MIN_M, Math.ceil((intindereM * 1.2) / 100) * 100));

    out.push({
      cheie,
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      razaSugerata,
      vizite: lista.length,
      camioane: camioane.size,
      oreTotal: Math.round(lista.reduce((s, o) => s + o.dwellMin, 0) / 60),
      ultimaVizita: lista.reduce((max, o) => (o.arrivalAt > max ? o.arrivalAt : max), lista[0].arrivalAt),
      sugestie,
      placi: [...new Set(lista.map((o) => o.plate))].sort().slice(0, 8),
    });
  }

  return out.sort((a, b) => b.oreTotal - a.oreTotal).slice(0, maxRezultate);
}
