// Analiza consumului camioanelor, august 2026: pe fiecare mașină litri, km (reali / cârpiți), bilanțul rezervorului, alimentările care nu încap.
import { readFileSync, writeFileSync } from 'node:fs';
const D = JSON.parse(readFileSync('date.json', 'utf8')), PL = JSON.parse(readFileSync('plin.json', 'utf8'));
const r1 = (x) => Math.round(x * 10) / 10, r0 = Math.round;
const zi = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(new Date(t));
const ora = (t) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const AUG = (z) => z >= '2026-08-01' && z <= '2026-08-31';
const norme = new Map(D.norme.map((n) => [n.vehicle_id, Number(n.measured_consumption_l_per_100km_loaded ?? n.measured_consumption_l_per_100km ?? 0) || null]));
const plin = new Map(PL.map((p) => [p.vehicle_id, p]));
const out = [];
for (const v of D.veh) {
  // evenimentele de alimentare: benzol (lipite la ≤ 90 min) + rândurile foii de parcurs (fără oră: 12:00)
  const ev = [];
  for (const a of D.alim.filter((x) => x.vehicle_id === v.id).sort((a, b) => a.alimentat_at.localeCompare(b.alimentat_at))) {
    const t = Date.parse(a.alimentat_at), u = ev.at(-1);
    if (u && u.src === 'benzol' && t - u.t1 <= 90 * 60e3) { u.l += Number(a.litri); u.t1 = t; u.n++; } else ev.push({ t, t1: t, z: zi(t), ora: ora(t), l: Number(a.litri), src: 'benzol', n: 1 });
  }
  for (const f of D.foaie.filter((x) => x.vehicle_id === v.id)) ev.push({ t: Date.parse(`${f.zi}T09:00:00Z`), z: f.zi, ora: '—', l: Number(f.litri), src: 'foaie', n: 1, kmFoaie: Number(f.km_total), sofer: f.sofer });
  ev.sort((a, b) => a.t - b.t);
  // km pe zi: reali = total − cârpiți
  const G = new Map(D.gps.filter((g) => g.vehicle_id === v.id).map((g) => [g.date, { tot: Number(g.km_total) || 0, pat: Number(g.km_patched) || 0 }]));
  const kmReal = (a, b) => { let s = 0; for (const [z, g] of G) if (z > a && z < b) s += Math.max(0, g.tot - g.pat); return s; };   // zile strict între
  const kmZi = (z) => { const g = G.get(z); return g ? Math.max(0, g.tot - g.pat) : 0; };
  const p = plin.get(v.id), normaProprie = p && p.intervale >= 3 ? Number(p.consum) : null, norma = normaProprie ?? norme.get(v.id) ?? 36;
  const cap = Math.max(...ev.map((e) => e.l), 0), plinTipic = p ? Number(p.plin_tipic) : null;
  // bilanțul rezervorului pe zile: B += alimentări, B −= km reali × norma; B peste capacitate = litri care n-au încăput
  const zile = []; for (let d = new Date('2026-06-01T12:00:00Z'); d <= new Date('2026-09-10T12:00:00Z'); d = new Date(+d + 864e5)) zile.push(d.toISOString().slice(0, 10));
  let B = 0; const peste = [], faraCombustibil = []; let pornit = false;
  const CAP = Math.max(cap, plinTipic ?? 0) * 1.1;
  for (const z of zile) {
    const e = ev.filter((x) => x.z === z); const lz = e.reduce((s, x) => s + x.l, 0);
    const cons = kmZi(z) * norma / 100;
    if (!G.has(z)) { pornit = false; B = 0; continue; }
    if (lz > 0 && !pornit) { pornit = true; B = Math.min(lz, CAP); continue; }
    if (!pornit) continue;
    B += lz - cons;
    if (B > CAP) { peste.push({ z, l: r0(B - CAP), ev: e.map((x) => `${x.src} ${r0(x.l)} L`).join(' + ') }); B = CAP; }
    if (B < -80) { faraCombustibil.push({ z, l: r0(-B) }); B = 0; }
  }
  // evenimente din august, cu km de la alimentarea precedentă
  const evAug = ev.filter((e) => AUG(e.z)).map((e) => { const i = ev.indexOf(e), pr = ev[i - 1];
    const kmMin = pr ? kmReal(pr.z, e.z) : null, kmMax = pr ? kmMin + kmZi(pr.z) + kmZi(e.z) : null;
    let lipsa = 0; if (pr) for (const z of zile) if (z >= pr.z && z <= e.z && !G.has(z)) lipsa++;
    const asteptat = kmMax != null && !lipsa ? kmMax * norma / 100 : null;
    return { z: e.z, ora: e.ora, src: e.src, l: r0(e.l), n: e.n, kmDePrec: kmMin == null ? null : [r0(kmMin), r0(kmMax)], deLa: pr?.z ?? null, asteptatMax: asteptat == null ? null : r0(asteptat),
      preaMult: asteptat != null && e.l > asteptat * 1.25 + 80 && e.l >= 200, zileFaraGps: lipsa, excesMin: asteptat != null ? r0(e.l - asteptat * 1.25) : null, kmFoaie: e.kmFoaie ?? null, sofer: e.sofer ?? null }; });
  const bz = ev.filter((e) => e.src === 'benzol'), intervale = [];
  for (let i = 1; i < bz.length; i++) { const a = bz[i - 1], b = bz[i]; if (b.z < '2026-07-25' || a.z > '2026-08-31') continue;
    const drum = ev.filter((e) => e.src === 'foaie' && e.z >= a.z && e.z < b.z), l = drum.reduce((x, e) => x + e.l, 0) + b.l;
    let km = 0, lipsa = 0, carp = 0; for (const z of zile) if (z >= a.z && z < b.z) { const g = G.get(z); if (!g) lipsa++; else km += Math.max(0, g.tot - g.pat); if (g) carp += Math.min(g.pat, g.tot); }
    intervale.push({ de: a.z, pana: b.z, l: r0(l), drum: drum.map((e) => r0(e.l)), km: r0(km), carpit: r0(carp), zileFaraGps: lipsa, l100: km >= 300 && !lipsa ? r1(l / km * 100) : null, l100Brut: km >= 300 ? r1(l / km * 100) : null }); }
  const gA = [...G].filter(([z]) => AUG(z)), kmTot = gA.reduce((s, [, g]) => s + g.tot, 0), kmPat = gA.reduce((s, [, g]) => s + Math.min(g.pat, g.tot), 0);
  const zileReale = gA.filter(([, g]) => g.tot - g.pat >= 50).length, zileDoarCarpite = gA.filter(([, g]) => g.tot > 0 && g.tot - g.pat < 5).length;
  const lAug = ev.filter((e) => AUG(e.z)).reduce((s, e) => s + e.l, 0);
  // litrii din ultimele 2 zile ale lunii care nu se ard în august (plinul pentru cursa din septembrie)
  const finalLuna = ev.filter((e) => e.z >= '2026-08-30' && e.z <= '2026-08-31'), lFinal = finalLuna.reduce((s, e) => s + e.l, 0);
  const kmDupaFinal = finalLuna.length ? zile.filter((z) => z >= finalLuna[0].z && z <= '2026-08-31').reduce((s, z) => s + kmZi(z), 0) : 0;
  const lSept = r0(Math.max(0, lFinal - kmDupaFinal * norma / 100));
  if (!lAug && !kmTot) continue;
  const kmR = kmTot - kmPat;
  out.push({ m: v.plate_number, activ: v.active, litri: r0(lAug), benzol: r0(ev.filter((e) => AUG(e.z) && e.src === 'benzol').reduce((s, e) => s + e.l, 0)), foaie: r0(ev.filter((e) => AUG(e.z) && e.src === 'foaie').reduce((s, e) => s + e.l, 0)),
    kmTot: r0(kmTot), kmCarpit: r0(kmPat), kmReal: r0(kmR), zileGps: gA.length, zileReale, zileDoarCarpite, primaZiGps: gA.length ? gA.map(([z]) => z).sort()[0] : null,
    l100Poster: kmTot >= 1000 ? r1(lAug / kmTot * 100) : null, lSept, l100Corectat: kmR >= 1000 ? r1((lAug - lSept) / kmR * 100) : null,
    normaProprie, norma: r1(norma), plinIntervale: p?.intervale ?? 0, capacitate: r0(cap), plinTipic: plinTipic == null ? null : r0(plinTipic),
    peste: peste.filter((x) => AUG(x.z)), intervale, faraCombustibil: faraCombustibil.filter((x) => AUG(x.z)), ev: evAug });
}
out.sort((a, b) => b.litri - a.litri);
writeFileSync('analiza.json', JSON.stringify(out, null, 1));
for (const x of out) console.log(`\n${x.m.padEnd(7)} L ${String(x.litri).padStart(5)} (b ${x.benzol}/f ${x.foaie}) km ${String(x.kmTot).padStart(5)} cârpit ${String(x.kmCarpit).padStart(4)} real ${String(x.kmReal).padStart(5)} zileGPS ${x.zileGps} reale ${x.zileReale} doarCârp ${x.zileDoarCarpite} · poster ${x.l100Poster} → corect ${x.l100Corectat} (sept ${x.lSept} L) · norma ${x.norma}${x.normaProprie ? ' proprie' : ''} · peste rezervor ${x.peste.reduce((s, p) => s + p.l, 0)} L ${x.peste.map((p) => p.z.slice(5) + ':' + p.l).join(',')} · fără combustibil ${x.faraCombustibil.reduce((s, p) => s + p.l, 0)} \n     plin→plin: ${x.intervale.map((i) => `${i.de.slice(5)}→${i.pana.slice(5)} ${i.l}L/${i.km}km=${i.l100 ?? '—'}${i.zileFaraGps ? ` (fără GPS ${i.zileFaraGps}z)` : ''}`).join(' · ')}`);
