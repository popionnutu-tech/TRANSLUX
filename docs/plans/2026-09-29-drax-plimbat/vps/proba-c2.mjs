// probe sintetice pentru muchiiObligatorii (Codex r4 C2): obligatoriu integral în faza A, apoi mișcare neobligatorie în zonă în mijloc
import fs from 'fs';
const src = fs.readFileSync('/root/lde-worker/drax/cod/saptamanal/ziua-ideala-sim132.mjs', 'utf8');
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs'); const { hav, PORTI, PARC, poarta } = C;
const grab = (name) => { const i = src.indexOf(name); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
const ZONA_PROD_KM = 3, inZonaProd = (p) => hav(p, PARC) <= ZONA_PROD_KM || PORTI.some((q) => hav(p, q) <= ZONA_PROD_KM);
const muchiiObligatorii = new Function('hav', 'PORTI', 'PARC', 'poarta', 'inZonaProd', `${grab('function muchiiObligatorii')}; return muchiiObligatorii;`)(hav, PORTI, PARC, poarta, inZonaProd);
const [V, E] = [PORTI.find((g) => g.n === 'VEST'), PORTI.find((g) => g.n === 'EST')];
const lin = (a, b, n, t0, dt) => Array.from({ length: n }, (_, k) => ({ lat: a.lat + (b.lat - a.lat) * k / (n - 1), lon: a.lon + (b.lon - a.lon) * k / (n - 1), t: t0 + k * dt }));
let t = 0; const Q = [];
const add = (arr) => { for (const p of arr) Q.push(p); t = Q.at(-1).t; };
add(lin(V, V, 4, 0, 30e3));                       // la VEST 1,5 min
add(lin(V, E, 12, t + 30e3, 30e3));               // VEST → EST
add(lin(E, E, 4, t + 30e3, 30e3));                // la EST 1,5 min
const afara = { lat: E.lat + 0.08, lon: E.lon }, inZ = { lat: E.lat + 0.02, lon: E.lon + 0.01 };
add(lin(E, afara, 10, t + 30e3, 30e3));           // iese din zonă (~9 km)
add(lin(afara, inZ, 10, t + 30e3, 30e3));         // revine în zonă, fără poartă
add(lin(inZ, { lat: 47.5, lon: 27.7 }, 15, t + 30e3, 60e3));   // spre capătul rural
const ob = muchiiObligatorii(Q, false).obIU; let kmOb = 0, idx = []; for (let k = 1; k < Q.length; k++) if (ob[k]) { kmOb += hav(Q[k - 1], Q[k]); idx.push(k); }
const ultimaOb = Math.max(...idx);
console.log('P1 obligatoriu VEST→EST:', kmOb.toFixed(2), 'km, muchii', idx[0], '…', ultimaOb, '· după EST nimic obligatoriu:', idx.every((k) => k <= 19) ? 'ok' : 'GREȘIT');
// P2: toată mișcarea în zonă ≤ 11 km → toată obligatorie
const Q2 = [...lin(V, E, 10, 0, 30e3)]; const o2 = muchiiObligatorii(Q2, false).obIU; console.log('P2 toată în zonă:', [...o2].slice(1).every((x) => x === 1) ? 'ok' : 'GREȘIT');
// P3: trecere în mers pe lângă porți (fără staționare, nu capete) → nimic
const Q3 = [...lin({ lat: V.lat - 0.05, lon: V.lon }, V, 8, 0, 20e3), ...lin(V, E, 8, 180e3, 20e3).slice(1), ...lin(E, { lat: E.lat + 0.05, lon: E.lon }, 8, 340e3, 20e3).slice(1)];
const o3 = muchiiObligatorii(Q3, false).obIU; console.log('P3 trecere fără oprire:', [...o3].every((x) => !x) ? 'ok' : 'GREȘIT');
// P8: toată în zonă, ≤ 11 km, dar fără nicio pereche poartă → poartă (fără staționare la porți) → nu e cursă între uzine
const Q8 = [...lin({ lat: V.lat - 0.01, lon: V.lon - 0.01 }, { lat: E.lat + 0.01, lon: E.lon + 0.01 }, 12, 0, 20e3)];
const o8 = muchiiObligatorii(Q8, false).obIU; console.log('P8 în zonă fără pereche de porți:', [...o8].every((x) => !x) ? 'nimic ok' : 'GREȘIT');
