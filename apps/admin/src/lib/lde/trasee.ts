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
  /** poarta uzinei pe care o servește ruta — capătul cu pasageri al zilei */
  poarta: Baza | null;
  /** de câte ori pe zi se face ruta (schimburi); o rută făcută de 3 ori costă de 3 ori */
  ture: number;
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
  if (rute.some((r) => !r.primaStatie || !r.ultimaStatie || !r.poarta)) return null;

  // ZIUA REALĂ a unei mașini, pe fiecare tură:
  //
  //   acasă → prima stație   (gol, scurt)
  //   prima stație → poartă  (PLIN — nu se numără)
  //   poartă → acasă         (GOL, LUNG)
  //   acasă → poartă         (GOL, LUNG)
  //   poartă → ultima stație (PLIN)
  //   ultima stație → acasă  (gol, scurt)
  //
  // Pauza de peste zi se întoarce LA POARTĂ, nu în sat: oamenii care ies din schimb se
  // iau de la uzină. Verificat pe 041BRAU/16.09 — pleacă din Drăgănești la 04:58, lasă
  // oamenii la poartă, se întoarce goală acasă (60,3 km), iar la 13:35 pornește iar spre
  // poartă ca să-i aducă înapoi. Deci dus-întorsul poartă↔acasă, o dată pe tură.
  //
  // Că pauza asta chiar se face pe acasă, nu la poartă, e măsurat pe 30 de zile: din
  // 1.595 de zile-mașină cu cel puțin două atingeri de poartă, în 79,2% mașina a oprit
  // acasă între ele. Iar numărul opririlor acasă urmărește numărul de TURE, nu de
  // atingeri: 2 atingeri (o tură) → 0,92 opriri acasă; 4 atingeri (două ture) → 2,42;
  // 6 atingeri (trei ture) → 2,93. De aceea multiplicatorul e `ture`, nu numărul de pauze.
  let km = 0;
  for (const r of rute) {
    const peTura =
      haversineKm(baza, r.primaStatie!)      // dimineața, spre primii oameni
      + 2 * haversineKm(r.poarta!, baza)     // pauza de peste zi: poartă → acasă → poartă
      + haversineKm(r.ultimaStatie!, baza);  // seara, spre casă
    km += peTura * Math.max(1, r.ture);      // ruta făcută de 3 ori costă de 3 ori
  }
  return +km.toFixed(2);
}

/**
 * Pragul lui Ion, 17.09: «100 km îți este mai puțin decât adăugarea încă un auto și încă
 * un salariu». Verificat: 100 km/zi × 6,11 lei ≈ 15.900 lei/lună, iar un șofer costă
 * ~13.400 lei/lună plus mașina. Deci orice propunere care cere un OM sau o MAȘINĂ în plus
 * trebuie să treacă de pragul ăsta ca să merite discutată.
 */
export const PRAG_OM_NOU_KM_ZI = 100;

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
/** Fereastra de timp a unei rute, în minute de la miezul nopții (poate trece peste 24h). */
export type FereastraTura = { de_la: number; pana_la: number };

/** Se suprapun două ture pe ceas? Granița comună (sfârșit = început) NU e suprapunere. */
export function seSuprapun(a: FereastraTura, b: FereastraTura, margineMin = 45): boolean {
  const norm = (f: FereastraTura) => (f.pana_la <= f.de_la ? { ...f, pana_la: f.pana_la + 1440 } : f);
  const x = norm(a), y = norm(b);
  const suprapus = (p: FereastraTura, q: FereastraTura) =>
    p.de_la < q.pana_la + margineMin && q.de_la < p.pana_la + margineMin;
  // ferestrele pot fi decalate cu o zi (schimb de noapte)
  return suprapus(x, y) || suprapus(x, { de_la: y.de_la + 1440, pana_la: y.pana_la + 1440 })
      || suprapus({ de_la: x.de_la + 1440, pana_la: x.pana_la + 1440 }, y);
}

