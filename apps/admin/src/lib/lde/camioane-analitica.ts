// Agregările pure ale analiticii de camioane (Ion, 31.08.2026). Fără BD —
// primesc rândurile deja citite și întorc cifrele afișate.
export type CursaCuMetrici = {
  tripId: string;
  vehicleId: string;
  plate: string;
  driverName: string | null;
  cargo: string | null;
  de: string | null;
  la: string | null;
  status: string;
  loadPlannedAt: string;
  unloadPlannedAt: string;
  kmReal: number | null;
  kmIdeal: number | null;
  kmDeviation: number | null;
  stops: number | null;
  loadDelayMin: number | null;
  unloadDelayMin: number | null;
};

export type ZiStare = { vehicleId: string; date: string; state: 'reparatie' | 'odihna' };

/** Ziua calendaristică la Chișinău. `slice(0,10)` pe un timestamptz UTC punea
 *  încărcarea de la 01:00 local în ziua precedentă (arch review 31.08). */
export function ziChisinau(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Chisinau' }).format(new Date(iso));
}

/** Câte curse au metrici calculate — restul așteaptă workerul de noapte. */
export function acoperireMetrici(curse: CursaCuMetrici[]): { cuMetrici: number; total: number; faraIdeal: number } {
  const cuMetrici = curse.filter((c) => c.kmReal !== null).length;
  const faraIdeal = curse.filter((c) => c.kmReal !== null && c.kmIdeal === null).length;
  return { cuMetrici, total: curse.length, faraIdeal };
}

/** Top abateri de traseu. Fără km ideali nu există abatere — cursa nu intră. */
export function topAbateri(curse: CursaCuMetrici[], limita = 10): CursaCuMetrici[] {
  return curse
    // Cursa anulată păstrează rândul de metrici scris înainte de anulare —
    // nu are ce căuta în evaluarea traseelor (audit 31.08).
    .filter((c) => c.status !== 'anulata' && c.kmDeviation !== null)
    .sort((a, b) => (b.kmDeviation as number) - (a.kmDeviation as number))
    .slice(0, limita);
}

export type Punctualitate = {
  cheie: string;
  curse: number;
  /** Curse cu sosire detectată de GPS — doar ele pot fi judecate la punctualitate. */
  masurate: number;
  intarziereMedieIncarcare: number | null;
  intarziereMedieDescarcare: number | null;
  intarziate: number;
};

/** Punctualitatea grupată (pe șofer sau pe direcție). Media ignoră cursele nemăsurate. */
export function punctualitate(curse: CursaCuMetrici[], cheie: (c: CursaCuMetrici) => string): Punctualitate[] {
  const g = new Map<string, CursaCuMetrici[]>();
  for (const c of curse) {
    if (c.status === 'anulata') continue;
    const k = cheie(c);
    if (!k) continue;
    const lista = g.get(k);
    if (lista) lista.push(c);
    else g.set(k, [c]);
  }
  const medie = (v: (number | null)[]) => {
    const n = v.filter((x): x is number => x !== null);
    return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null;
  };
  return [...g.entries()]
    .map(([k, lista]) => ({
      cheie: k,
      curse: lista.length,
      masurate: lista.filter((c) => c.unloadDelayMin !== null).length,
      intarziereMedieIncarcare: medie(lista.map((c) => c.loadDelayMin)),
      intarziereMedieDescarcare: medie(lista.map((c) => c.unloadDelayMin)),
      // «Întârziată» = a ajuns la descărcare cu peste 30 min după plan. Cursa
      // NEMĂSURATĂ nu e nici punctuală, nici întârziată: `?? 0` o trecea drept
      // punctuală, deci un șofer cronic întârziat ieșea curat (audit Critical).
      intarziate: lista.filter((c) => c.unloadDelayMin !== null && c.unloadDelayMin > 30).length,
    }))
    .sort((a, b) => b.curse - a.curse);
}

export type UtilizareCamion = {
  vehicleId: string;
  plate: string;
  zileInCursa: number;
  zileReparatie: number;
  zileOdihna: number;
  zileLibere: number;
};

/**
 * Utilizarea flotei pe o perioadă. O zi în care camionul a fost și în cursă, și
 * marcat reparație se numără la cursă: el a lucrat.
 */
export function utilizare(
  camioane: { vehicleId: string; plate: string }[],
  curse: CursaCuMetrici[],
  stari: ZiStare[],
  zile: string[],
): UtilizareCamion[] {
  const zileCursa = new Map<string, Set<string>>();
  for (const c of curse) {
    if (c.status === 'anulata') continue;
    const set = zileCursa.get(c.vehicleId) ?? new Set<string>();
    const start = ziChisinau(c.loadPlannedAt);
    const end = ziChisinau(c.unloadPlannedAt);
    for (const z of zile) if (z >= start && z <= end) set.add(z);
    zileCursa.set(c.vehicleId, set);
  }
  const stariMap = new Map<string, 'reparatie' | 'odihna'>();
  for (const s of stari) stariMap.set(`${s.vehicleId}|${s.date}`, s.state);

  return camioane.map((cam) => {
    let inCursa = 0, reparatie = 0, odihna = 0, libere = 0;
    for (const z of zile) {
      if (zileCursa.get(cam.vehicleId)?.has(z)) { inCursa++; continue; }
      const st = stariMap.get(`${cam.vehicleId}|${z}`);
      if (st === 'reparatie') reparatie++;
      else if (st === 'odihna') odihna++;
      else libere++;
    }
    return { vehicleId: cam.vehicleId, plate: cam.plate, zileInCursa: inCursa, zileReparatie: reparatie, zileOdihna: odihna, zileLibere: libere };
  }).sort((a, b) => b.zileInCursa - a.zileInCursa);
}

/**
 * Km goi vs încărcați. Segmentul gol = de la descărcarea cursei precedente până
 * la încărcarea celei curente, pe același camion (definiția din spec).
 * Îl aproximăm din km reali: ce a mers camionul între curse.
 */
export function kmGoiVsIncarcati(
  curse: CursaCuMetrici[],
  kmZilnic: { vehicleId: string; date: string; km: number }[],
  zile: string[],
): { kmIncarcati: number; kmTotali: number; kmGoi: number; procentGol: number | null } {
  const zileSet = new Set(zile);
  // DOAR cursele încheiate în perioadă: una începută înainte aducea km_real
  // ÎNTREG, în timp ce km-ii GPS veneau doar pentru zilele din fereastră —
  // «încărcați» depășeau totalul și km-ii goi ieșeau 0 (audit 31.08).
  const kmIncarcati = curse
    .filter((c) => c.status !== 'anulata' && c.kmReal !== null && zileSet.has(ziChisinau(c.unloadPlannedAt)))
    .reduce((s, c) => s + (c.kmReal as number), 0);
  const kmTotali = kmZilnic.filter((k) => zileSet.has(k.date)).reduce((s, k) => s + k.km, 0);
  const kmGoi = Math.max(0, Math.round((kmTotali - kmIncarcati) * 10) / 10);
  return {
    kmIncarcati: Math.round(kmIncarcati * 10) / 10,
    kmTotali: Math.round(kmTotali * 10) / 10,
    kmGoi,
    procentGol: kmTotali > 0 ? Math.round((kmGoi / kmTotali) * 100) : null,
  };
}
