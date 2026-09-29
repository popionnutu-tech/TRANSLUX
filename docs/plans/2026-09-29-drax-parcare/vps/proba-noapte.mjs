// Codex r3 C2: nopțile cu deplasare obligatorie seara / dimineața (ancorele E / S ≠ capetele curselor): costul prin loc ≥ legătura ideală + ocol între E și S;
// dacă locul e chiar la capătul cursei, costul nu poate fi sub drumul E → loc → S.
import fs from 'fs';
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs'); const { hav, kmDrum } = C;
const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const PK = JSON.parse(fs.readFileSync(`${W}/parcare.json`, 'utf8'));
const ZI = JSON.parse(fs.readFileSync(`${W}/ziua-ideala.json`, 'utf8'));
const RZ = new Map(ZI.randuri.map((r) => [`${r.m}|${r.z}`, r]));
let n = 0, cuMunca = 0, rele = [];
for (const m of PK.masini) for (const l of m.legi.filter((x) => x.parte === 'noapte' && !x.separat)) {
  n++; const r = RZ.get(`${m.m}|${l.z}`), jS = r?.jumatati?.find((j) => j.part === 'seara');
  const E = r?.ancore?.E, S = RZ.get(`${m.m}|${l.zUrm}`)?.ancore?.S;
  if (!E || !S || l.ancore !== true) { rele.push(`${m.m} ${l.z}: noapte fără ancore E / S`); continue; }
  const difEa = hav({ lat: E[0], lon: E[1] }, { lat: l.a[0], lon: l.a[1] }), difSb = hav({ lat: S[0], lon: S[1] }, { lat: l.b[0], lon: l.b[1] });
  if (difEa > 0.01 || difSb > 0.01) rele.push(`${m.m} ${l.z}: drumul propus nu pleacă din E (${difEa.toFixed(2)} km) / nu ajunge în S (${difSb.toFixed(2)} km)`);
  const loc = m.locuri.find((x) => x.nr === l.loc); if (!loc) continue;
  const minim = (await kmDrum({ lat: E[0], lon: E[1] }, { lat: loc.c[0], lon: loc.c[1] })) + (await kmDrum({ lat: loc.c[0], lon: loc.c[1] }, { lat: S[0], lon: S[1] }));
  if (jS?.legaturaInterna > 0) cuMunca++;
  if (l.km + 0.05 < Math.min(minim * 1.05, (jS?.legNoapte ?? 0))) rele.push(`${m.m} ${l.z}: cost ${l.km} < E→loc→S ${(minim * 1.05).toFixed(1)} și < legătura ideală ${jS?.legNoapte}`);
}
console.log(`nopți verificate ${n}, cu legătură internă (muncă seara/dimineața) ${cuMunca}; abateri: ${rele.length}`); for (const x of rele.slice(0, 10)) console.log('  ', x);