export function propuneriComasare(
  soferi: SoferCurent[],
  rute: Map<string, RutaCost>,
  fereastraRutei: Map<string, FereastraTura>,
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
        // Verificarea pe CEAS, nu pe numărul schimbului. Varianta veche compara doar
        // `ta !== tb` și lăsa să treacă toate cele 6 propuneri, deși erau imposibile
        // fizic: una cerea șoferul la poarta Ungheni la 14:15 și la Bălți la 15:30, la
        // ~100 km distanță. Granița comună (sfârșitul turei 1 = începutul turei 2) e
        // tocmai cazul cel mai des întâlnit, și tocmai cel pe care `ta !== tb` îl rata.
        // Marginea acoperă drumul între cele două puncte de plecare.
        const fa = fereastraRutei.get(a.factory_route_id), fb = fereastraRutei.get(b.factory_route_id);
        if (!fa || !fb) continue;
        const drumMin = Math.round((haversineKm(a.primaStatie!, b.primaStatie!) / 50) * 60);
        if (seSuprapun(fa, fb, Math.max(45, drumMin))) continue;

        const costA_b = costZi(sa.baza, [b]), costB_b = costZi(sb.baza, [b]);
        const costB_a = costZi(sb.baza, [a]), costA_a = costZi(sa.baza, [a]);
        if (costA_b == null || costB_b == null || costB_a == null || costA_a == null) continue;

        // cine rămâne: cel pentru care ambele rute costă mai puțin
        // Economia e DIFERENȚA, nu costul celui eliberat: ruta lui tot se face, doar că
        // o face celălalt, din alt sat. Varianta veche raporta `costB_b` întreg — de 5,4
        // ori peste real (241 km/zi raportați față de 44,5), iar 3 din 6 propuneri
        // CREȘTEAU de fapt kilometrii.
        const ramaneA = costA_a + costA_b <= costB_a + costB_b;
        const economie = ramaneA ? costB_b - costA_b : costA_a - costB_a;
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


// ── Din rândurile brute în matricea de costuri ───────────────────────────────
// Partea asta e PURĂ și stă aici, nu în `actions.ts`, ca să poată fi rulată pe date reale
// fără sesiune și fără cerere HTTP: tot ce e mai jos (baza unui om, poarta uzinei, câte
// ture face ruta) decide cine cu cine se schimbă, deci trebuie să poată fi verificat.

export type RanduriPropuneri = {
  etaloane: { factory_route_id: string; sens: string; shift_number: number;
              prima_statie: unknown; ultima_statie: unknown }[];
  atribuiri: { driver_id: string; vehicle_id: string | null; factory_route_id: string;
               shift_number: number | null; date: string }[];
  baze: { vehicle_id: string; lat: number | null; lon: number | null }[];
  soferi: { id: string; full_name: string }[];
  rute: { id: string; uzina_id: string; route_number: number }[];
  porti: { uzina_id: string; lat: number | null; lon: number | null }[];
  granite: { uzina_id: string; shift_number: number; tip: string; minute_zi: number | null }[];
};

export type CosturiConstruite = {
  ruteCost: Map<string, RutaCost>;
  fereastraRutei: Map<string, FereastraTura>;
  soferi: SoferCurent[];
  fara_baza: number;
  rute_incomplete: number;
  /** câte mașini au rămas fără bază fiindcă dorm într-un garaj comun */
  garaje: number;
};

export function construiesteCosturi(intrari: RanduriPropuneri): CosturiConstruite {
  const { etaloane, atribuiri, baze, soferi, rute, porti, granite } = intrari;
  // baza unei mașini = mediana nopților ei; o singură noapte nu face o casă
  const puncte = new Map<string, { lat: number; lon: number }[]>();
  for (const b of baze) {
    if (b.lat == null || b.lon == null) continue;
    if (!puncte.has(b.vehicle_id)) puncte.set(b.vehicle_id, []);
    puncte.get(b.vehicle_id)!.push({ lat: Number(b.lat), lon: Number(b.lon) });
  }
  // Baza = locul unde mașina a dormit CEL MAI DES, nu mediana coordonatelor.
  // Mediana pe latitudine și pe longitudine, luate separat, dă un punct care poate să nu
  // existe: Cojocari Andrei doarme 15 nopți la Ghindești, 8 la Pelinia, 8 la Bălți —
  // mediana ieșea într-un câmp, la 35 km de oricare. Apărea în 9 din 26 de propuneri.
  const RAZA_NOAPTE_KM = 1.0;
  const dist = (p: { lat: number; lon: number }, q: { lat: number; lon: number }) =>
    haversineKm({ lat: p.lat, lon: p.lon }, { lat: q.lat, lon: q.lon });
  const bazaMasina = new Map<string, { lat: number; lon: number }>();
  const nopti = new Map<string, number>();
  for (const [vid, ps] of puncte) {
    if (ps.length < 3) continue;   // sub trei nopți nu tragem concluzii despre unde stă omul
    const grupuri: { lat: number; lon: number }[][] = [];
    for (const p of ps) {
      const g = grupuri.find((gr) => dist(gr[0], p) <= RAZA_NOAPTE_KM);
      if (g) g.push(p); else grupuri.push([p]);
    }
    grupuri.sort((x, y) => y.length - x.length);
    const g = grupuri[0];
    // reprezentantul e un punct REAL din grup, cel mai apropiat de centrul lui
    const cx = g.reduce((t, p) => t + p.lat, 0) / g.length;
    const cy = g.reduce((t, p) => t + p.lon, 0) / g.length;
    const medoid = g.reduce((b, p) => (dist(p, { lat: cx, lon: cy }) < dist(b, { lat: cx, lon: cy }) ? p : b), g[0]);
    bazaMasina.set(vid, medoid);
    nopti.set(vid, g.length);
  }

  // GARAJELE nu sunt case. Cinci mașini dorm în același punct din Bălți — e o parcare,
  // iar sistemul o lua drept casa a cinci șoferi diferiți (Pascari Ion e trecut
  // „Heciul-Vechi", mașina lui doarme la Bălți 21 din 40 de nopți; apărea în 4 propuneri).
  // Un punct unde dorm 3+ mașini diferite nu poate spune unde locuiește cineva.
  const RAZA_GARAJ_KM = 0.3;
  let garaje = 0;
  const bazeList = [...bazaMasina.entries()];
  for (const [vid, b] of bazeList) {
    const cateMasini = bazeList.filter(([, o]) => dist(b, o) <= RAZA_GARAJ_KM).length;
    if (cateMasini >= 3) { bazaMasina.delete(vid); garaje++; }
  }

  const numeSofer = new Map(soferi.map((d) => [d.id, d.full_name as string]));
  const eticheta = new Map(rute.map((r) => [r.id, `${r.uzina_id} #${r.route_number}`]));
  const uzinaRutei = new Map(rute.map((r) => [r.id as string, r.uzina_id as string]));

  // Poarta uzinei — capătul cu pasageri al zilei. Fără ea, `costZi` socotea doar drumul
  // casă→prima stație și retur, adică jumătate din ziua omului: pauza de peste zi (poartă
  // → acasă → poartă) e tocmai bucata goală pe care Ion a cerut s-o micșorăm. O uzină cu
  // două porți (Draxelmaier est+vest) primește punctul lor de mijloc: diferența dintre
  // porți e de 3 km, sub eroarea pe care o poate avea oricum atribuirea unei rute la o poartă.
  const poartaUzinei = new Map<string, { lat: number; lon: number }>();
  {
    const g = new Map<string, { lat: number; lon: number }[]>();
    for (const p of porti) {
      if (p.lat == null || p.lon == null) continue;
      if (!g.has(p.uzina_id)) g.set(p.uzina_id, []);
      g.get(p.uzina_id)!.push({ lat: Number(p.lat), lon: Number(p.lon) });
    }
    for (const [uz, ps] of g)
      poartaUzinei.set(uz, {
        lat: ps.reduce((t, p) => t + p.lat, 0) / ps.length,
        lon: ps.reduce((t, p) => t + p.lon, 0) / ps.length,
      });
  }

  // O rută făcută de 2–3 ori pe zi costă de 2–3 ori. Orhei lucrează în 3 ture cu aceeași
  // mașină și același om; costul unei singure ture îl arăta de trei ori mai ieftin decât e
  // și trăgea propunerile către rutele cu cele mai multe ture — fix pe dos. Numărul e
  // MEDIANA zilelor cu atribuire, nu media: o zi de sărbătoare cu o singură tură nu
  // trebuie să mute cifra pe o rută care lucrează normal în trei.
  // Se numără SCHIMBURILE DISTINCTE ale unui șofer într-o zi, nu rândurile de atribuire.
  // Rândurile numără mașini: o rută servită în același schimb de două microbuze (441 de
  // rânduri cu slot > 1) sau de doi șoferi dădea „4 ture" la Draxelmaier, care are două
  // schimburi. Măsurat pe 30 de zile, un șofer face pe o rută 1 tură (1.640 de zile),
  // 2 (317) sau 3 (388) — niciodată 4.
  const zileRutei = new Map<string, Map<string, Set<number>>>();
  for (const a of atribuiri) {
    const id = a.factory_route_id as string;
    if (a.shift_number == null) continue;
    if (!zileRutei.has(id)) zileRutei.set(id, new Map());
    const z = zileRutei.get(id)!;
    const k = `${a.date}|${a.driver_id}`;
    if (!z.has(k)) z.set(k, new Set());
    z.get(k)!.add(Number(a.shift_number));
  }
  const tureRutei = new Map<string, number>();
  for (const [id, z] of zileRutei) {
    const v = [...z.values()].map((x) => x.size).sort((x, y) => x - y);
    tureRutei.set(id, Math.max(1, v[Math.floor(v.length / 2)]));
  }

  // Fereastra reală a rutei pe ceas — de la începutul primului ei schimb până la sfârșitul
  // ultimului. Granițele sunt cele ÎNVĂȚATE din atingerile de poartă (migr. 367); acolo
  // unde nu s-a putut stabili una, ruta nu primește fereastră și iese din comasări, fiindcă
  // „nu știu ora" nu e același lucru cu „turele nu se suprapun".
  const granitaUzinei = new Map<string, number>();
  for (const g of granite)
    if (g.minute_zi != null) granitaUzinei.set(`${g.uzina_id}|${g.shift_number}|${g.tip}`, Number(g.minute_zi));
  const schimburileRutei = new Map<string, Set<number>>();
  for (const a of atribuiri) {
    const id = a.factory_route_id as string;
    if (a.shift_number == null) continue;
    if (!schimburileRutei.has(id)) schimburileRutei.set(id, new Set());
    schimburileRutei.get(id)!.add(Number(a.shift_number));
  }
  const fereastraRutei = new Map<string, FereastraTura>();
  for (const [id, sch] of schimburileRutei) {
    const uz = uzinaRutei.get(id);
    if (!uz || !sch.size) continue;
    const de_la = granitaUzinei.get(`${uz}|${Math.min(...sch)}|inceput`);
    const pana_la = granitaUzinei.get(`${uz}|${Math.max(...sch)}|sfarsit`);
    if (de_la == null || pana_la == null) continue;
    fereastraRutei.set(id, { de_la, pana_la });
  }

  const ruteCost = new Map<string, RutaCost>();
  for (const e of etaloane) {
    const id = e.factory_route_id as string;
    const cur: RutaCost = ruteCost.get(id) ?? {
      factory_route_id: id, eticheta: eticheta.get(id) ?? id,
      poarta: poartaUzinei.get(uzinaRutei.get(id) ?? '') ?? null,
      ture: tureRutei.get(id) ?? 1,
      primaStatie: null, ultimaStatie: null,
    };
    // Capetele vin din OPRIRILE STABILE, nu din geometrie. Capătul geometriei e primul
    // punct al zilei, adică locul unde doarme mașina — măsurat 17.09: în 730 din 1.099
    // de cazuri era la sub 1 km de bază. Costul compara casa unui șofer cu casa altuia.
    // PRIMUL din ordinea de mai sus câștigă; nu se suprascrie cu rândurile următoare.
    // Stația se ia doar dacă CHIAR SE REPETĂ. Ion, 17.09: «chiar dacă prima și ultima
    // oprire e greșită, în ideal ea se repetă». Sub jumătate din curse, locul e instabil
    // — mașina oprește de fiecare dată altundeva — și un cost calculat pe el ar fi o
    // cifră cu aparență de adevăr.
    const PRAG_REPETARE = 0.5;
    const pct = (v: unknown) => {
      const o = v as { lat?: number; lon?: number; pondere?: number } | null;
      if (!o || o.lat == null || o.lon == null) return null;
      if ((o.pondere ?? 0) < PRAG_REPETARE) return null;
      return { lat: Number(o.lat), lon: Number(o.lon) };
    };
    if (e.sens === 'tur') {
      const p = pct(e.prima_statie);
      if (p && !cur.primaStatie)
        cur.primaStatie = { ...p, locality: (e.prima_statie as { locality?: string })?.locality ?? null } as never;
    } else cur.ultimaStatie = cur.ultimaStatie ?? pct(e.ultima_statie);
    ruteCost.set(id, cur);
  }
  // rutele cu un singur capăt nu se pot compara cu celelalte — ies din calcul, nu
  // primesc jumătate de formulă
  let ruteIncomplete = 0;
  for (const [id, r] of [...ruteCost]) {
    if (!r.primaStatie || !r.ultimaStatie || !r.poarta) { ruteCost.delete(id); ruteIncomplete++; }
  }

  // ruta „curentă" a unui șofer = cea pe care a fost cel mai des; mașina lui la fel
  const nrRute = new Map<string, Map<string, number>>();
  const nrMasini = new Map<string, Map<string, number>>();
  const numara = (m: Map<string, Map<string, number>>, k: string, v: string) => {
    if (!m.has(k)) m.set(k, new Map());
    const x = m.get(k)!; x.set(v, (x.get(v) ?? 0) + 1);
  };
  for (const a of atribuiri) {
    const d = a.driver_id as string;
    numara(nrRute, d, a.factory_route_id as string);
    if (a.vehicle_id) numara(nrMasini, d, a.vehicle_id as string);
  }
  const celMaiDes = (m?: Map<string, number>) =>
    m ? [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null : null;

  // Un șofer poate face MAI MULTE ture într-o zi, din zone diferite. Ziua lui e suma
  // tuturor, nu o singură rută — Ion, 17.09: «pot fi situații când o tură și a doua sunt
  // din zone similare, și optimal ar fi șofer din sat care se află între aceste 2 zone».
  // Se iau rutele pe care a fost de cel puțin un sfert din zile, ordonate după cât de des.
  const lista: SoferCurent[] = [];
  let faraBaza = 0;
  for (const [driver_id, rute_] of nrRute) {
    const total = [...rute_.values()].reduce((s, n) => s + n, 0);
    const aleLui = [...rute_.entries()]
      .filter(([id, n]) => ruteCost.has(id) && n / total >= 0.25)
      .sort((x, y) => y[1] - x[1])
      .map(([id]) => id);
    if (!aleLui.length) continue;
    const masina = celMaiDes(nrMasini.get(driver_id));
    const baza = masina ? bazaMasina.get(masina) ?? null : null;
    if (!baza) faraBaza++;
    lista.push({ driver_id, nume: numeSofer.get(driver_id) ?? '?', baza, rute: aleLui });
  }

  return { ruteCost, fereastraRutei, soferi: lista, fara_baza: faraBaza, rute_incomplete: ruteIncomplete, garaje };
}
