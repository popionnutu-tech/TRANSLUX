// ============================================================================
// LDE camioane — metricile unei CURSE din punctele GPS (Ion, 31.08.2026).
// Nucleul pur: primește punctele deja încărcate din Wialon și întoarce cifre.
// Fără rețea, fără BD — de aceea e testabil direct (trip-metrics.test.mjs).
//
// Km-ii se calculează cu computeDay din km-core.mjs, NU cu o formulă nouă:
// altfel am avea două adevăruri despre kilometraj (unul în km-zilnic, altul aici),
// iar regresia din 10.07 a arătat cât costă asta.
// ============================================================================
import { hav, computeDay } from './km-core.mjs';

const MOVING_KMH = 5.6;   // ca în wialon-worker: sub asta camionul stă
const STOP_MIN_MIN = 30;  // oprire „lungă" pentru analitică (decizia din spec)

/** Punctul GPS e în raza punctului de încărcare/descărcare? */
export function inRaza(p, punct, razaM) {
  if (!punct || punct.lat == null || punct.lon == null) return false;
  return hav({ lat: p.lat, lon: p.lon }, { lat: punct.lat, lon: punct.lon }) * 1000 <= razaM;
}

/**
 * Prima INTRARE în raza punctului (timestamp unix) sau null.
 * Prima intrare, nu ultima: ea e momentul sosirii, adică ce se compară cu planul.
 */
export function detectArrival(points, punct, razaM) {
  let eraAfara = true;
  for (const p of points) {
    const inauntru = inRaza(p, punct, razaM);
    if (inauntru && eraAfara) return p.t;
    eraAfara = !inauntru;
  }
  return null;
}

/**
 * Opririle mai lungi de `minMinutes` în AFARA punctelor cunoscute.
 * Oprirea la încărcare/descărcare e munca cursei, nu abatere — de aceea se exclude.
 */
export function stopsOver(points, minMinutes, puncteExcluse = [], razaM = 500) {
  const out = [];
  let start = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const kmh = (hav({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) / dt) * 3600;
    const stationar = kmh < MOVING_KMH && (b.speed ?? 0) < MOVING_KMH;
    if (stationar) {
      if (start === null) start = a;
      continue;
    }
    if (start !== null) {
      const minute = (a.t - start.t) / 60;
      if (minute >= minMinutes && !puncteExcluse.some((pt) => inRaza(start, pt, razaM))) {
        out.push({ from: start.t, to: a.t, minutes: Math.round(minute), lat: start.lat, lon: start.lon });
      }
      start = null;
    }
  }
  if (start !== null) {
    const ultim = points[points.length - 1];
    const minute = (ultim.t - start.t) / 60;
    if (minute >= minMinutes && !puncteExcluse.some((pt) => inRaza(start, pt, razaM))) {
      out.push({ from: start.t, to: ultim.t, minutes: Math.round(minute), lat: start.lat, lon: start.lon });
    }
  }
  return out;
}

/**
 * Km reali ai cursei — aceeași cale de calcul ca la km-zilnic.
 * Punctele vin din wialon-api ({ t: unix, lat, lon, speed }), iar computeDay
 * așteaptă forma internă ({ t: Date, sp }) — conversia stă AICI, într-un singur loc.
 * Cârpirea găurilor de semnal e pe linie dreaptă: tronsoanele învățate sunt
 * referința autobuzelor și nu au voie să fie contaminate de camioane (wialon-worker).
 */
export function tripKm(points) {
  if (points.length < 2) return 0;
  const pts = points.map((p) => ({ lat: p.lat, lon: p.lon, t: new Date(p.t * 1000), sp: p.speed ?? 0 }));
  const r = computeDay(pts, {
    bridgeKm: (a, b) => ({ km: hav(a, b), src: 'straight_line' }),
    movingKmh: MOVING_KMH,
  });
  return Math.round(r.km * 10) / 10;
}

/** Punctele dintr-o fereastră de timp (unix inclusiv). */
export function feliaz(points, fromUnix, toUnix) {
  return points.filter((p) => p.t >= fromUnix && p.t <= toUnix);
}

/**
 * Metricile complete ale unei curse.
 * `kmIdeal` vine din afară (furnizor de rutare) — poate fi null, și atunci
 * abaterea rămâne null: nu inventăm un traseu ideal pe care nu-l cunoaștem.
 */
/** Timestamp unix plauzibil (2000..2100): Wialon poate întoarce gunoi, iar
 *  new Date(t*1000).toISOString() ar arunca RangeError. */
export function punctePlauzibile(points) {
  return points.filter((p) =>
    Number.isFinite(p?.t) && p.t > 946684800 && p.t < 4102444800 &&
    Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
}

export function tripMetrics({
  points: pointsBrute, loadPoint, unloadPoint, razaM = 500,
  razaLoad = razaM, razaUnload = razaM,
  kmIdeal = null, plannedLoad, plannedUnload,
}) {
  const points = punctePlauzibile(pointsBrute);
  const kmReal = tripKm(points);
  const loadActual = detectArrival(points, loadPoint, razaLoad);
  const unloadActual = detectArrival(
    loadActual ? points.filter((p) => p.t >= loadActual) : points,
    unloadPoint, razaUnload,
  );
  // Opririle se exclud cu raza fiecărui punct: o rază comună ascundea staționări
  // reale lângă punctul mic (arch review 31.08).
  const opririToate = [
    ...stopsOver(points, STOP_MIN_MIN, [loadPoint].filter(Boolean), razaLoad),
  ];
  const opriri = opririToate.filter((o) =>
    !unloadPoint || !inRaza({ lat: o.lat, lon: o.lon }, unloadPoint, razaUnload));

  const intarziere = (actualUnix, plannedIso) => {
    if (actualUnix == null || !plannedIso) return null;
    return Math.round((actualUnix * 1000 - Date.parse(plannedIso)) / 60000);
  };

  return {
    km_real: kmReal,
    km_ideal: kmIdeal,
    km_deviation: kmIdeal == null ? null : Math.round((kmReal - kmIdeal) * 10) / 10,
    stops_over_30min: opriri.length,
    // Numărul rămâne exact; lista se plafonează — un camion cu semnal prost putea
    // produce un jsonb nemărginit (security review 31.08). Cele mai lungi contează.
    stops_detail: [...opriri].sort((a, b) => b.minutes - a.minutes).slice(0, 20),
    load_actual_at: loadActual ? new Date(loadActual * 1000).toISOString() : null,
    unload_actual_at: unloadActual ? new Date(unloadActual * 1000).toISOString() : null,
    load_delay_min: intarziere(loadActual, plannedLoad),
    unload_delay_min: intarziere(unloadActual, plannedUnload),
  };
}

export { STOP_MIN_MIN, MOVING_KMH };
