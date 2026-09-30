// ION-150 cercetare: opririle lungi ale cisternelor pe clase de loc și faze; golurile cu opririle din ele.
import fs from 'node:fs';
const S = new URL('.', import.meta.url).pathname;
const CS = '/Users/ionpop/dev/camioane-schelet';
const O = JSON.parse(fs.readFileSync(S + 'opriri.json', 'utf8'));
const SK = JSON.parse(fs.readFileSync(CS + '/verif-vps/date/verificare-schelet.json', 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180; const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const LOC = [];
for (const t of ['moldova', 'romania', 'ukraine', 'bulgaria']) for (const l of fs.readFileSync(`${CS}/date/loc-${t}.geojsonseq`, 'utf8').split('\n')) {
  if (!l.trim()) continue; const f = JSON.parse(l.replace(/^\x1e/, '')); const p = f.properties;
  const n = p['name:ro'] ?? p.name; if (!n || !p.place) continue;
  LOC.push({ n, place: p.place, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
}
const numeLoc = (s) => { let b = null, d = 1e9; for (const l of LOC) { const x = hav(s, l); if (x < d) { d = x; b = l; } } return b ? `${b.n}${d > 3 ? ` (+${d.toFixed(0)} km)` : ''}` : '?'; };
const CIST = new Set(['ANT316', 'ANT344', 'ANT347', 'BNQ076', 'BNQ088', 'DKE248', 'HMK135', 'HMK139', 'HMK145', 'IIC263', 'KWX620', 'KYK742', 'LJN076', 'LJN080', 'LML973', 'MOW214', 'MOW218', 'RWN169', 'RWN193']);
const BRICENI = SK.puncte.find((p) => p.name === 'Bază Briceni');
const clasa = (o) => {
  if (o.kind) return o.kind.startsWith('incarcare') ? 'la încărcare' : o.kind.startsWith('descarcare') ? 'la descărcare' : o.kind === 'baza' ? (o.punct === 'Bază Briceni' ? 'Bază Briceni' : o.punct === 'Bază Bălți' ? 'Bază Bălți' : 'stație Chișinău (bază)') : o.kind === 'vama' ? 'vamă' : 'tranzit/acte';
  if (hav(o, BRICENI) <= 5) return 'Briceni (≤ 5 km de bază)';
  if (o.incert) return 'fără semnal (incert)';
  return `în afara punctelor (${o.tara ?? '?'})`;
};
const h = (m) => Math.round(m / 60);
const rez = { masini: [], clase: {}, fazeClase: {}, noapte: {}, goluri: [] };
for (const m of O.masini) {
  if (!CIST.has(m.placa)) continue;
  const r = { placa: m.placa, km: m.kmSept, zile: m.zileCuDate, curse: m.curse.filter((c) => c.incPlecare >= '2026-08-31T21').length, ore: {}, acasa: null, motiv: null };
  if (!m.puncte) r.motiv = 'fără urmă Wialon (error 7 / dezactivată)'; else if (m.kmSept < 50) r.motiv = `stă toată luna (${m.kmSept} km)`;
  // clustere de opriri ≥ 8 h în afara punctelor (casa șoferului?)
  const lungi = m.opriri.filter((o) => o.min >= 480 && !o.kind && !o.incert);
  const cl = [];
  for (const o of lungi) { const c = cl.find((x) => hav(x, o) <= 3); if (c) { c.n++; c.min += o.minInLuna; } else cl.push({ lat: o.lat, lon: o.lon, n: 1, min: o.minInLuna }); }
  cl.sort((a, b) => b.min - a.min); r.clustere = cl.slice(0, 4).map((c) => ({ loc: numeLoc(c), n: c.n, ore: h(c.min), briceniKm: Math.round(hav(c, BRICENI)) }));
  for (const o of m.opriri) {
    const k = clasa(o); r.ore[k] = (r.ore[k] ?? 0) + o.minInLuna;
    if (!r.motiv) { rez.clase[k] = (rez.clase[k] ?? 0) + o.minInLuna; const f = `${o.faza} | ${k}`; rez.fazeClase[f] = (rez.fazeClase[f] ?? 0) + o.minInLuna; }
  }
  for (const k of Object.keys(r.ore)) r.ore[k] = h(r.ore[k]);
  if (!r.motiv) for (const n of m.noapte) {
    const o = n.sta ? m.opriri.find((x) => x.sosire <= new Date(Date.parse(n.zi + 'T00:00:00Z')).toISOString() || true) : null;
    const k = !n.sta ? (n.dtMin > 60 ? 'fără semnal' : 'în mers / oprire < 2 h') : clasa({ ...n, kind: n.punct ? SK.puncte.find((p) => p.name === n.punct)?.kind : null, incert: false });
    rez.noapte[k] = (rez.noapte[k] ?? 0) + 1;
  }
  rez.masini.push(r);
  // golurile care se încheie în septembrie
  for (const g of m.goluri) {
    if (g.pana < '2026-08-31T21' || g.pana >= '2026-09-29T21') continue;
    const c = m.curse.find((x) => x.id === g.dupa); const deLa = c?.descarcari.at(-1)?.nume ?? (c?.capatProvizoriu ? `capăt provizoriu ${c.marfa}` : null);
    const mat = deLa ? SK.goale[deLa]?.[g.spre] : null; const ideal = mat ? Math.min(...Object.values(mat)) : null;
    const inG = m.opriri.filter((o) => o.i0 >= g.iStart && o.i1 <= g.iEnd);
    rez.goluri.push({ placa: m.placa, marfa: c?.marfa, de: deLa, spre: g.spre, t0: g.de, t1: g.pana, ore: Math.round((Date.parse(g.pana) - Date.parse(g.de)) / 3600000), km: g.kmBrut, ideal, plus: ideal ? Math.round(g.kmBrut - ideal) : null,
      a: g.a, b: g.b, bucati: g.bucati,
      opriri: inG.map((o) => ({ loc: o.punct ?? numeLoc(o), clasa: clasa(o), ore: +(o.min / 60).toFixed(1), lat: o.lat, lon: o.lon, sosire: o.sosire, plecare: o.plecare })) });
  }
}
for (const k of Object.keys(rez.clase)) rez.clase[k] = h(rez.clase[k]);
for (const k of Object.keys(rez.fazeClase)) rez.fazeClase[k] = h(rez.fazeClase[k]);
fs.writeFileSync(S + 'analiza.json', JSON.stringify(rez, null, 1));
console.log('== mașini'); for (const r of rez.masini) console.log(r.placa, r.km, 'km', r.zile, 'zile', r.curse, 'curse', r.motiv ?? '', JSON.stringify(r.ore), '| clustere ≥8h:', r.clustere.map((c) => `${c.loc} ${c.n}× ${c.ore}h (${c.briceniKm} km de Briceni)`).join('; '));
console.log('== ore pe clase (flota activă)', JSON.stringify(Object.entries(rez.clase).sort((a, b) => b[1] - a[1])));
console.log('== faze×clase'); for (const [k, v] of Object.entries(rez.fazeClase).sort((a, b) => b[1] - a[1])) console.log(' ', v, 'h', k);
console.log('== 03:00', JSON.stringify(rez.noapte));
console.log('== goluri încheiate în sept.');
for (const g of rez.goluri) console.log(g.placa, g.marfa, `${g.de} → ${g.spre}`, g.ore, 'h', g.km, 'km, ideal', g.ideal, 'plus', g.plus, '|', g.opriri.map((o) => `${o.loc}[${o.clasa}] ${o.ore}h`).join('; '), '| bucăți', g.bucati.join('/'));
