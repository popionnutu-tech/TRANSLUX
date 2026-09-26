// filtru-rupte.mjs — filtrul COMUN de urmă ruptă (ION-95 v4.1, verdictul dezbaterii verificării 1, pct. 2): o singură funcție pentru
// etalon-gps.mjs (etalonul GPS, deci și cardul generat în lanț), C47 din drax.mjs și generatorul F3.
// Un picior e «rupt» dacă `plin` e mai mic decât distanța minimă fizic posibilă între capăt și poartă, cu limite COMPATIBILE cu `plin`:
//   limita = dreapta(centrul porții → capătul liniei) − raza porții (plin începe la marginea razei, curse.mjs:18)
//            − apropierea capătului din extracție (1,2 km, curse.mjs:19 R_SAT: tăietura cade oriunde la ≤1,2 km de capăt).
// Fără coeficient ales de mână (dezbatere Q6): prinde doar urmele rupte grav; cele rupte ușor rămân.
export const VERSIUNE_FILTRU = 'filtru-rupte v1';
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
// porti = [{ nume, raza, lat, lon }]; E = etalon-ideal.json (capatC pe linie); apropiere = 1,2 km
export function creeazaFiltru({ porti, E, apropiere = 1.2 }) {
  const P = Object.fromEntries(porti.map(p => [p.nume, p])); const cap = new Map(E.map(e => [`${e.ruta}|${e.linie}`, e.capatC]));
  const limita = c => { const g = P[c.poarta], k = cap.get(`${c.ruta}|${c.linie}`); if (!g || !k || g.lat == null) return null;
    return Math.max(0, hav({ lat: g.lat, lon: g.lon }, { lat: k[0], lon: k[1] }) - g.raza - apropiere); };
  return { limita, rupt: c => { const L = limita(c); return L != null && c.plin < L; } };
}
