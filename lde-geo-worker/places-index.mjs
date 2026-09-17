// ============================================================================
// LDE — localitățile OSM și căutarea lor spațială.
//
// Extras din gps-worker.mjs (17.09.2026) ca să poată fi folosit și de etichetarea
// urmei, nu doar de botezarea opririlor. Tiparul e cel al lui km-core.mjs: un modul
// pur, frate, importat de mai mulți worker-i — NU o copie, fiindcă praguri reglate
// într-o copie și nu în cealaltă e exact clasa de regresie din 10.07.2026.
//
// ⚠️ `nearestWithin` stă pe CALEA BANILOR: `locName` → `bridgeKm` → `computeDay` →
// `km_total` → salarii și facturare. De aceea grila e construită ca să dea EXACT
// același rezultat ca scanarea liniară, nu „aproximativ același": vecinătatea 3×3
// de celule de 0,05° acoperă garantat orice rază până la 3,8 km (lățimea unei celule
// la 47°N), iar noi căutăm în 2,0 km. Peste pragul ăsta funcția refuză, nu ghicește.
//
// Regula fermă a satelor-etichete: packages/db/src/lde-geo-rules.ts.
// ============================================================================
import fs from 'fs';
import { hav } from './km-core.mjs';

export const CELL_DEG = 0.05;              // ~5,56 km pe latitudine, ~3,80 km pe longitudine la 47°N
export const RAZA_MAX_SIGURA_KM = 3.8;     // dincolo de ea, 3×3 celule nu mai garantează exactitatea

/** Citește fișierul de locuri (GeoJSON pe linii, format OSM export). Numele românesc are prioritate. */
export function loadPlaces(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const cl = line.replace(/\x1e/g, '').trim(); if (!cl) continue;
    let f; try { f = JSON.parse(cl); } catch { continue; }
    const nm = f.properties && (f.properties['name:ro'] || f.properties.name); if (!nm) continue;
    const [lon, lat] = f.geometry.coordinates;
    out.push({ name: nm, lat, lon });
  }
  return out;
}

/**
 * Indexul spațial. Fără el, etichetarea urmei ar fi ~2.837 puncte × 150 mașini ×
 * ~1.800 locuri = ordinul miliardelor de haversine pe noapte. Cu el: 11-19 ms pe
 * mașină-zi, măsurat la proba din 17.09.
 */
export function buildPlacesIndex(places, cell = CELL_DEG) {
  const grid = new Map();
  const key = (i, j) => `${i}|${j}`;
  const celula = (v) => Math.floor(v / cell);
  for (const p of places) {
    const k = key(celula(p.lat), celula(p.lon));
    let b = grid.get(k); if (!b) { b = []; grid.set(k, b); }
    b.push(p);
  }

  function candidati(p) {
    const gi = celula(p.lat), gj = celula(p.lon), out = [];
    for (let i = gi - 1; i <= gi + 1; i++)
      for (let j = gj - 1; j <= gj + 1; j++) {
        const b = grid.get(key(i, j)); if (b) out.push(...b);
      }
    return out;
  }

  return {
    places, grid,

    /** Cel mai apropiat loc sub `maxKm`, sau null. Identic cu scanarea liniară. */
    nearestWithin(p, maxKm) {
      if (maxKm > RAZA_MAX_SIGURA_KM) throw new Error(`rază ${maxKm} km peste garanția grilei (${RAZA_MAX_SIGURA_KM})`);
      let best = null, bd = Infinity;
      for (const c of candidati(p)) { const d = hav(p, c); if (d < bd) { bd = d; best = c; } }
      return best && bd <= maxKm ? { name: best.name, d: bd } : null;
    },

    /** TOATE locurile sub prag — varianta B, aleasă la proba din 17.09 (83,6% vs 81,0%). */
    allWithin(p, maxKm) {
      if (maxKm > RAZA_MAX_SIGURA_KM) throw new Error(`rază ${maxKm} km peste garanția grilei (${RAZA_MAX_SIGURA_KM})`);
      const out = [];
      for (const c of candidati(p)) { const d = hav(p, c); if (d <= maxKm) out.push({ name: c.name, d }); }
      return out;
    },
  };
}

/** Scanare liniară — referința față de care se verifică grila. NU se folosește în producție. */
export function nearestLiniar(places, p) {
  let b = null, bd = Infinity;
  for (const pl of places) { const d = hav(p, pl); if (d < bd) { bd = d; b = pl; } }
  return b ? { name: b.name, d: bd } : null;
}
