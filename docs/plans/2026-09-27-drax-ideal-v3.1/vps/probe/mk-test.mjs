// proba cârpirii pe câteva curse (dosar de test în /tmp/ion99/test): goluri-curse fals = cursele date, prag de test
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const T = '/tmp/ion99/test'; mkdirSync(T, { recursive: true });
const D = JSON.parse(readFileSync('/root/lde-worker/drax/date/ideal-v3.1/curse-ideal.json', 'utf8'));
const pick = D.curse.filter(c => c.m === '345KAJ' && c.t0 >= '2026-09-14' && c.km > 50).slice(0, 12).concat(D.curse.filter(c => c.m === '917FTI' && c.t0 >= '2026-09-01' && c.km > 50).slice(0, 6));
writeFileSync(`${T}/curse-ideal.json`, JSON.stringify(D));
writeFileSync(`${T}/goluri-prag.json`, JSON.stringify({ T_DT: 60, T_D: 0.3, V_MAX: 130 }));
writeFileSync(`${T}/goluri-curse.json`, JSON.stringify(pick.map(c => ({ m: c.m, dev: c.dev, t0: new Date(c.t0).toISOString(), t1: new Date(c.t1).toISOString(), km: c.km, goluri: [] }))));
console.log('test:', pick.length, 'curse');
