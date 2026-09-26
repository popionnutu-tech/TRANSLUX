// Scheletul ideal v2 (ION-71 → F3 E.1), pasul 1c NOU — cererea lui Ion, 26.09: «scheletul ideal îl faci corect?».
// Același autobuz cu DOUĂ dispozitive pe aceeași plăcuță: fix-350.mjs:6-9 redenumește «350KAJ#2284» → «350KAJ» fără să scoată cursele
// dublate, iar fix-dubluri.mjs:16-18 compară doar plăci DIFERITE — după fix-350 dublura nu mai e văzută.
// Aici, pe ACEEAȘI plăcuță, aceeași zi, |Δt0| ≤ 3 min:
//   · același sens (spreP/dinP) → rămâne cursa cu urma mai bogată (mai multe apropieri de ținte + opriri — dispozitivul care n-a pierdut
//     puncte), la egalitate cea mai lungă; ziua e «coerentă» dacă toate perechile ei aleg aceeași latură (urma bogată = cea lungă);
//   · sens diferit → NU se scoate automat: se listează (decizia rămâne la om).
// Raportul (dubluri-placa-raport.json) intră în compara-ideal.mjs (km păstrați față de mediana mașinii, steag > 15 %). Idempotent.
//   cd /root/lde-worker/drax/cod/ideal-v2 && node dubluri-placa.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = '../../date/curse-ideal.json', RAP = '../../date/dubluri-placa-raport.json';
const V = JSON.parse(readFileSync(OUT, 'utf8'));
const zi = (t) => new Date(new Date(t).getTime() + 3 * 3600000).toISOString().slice(0, 10);   // ca fix-dubluri.mjs:8
const sens = (c) => `${c.spreP ? 1 : 0}${c.dinP ? 1 : 0}`;
const bogatie = (c) => (c.apr?.length ?? 0) + (c.opr?.length ?? 0);
const grupe = new Map(); for (const c of V.curse) { const k = `${c.m}|${zi(c.t0)}`; (grupe.get(k) ?? grupe.set(k, []).get(k)).push(c); }
const scoase = [], altSens = [], zile = new Map();
// Execuție F3 (triaj r4, R3-3): DISPOZITIVUL se alege PE ZI, nu pe pereche. Plăcuța a pierdut id-ul dispozitivului la fix-350, dar
// dispozitivul care pierde puncte dă sistematic cursa mai scurtă ȘI mai săracă; deci pentru ziua (mașină, zi) se alege o latură
// (lungă / scurtă) după Σ bogăției pe fiecare latură (la egalitate: cea lungă) și se aplică tuturor perechilor zilei. Ziua e
// «incoerentă» dacă regula pe pereche (bogăția, apoi km) ar fi ales altfel la cel puțin o pereche — listată în raport.
for (const [k, L] of grupe) {
  L.sort((a, b) => new Date(a.t0) - new Date(b.t0));
  const perechi = [], folosit = new Set();
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j]; if (folosit.has(a) || folosit.has(b)) continue;
    if (Math.abs(new Date(a.t0) - new Date(b.t0)) > 180000) break;
    if (sens(a) !== sens(b)) { altSens.push({ m: a.m, zi: zi(a.t0), t0: [a.t0, b.t0], km: [a.km, b.km], sens: [sens(a), sens(b)] }); continue; }
    const lung = a.km >= b.km ? a : b, scurt = lung === a ? b : a;
    perechi.push({ lung, scurt }); folosit.add(a); folosit.add(b);
  }
  if (!perechi.length) continue;
  const sL = perechi.reduce((x, p) => x + bogatie(p.lung), 0), sS = perechi.reduce((x, p) => x + bogatie(p.scurt), 0);
  const latura = sS > sL ? 'scurtă' : 'lungă';
  for (const p of perechi) {
    const pastrat = latura === 'lungă' ? p.lung : p.scurt, scos = pastrat === p.lung ? p.scurt : p.lung;
    const pePereche = bogatie(p.lung) !== bogatie(p.scurt) ? (bogatie(p.lung) > bogatie(p.scurt) ? p.lung : p.scurt) : p.lung;
    scos._sterge = true;
    const z = zi(pastrat.t0);
    (zile.get(`${pastrat.m}|${z}`) ?? zile.set(`${pastrat.m}|${z}`, new Set()).get(`${pastrat.m}|${z}`)).add(pePereche === pastrat ? 'da' : 'nu');
    scoase.push({ m: pastrat.m, zi: z, t0: pastrat.t0, kmPastrat: pastrat.km, kmScos: scos.km, bogatie: [bogatie(pastrat), bogatie(scos)], latura, laturaZilei: { lunga: sL, scurta: sS } });
  }
}
V.curse = V.curse.filter((c) => !c._sterge);
writeFileSync(OUT, JSON.stringify(V));
const incoerente = [...zile].filter(([, s]) => s.has('nu')).map(([k]) => k);
writeFileSync(RAP, JSON.stringify({ scoase, altSens, zileIncoerente: incoerente }));
const peM = {}; for (const x of scoase) peM[`${x.m} ${x.zi}`] = (peM[`${x.m} ${x.zi}`] ?? 0) + 1;
console.log(`dubluri pe aceeași plăcuță scoase: ${scoase.length} · ${JSON.stringify(peM)} · păstrată latura scurtă: ${scoase.filter((x) => x.latura === 'scurtă').length} · zile incoerente: ${incoerente.join(', ') || '—'} · cu alt sens (listate, nescoase): ${altSens.length}`);
