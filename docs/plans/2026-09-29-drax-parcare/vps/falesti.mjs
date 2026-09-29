import fs from 'fs';
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs'); const { hav, kmDrum, salveazaCache } = C;
const [,, M = '925FTI', LOC = 'Fălești'] = process.argv;
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const r = await fetch(`${SB}/rest/v1/lde_harta_zi?uzina=eq.DRAXELMAIER&saptamina=eq.2026-09-14&m=eq.${M}&select=z,sumar,date&order=z`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const rows = await r.json();
const L = fs.readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n').map((l) => { try { return JSON.parse(l.replace(/^\x1e/, '')); } catch { return null; } })
  .find((g) => g?.properties?.name === LOC && /town|city|village/.test(g.properties.place));
const F = { lat: L.geometry.coordinates[1], lon: L.geometry.coordinates[0] };
const I = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/ziua-ideala.json', 'utf8'));
const r1 = (x) => Math.round(x * 10) / 10, P = (s) => ({ lat: s[0], lon: s[1] });
const casa = rows[0]?.date.casa; const C0 = casa ? { lat: casa.c[0], lon: casa.c[1] } : null;
console.log(`${M} · parcare propusă: ${LOC} (${F.lat.toFixed(4)}, ${F.lon.toFixed(4)}) · casa ${casa?.n} la ${C0 ? r1(await kmDrum(C0, F)) : '?'} km pe șosea de ${LOC}`);
const zile = rows.filter((x) => x.sumar.dow <= 5);
let tot = { gps: 0, gol: 0, munca: 0, fal: 0, ideal: 0 };
for (let k = 0; k < zile.length; k++) {
  const { z, sumar, date: d } = zile[k];
  const curse = d.iv.filter((v) => v.tip === 'cursa' && v.s.length > 1).map((v) => ({ ora: v.ora, de: P(v.s[0]), pana: P(v.s.at(-1)), deN: v.de, panaN: v.pana }));
  const munca = d.iv.filter((v) => v.tip !== 'cursa').reduce((a, v) => a + (v.cats.intreUzine ?? 0) + (v.cats.parc ?? 0) * 0, 0);
  // scenariul: între curse, dacă și următoarea pleacă de lângă uzină (≤ 3 km) și prima s-a terminat acolo → rămâne la uzină (0);
  // altfel merge la parcarea din Fălești și de acolo la plecarea următoare; noaptea: ultimul capăt → Fălești → primul capăt al zilei următoare
  let fal = 0; const pasi = [];
  for (let i = 0; i + 1 < curse.length; i++) {
    const a = curse[i].pana, b = curse[i + 1].de;
    if (hav(a, b) <= 3) { pasi.push(`${curse[i].ora.slice(-5)} rămâne (${curse[i].panaN} → ${curse[i + 1].deN})`); continue; }
    const x = (await kmDrum(a, F)) + (await kmDrum(F, b)); fal += x; pasi.push(`${curse[i].panaN} → ${LOC} → ${curse[i + 1].deN} ${r1(x)}`);
  }
  const urm = zile[k + 1] ?? zile[0];
  const cu = urm.date.iv.filter((v) => v.tip === 'cursa' && v.s.length > 1);
  const noapteS = await kmDrum(curse.at(-1).pana, F), noapteD = await kmDrum(F, P(cu[0].s[0]));
  fal += noapteS + noapteD; pasi.push(`noaptea: ${curse.at(-1).panaN} → ${LOC} ${r1(noapteS)} + dimineața ${LOC} → ${cu[0].de} ${r1(noapteD)}`);
  const gol = sumar.total - sumar.cuOameni - (d.iv.reduce((a, v) => a + (v.cats.intreUzine ?? 0), 0));
  const rz = I.randuri.find((x) => x.m === M && x.z === z);
  const golIdeal = rz ? rz.ideal - rz.obligatorii : null;
  tot.gol += gol; tot.fal += fal; tot.ideal += golIdeal ?? 0;
  console.log(`${z}: gol real ${r1(gol)} · cu parcare la ${LOC} ${r1(fal)} · ziua ideală ${r1(golIdeal)} · (${pasi.join('; ')})`);
}
console.log(`SĂPTĂMÂNA (luni–vineri, ${zile.length} zile): gol real ${r1(tot.gol)} · parcat la ${LOC} ${r1(tot.fal)} → economie ${r1(tot.gol - tot.fal)} · ziua ideală (gol) ${r1(tot.ideal)} → economia din raport ${r1(tot.gol - tot.ideal)}`);
salveazaCache();
