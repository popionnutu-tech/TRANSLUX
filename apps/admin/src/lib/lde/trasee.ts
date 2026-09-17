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


// ============================================================================
// Ion, 17.09: «chiar dacă două rute din zonă similară sunt făcute de diferiți șoferi,
// trebuie să fie propuneri de optimizări sau angajare noi șofer».
//
// Schimbul între doi șoferi mută problema, nu o rezolvă, când NICIUNUL nu stă în zonă.
// Aici sunt celelalte două pârghii: comasarea (un om ia ambele ture din zonă, celălalt
// se eliberează) și angajarea locală (câți km s-ar tăia dacă ar exista un șofer chiar
// acolo). A doua e singura care se vede ca decizie de personal, nu de grafic.
// ============================================================================

export const RAZA_ZONA_KM = 10;

export type PropunereComasare = {
  zona: string;
  rute: string[];
  ramane: { driver_id: string; nume: string };
  se_elibereaza: { driver_id: string; nume: string };
  economie_km_zi: number;
};

export type PropunereAngajare = {
  zona: string;
  lat: number;
  lon: number;
  rute: string[];
  soferi_acum: string[];
  km_acum: number;
  km_daca_local: number;
  economie_km_zi: number;
};

/** Rutele se grupează pe zone după prima lor stație (praguri în km). */
function grupeazaZone(rute: RutaCost[], razaKm = RAZA_ZONA_KM): RutaCost[][] {
  const out: RutaCost[][] = [];
  for (const r of rute) {
    if (!r.primaStatie) continue;
    const g = out.find((z) => haversineKm(z[0].primaStatie!, r.primaStatie!) <= razaKm);
    if (g) g.push(r); else out.push([r]);
  }
  return out;
}

/**
 * Comasare: două rute din aceeași zonă, ture care NU se suprapun, doi șoferi diferiți.
 * Unul le poate lua pe amândouă — cel care e deja mai aproape — iar celălalt se
 * eliberează. Economia raportată sunt km-ii goi ai celui eliberat: ea e reală doar dacă
 * omul chiar nu e nevoie în altă parte, iar asta o decide Ion, nu calculul.
 */
export function propuneriComasare(
  soferi: SoferCurent[],
  rute: Map<string, RutaCost>,
  turaRutei: Map<string, number>,
  minEconomieKm = 5,
): PropunereComasare[] {
  const soferulRutei = new Map<string, SoferCurent>();
  for (const s of soferi) for (const id of s.rute) if (!soferulRutei.has(id)) soferulRutei.set(id, s);

  const out: PropunereComasare[] = [];
  for (const zona of grupeazaZone([...rute.values()])) {
    if (zona.length < 2) continue;
    for (let i = 0; i < zona.length; i++) {
      for (let j = i + 1; j < zona.length; j++) {
        const a = zona[i], b = zona[j];
        const sa = soferulRutei.get(a.factory_route_id), sb = soferulRutei.get(b.factory_route_id);
        if (!sa || !sb || sa.driver_id === sb.driver_id) continue;
        // turele trebuie să fie diferite: în același schimb un om nu poate fi în două locuri
        const ta = turaRutei.get(a.factory_route_id), tb = turaRutei.get(b.factory_route_id);
        if (ta == null || tb == null || ta === tb) continue;

        const costA_b = costZi(sa.baza, [b]), costB_b = costZi(sb.baza, [b]);
        const costB_a = costZi(sb.baza, [a]), costA_a = costZi(sa.baza, [a]);
        if (costA_b == null || costB_b == null || costB_a == null || costA_a == null) continue;

        // cine rămâne: cel pentru care ambele rute costă mai puțin
        const ramaneA = costA_a + costA_b <= costB_a + costB_b;
        const economie = ramaneA ? costB_b : costA_a;
        if (economie < minEconomieKm) continue;
        out.push({
          zona: (a.primaStatie as { locality?: string }).locality ?? a.eticheta,
          rute: [a.eticheta, b.eticheta],
          ramane: ramaneA ? { driver_id: sa.driver_id, nume: sa.nume } : { driver_id: sb.driver_id, nume: sb.nume },
          se_elibereaza: ramaneA ? { driver_id: sb.driver_id, nume: sb.nume } : { driver_id: sa.driver_id, nume: sa.nume },
          economie_km_zi: +economie.toFixed(1),
        });
      }
    }
  }
  return out.sort((x, y) => y.economie_km_zi - x.economie_km_zi);
}

/**
 * Angajare locală: câți km s-ar tăia dacă ar exista un șofer care STĂ în zonă.
 * Costul lui ideal nu e zero — tot trebuie să se întoarcă de la ultima stație la prima —
 * dar drumul de acasă dispare. Diferența e plafonul a ce se poate câștiga din grafic:
 * dacă e mare, niciun schimb de șoferi n-o atinge, fiindcă niciunul nu stă acolo.
 */
export function propuneriAngajare(
  soferi: SoferCurent[],
  rute: Map<string, RutaCost>,
  minEconomieKm = 20,
): PropunereAngajare[] {
  const soferulRutei = new Map<string, SoferCurent>();
  for (const s of soferi) for (const id of s.rute) if (!soferulRutei.has(id)) soferulRutei.set(id, s);

  const out: PropunereAngajare[] = [];
  for (const zona of grupeazaZone([...rute.values()])) {
    const acasa = zona[0].primaStatie!;
    let kmAcum = 0, kmLocal = 0;
    const numeSoferi = new Set<string>(), eticheteRute: string[] = [];
    let complet = true;
    for (const r of zona) {
      const s = soferulRutei.get(r.factory_route_id);
      const c = s ? costZi(s.baza, [r]) : null;
      const cLocal = costZi(acasa, [r]);
      if (c == null || cLocal == null) { complet = false; break; }
      kmAcum += c; kmLocal += cLocal;
      if (s) numeSoferi.add(s.nume);
      eticheteRute.push(r.eticheta);
    }
    if (!complet) continue;
    const economie = +(kmAcum - kmLocal).toFixed(1);
    if (economie < minEconomieKm) continue;
    out.push({
      zona: (acasa as { locality?: string }).locality ?? eticheteRute[0],
      lat: acasa.lat, lon: acasa.lon, rute: eticheteRute,
      soferi_acum: [...numeSoferi], km_acum: +kmAcum.toFixed(1), km_daca_local: +kmLocal.toFixed(1),
      economie_km_zi: economie,
    });
  }
  return out.sort((x, y) => y.economie_km_zi - x.economie_km_zi);
}
