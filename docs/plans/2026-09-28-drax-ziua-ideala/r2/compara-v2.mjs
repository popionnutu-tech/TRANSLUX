// ION-123 r2 — flota în cele două variante de observații (cu / fără dosarul _ciorna/2026-09-07-ion107)
import { readFileSync } from 'node:fs';
for (const f of ['ziua-ideala-v2.json', 'ziua-ideala-v2-fara-ciorna.json']) {
  const J = JSON.parse(readFileSync(new URL('./' + f, import.meta.url)));
  console.log('==', f); console.log(JSON.stringify({ flota: J.flota, sep: { zile: J.separatMasini.zile, economie: J.separatMasini.economie, cauze: J.separatMasini.cauze, separat: J.separatMasini.separat }, obs: J.observatii, nopti: J.nopti, pestePrag: J.pestePrag.length, probe: Object.fromEntries(Object.entries(J.probe).map(([k, v]) => [k, v?.n ?? v])), R1: { ...J.identitati.R1, abateri: J.identitati.R1.abateri.length }, parametri: J.parametri }));
  const neg = J.randuri.filter((r) => r.esant && !r.sep); const pos = neg.reduce((a, r) => a + Object.entries(r.cauze).filter(([k]) => k !== 'drumMaiScurt').reduce((s, [, v]) => s + v, 0), 0); console.log('pozitive', Math.round(pos * 10) / 10);
  const src = {}; for (const r of neg) { for (const i of r.intervale) if (i.src !== '0') { const k = i.src.includes('valhalla') ? (i.src.includes('gps') ? 'mixt' : 'valhalla') : 'gps'; src[k] = (src[k] ?? 0) + 1; } for (const h of r.jumatati) if (h.cat === 'normal' && h.src !== '0') { const k = h.src.includes('valhalla') ? 'valhalla' : 'gps'; src['n_' + k] = (src['n_' + k] ?? 0) + 1; } } console.log('legături folosite în eșantion (intervale / nopți normale)', JSON.stringify(src));
}
