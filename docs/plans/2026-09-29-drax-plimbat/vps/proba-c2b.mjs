// Codex r5: parcul — aceeași linie (producătorul nu dă parc) / staționare efectivă / zona comună parc–poartă
import fs from 'fs';
const src = fs.readFileSync('/root/lde-worker/drax/cod/saptamanal/ziua-ideala-sim132.mjs', 'utf8');
const C = await import('/root/lde-worker/drax/cod/economie/comun.mjs'); const { hav, PORTI, PARC, poarta } = C;
const grab = (name) => { const i = src.indexOf(name); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
const inZonaProd = (p) => hav(p, PARC) <= 3 || PORTI.some((q) => hav(p, q) <= 3);
const mo = new Function('hav', 'PORTI', 'PARC', 'poarta', 'inZonaProd', `${grab('function muchiiObligatorii')}; return muchiiObligatorii;`)(hav, PORTI, PARC, poarta, inZonaProd);
const lin = (a, b, n, t0, dt) => Array.from({ length: n }, (_, k) => ({ lat: a.lat + (b.lat - a.lat) * k / (n - 1), lon: a.lon + (b.lon - a.lon) * k / (n - 1), t: t0 + k * dt }));
const km = (Q, o) => { let x = 0; for (let k = 1; k < Q.length; k++) if (o[k]) x += hav(Q[k - 1], Q[k]); return +x.toFixed(2); };
const departe = { lat: PARC.lat - 0.02, lon: PARC.lon - 0.02 };   // în zonă, la ~2,7 km de parc, departe de porți
const stat = (p, t, min) => [{ ...p, t, st: 1, t1: t + min * 60e3 }, { ...p, t: t + min * 60e3, st: 2 }];
const Q = [...lin(departe, PARC, 8, 0, 30e3), ...stat(PARC, 240e3, 10), ...lin(PARC, departe, 8, 900e3, 30e3)];
console.log('P4 staționare 10 min la parc, linii diferite (cuParc):', km(Q, mo(Q, true).obP) > 0 ? 'parc marcat ok' : 'GREȘIT');
console.log('P5 aceeași linie (producătorul fără parc → cuParc=false):', km(Q, mo(Q, false).obP) === 0 ? 'nimic ok' : 'GREȘIT');
const Q6 = [...lin(departe, PARC, 8, 0, 30e3), ...lin(PARC, PARC, 12, 240e3, 30e3), ...lin(PARC, departe, 8, 600e3, 30e3)];   // mers încet 6 min în rază, fără punct de staționare
console.log('P6 fără staționare efectivă:', km(Q6, mo(Q6, true).obP) === 0 ? 'nimic ok' : 'GREȘIT');
const V = PORTI.find((g) => g.n === "VEST"); const inPoarta = { lat: (V.lat + PARC.lat) / 2, lon: (V.lon + PARC.lon) / 2 };
console.log('P7 staționare în zona comună parc–poartă VEST:', 'la parc', hav(inPoarta, PARC).toFixed(2), 'km, la poartă', hav(inPoarta, V).toFixed(2), 'km');
const Q7 = [...lin(departe, inPoarta, 8, 0, 30e3), ...stat(inPoarta, 240e3, 10), ...lin(inPoarta, departe, 8, 900e3, 30e3)];
console.log('   →', km(Q7, mo(Q7, true).obP) === 0 ? 'nimic ok' : 'GREȘIT');
