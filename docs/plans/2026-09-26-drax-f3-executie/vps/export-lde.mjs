// Drăxlmaier — scheletul ideal v2 (ION-71 → F3 E.3, ION-94) pentru LDE (/lde/schelet?uz=drax): fișier fix în repo,
// apps/admin/public/lde/schelet-drax.json. Doar citește idealul v2 (drax/date/ideal-v2), numai după verdictul verificatorului ION-95:
// scriptul cheamă poarta (poarta.sh export <sursa>, cod 0) și recompară sha256 al schelet-ideal.json citit cu cel verificat (L4).
// Ion, 26.09: «nu folosim geometria, folosim km reali din GPS» — km-ii liniei = cardul (etalonul GPS completat, sau cardul vechi cu steagul
// «diagnostic cerut» unde verificarea nu permite corecția); drumul desenat e DOAR pentru hartă, abaterea lui față de card > 5 % = `hartaAbatere`.
//   node export-lde.mjs <cale ieșire> [<sursa>=/root/lde-worker/drax/date/ideal-v2]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [OUTF, SRC = '/root/lde-worker/drax/date/ideal-v2'] = process.argv.slice(2);
if (!OUTF) { console.error('export-lde.mjs <ieșire> [<sursa>]'); process.exit(2); }
let lista;
try { lista = execFileSync('bash', ['/home/verif/verificator/cod/poarta.sh', 'export', SRC], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }); }
catch { console.error('POARTA ÎNCHISĂ — exportul nu se face'); process.exit(3); }
const buf = readFileSync(`${SRC}/schelet-ideal.json`), h = createHash('sha256').update(buf).digest('hex');
if (!lista.split('\n').some((r) => r.startsWith(h + '  ') && r.endsWith('/schelet-ideal.json'))) { console.error('schelet-ideal.json ≠ cel verificat (L4)'); process.exit(3); }
const S = JSON.parse(buf);
const c5 = ([a, b]) => [+a.toFixed(5), +b.toFixed(5)];
const hv = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r; const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
const rare = (d, pas = 3) => d.filter((_, i) => i % pas === 0 || i === d.length - 1).map(c5);
const rute = new Map();
for (const l of S) {
  const r = rute.get(l.ruta) ?? rute.set(l.ruta, { id: l.ruta, nr: l.nr, nume: l.nume, linii: [] }).get(l.ruta);
  const drum = l.drum?.length ? rare(l.drum) : [];
  const sch = Object.fromEntries(Object.entries(l.schimburi ?? {}).map(([s, x]) => [s, { zile: x.zile ?? null, km: x.km ?? null, oraTur: x.oraTur ?? null, oraRetur: x.oraRetur ?? null,
    poartaTur: x.poartaTur ?? null, poartaRetur: x.poartaRetur ?? null, masini: (x.masini ?? []).map((m) => m.m) }]));
  const km = l.km > 0 ? l.km : null;
  r.linii.push({ nr: l.linie, capat: l.capat ?? null, capatC: l.capatC ? c5(l.capatC) : null, km, tureZi: l.tureZi ?? null,
    kmZi: km != null && l.tureZi != null ? +(2 * km * l.tureZi).toFixed(1) : null,
    kmSursa: !km ? null : l.card?.sursa === 'etalon GPS completat' ? 'GPS (etalon completat)' : 'card vechi (ION-71)',
    etalonGPS: l.card?.etalonGPS ?? null, c47: l.card?.c47 ?? null,
    diagnostic: l.diagnostic ?? null, diagnosticMotiv: l.diagnosticMotiv ?? null, faraIdeal: !km, informativ: !!l.informativ,
    hartaAbatere: l.drum?.length && km ? +((l.drum.reduce((a, p, i) => (i ? a + hv(l.drum[i - 1], p) : 0), 0) / km - 1) * 100).toFixed(1) : null,
    grupa: l.autobuze ?? null, locuri: l.locuri ?? null, gps: !!l.gps,
    schimburi: sch, tur: { plin: drum }, retur: { plin: drum }, sate: (l.sateDrum ?? []).map((s) => ({ n: s.n, c: c5(s.c) })) });
}
const OUT = { _: 'Scheletul ideal v2 Drăxlmaier Bălți (ION-71 → ION-94 F3): rută × linie, tur = retur, ture/zi măsurate, km = etalonul GPS completat (verificat de ION-95). Generat de drax/cod/ideal/export-lde.mjs.',
  fixat: new Date().toISOString().slice(0, 10), perioada: '04.05–17.07 + 01.09–25.09.2026', sha256: h,
  porti: [{ c: [47.78513, 27.94307], n: 'Poarta EST' }, { c: [47.77408, 27.91593], n: 'Poarta VEST' }], parc: [47.770, 27.9235],
  rute: [...rute.values()] };
const s = JSON.stringify(OUT); writeFileSync(OUTF, s);
const L = OUT.rute.flatMap((r) => r.linii);
console.log(`${OUT.rute.length} rute · ${L.length} linii · cu km ${L.filter((x) => x.km).length} · diagnostic cerut ${L.filter((x) => x.diagnostic).map((x) => x.nr).join(', ')} · km/zi (fără liniile informative) ${L.filter((x) => !x.informativ).reduce((a, x) => a + (x.kmZi ?? 0), 0).toFixed(0)} · informative ${L.filter((x) => x.informativ).length} · ${(s.length / 1024).toFixed(0)} KB`);
