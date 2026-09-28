// ION-123 r3 — compară rularea principală cu proba aliasului 880RNK (rulat pe VPS de proba-alias-880.sh)
import { readFileSync } from 'node:fs';
const a = JSON.parse(readFileSync('/tmp/ion123r3/ziua-ideala-v3.json')), b = JSON.parse(readFileSync(process.argv[2]));
const pick = (J) => ({ flota: J.flota, m880: J.masini.find((x) => x.m === '880RNK'), perechiGps: J.observatii.perechiGps, obs: J.observatii.observatiiTotal, obsAlias: J.observatii.observatiiDinAlias, inCursa: J.observatii.observatiiInCursa, probaAlias: J.observatii.probaAlias });
const A = pick(a), B = pick(b);
console.log(JSON.stringify(B.probaAlias));
console.log('identic flota', JSON.stringify(A.flota) === JSON.stringify(B.flota), 'identic 880RNK', JSON.stringify(A.m880) === JSON.stringify(B.m880), 'obs', A.obs, B.obs, 'obsAlias', A.obsAlias, B.obsAlias, 'inCursa', B.inCursa, 'perechiGps', A.perechiGps, B.perechiGps);
