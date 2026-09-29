// datele paginii: pe fiecare camion, august 2026 — posterul față de km Wialon, km fantomă, plinul pentru septembrie, foile suspecte
import { readFileSync, writeFileSync } from 'node:fs';
const A = JSON.parse(readFileSync('analiza.json', 'utf8')), W = JSON.parse(readFileSync('km-wialon.json', 'utf8'));
// de pe poster (august 2026): Luna, Din iunie, Normă (* = norma Clava)
const P = { RWN169: [31.1, 31.8, '31,8'], LJN075: [null, null, '36,0*'], KWX620: [36.4, 37.3, '37,3'], MOW214: [37.4, 35.2, '35,2'], QDQ395: [63.0, 41.7, '39,0*'], IIC230: [57.9, 40.2, '39,0*'],
  LJN080: [40.3, 39.5, '34,0*'], LJN076: [44.3, 39.0, '39,0'], ANT347: [35.7, 35.2, '35,2'], HMK135: [33.8, 39.6, '35,0*'], IIC263: [32.1, 37.6, '37,6'], HMK139: [29.2, 35.0, '35,0'],
  KYK692: [88.3, 91.0, '39,0*'], ANT344: [34.0, 32.2, '32,2'], QDQ364: [61.6, 62.6, '39,0*'], QDQ419: [79.9, null, '40,0*'], RWN193: [34.5, 33.1, '41,0*'], QDQ357: [null, null, '40,0*'],
  GHT553: [null, null, '—'], KYK742: [43.4, 19.9, '38,0*'], KYK784: [110.7, null, '40,0*'], QDQ714: [null, null, '40,0*'], YJX724: [65.9, null, '39,0*'], BNQ085: [null, null, '35,0*'], BNQ069: [null, null, '39,0*'] };
const SUSPECT = { KYK692: { l: 671, text: 'foaia din 25.08 (Lavric Dorian): 671 L, km 1 — mai mult decât încape în rezervor (plin obișnuit 657 L) după doar ~1.100 km de la plinul de 600 L din 20.08' },
  QDQ364: { l: 635, text: 'foaia din 25.08 (Platon Valeriu): 635 L, km 1 — mai mult decât încape (plin obișnuit 604 L) după ~840 km de la plinul de 600 L din 11.08' } };
const r1 = (x) => Math.round(x * 10) / 10;
const rows = A.map((x) => { const w = W[x.m] ?? {}; let kw = 0; for (const [z, v] of Object.entries(w)) if (z >= '2026-08-01' && z <= '2026-08-31' && v && v !== 'e7') kw += v.km;
  const fara = Object.entries(w).filter(([z, v]) => z >= '2026-08-01' && z <= '2026-08-31' && v === 'e7').length;
  const s = SUSPECT[x.m]?.l ?? 0, net = x.litri - x.lSept - s;
  const [luna, iunie, norma] = P[x.m] ?? [null, null, '—'];
  const nn = parseFloat(String(norma).replace(',', '.')) || null, cor = kw >= 1000 ? r1(net / kw * 100) : null;
  return { m: x.m, litri: x.litri, benzol: x.benzol, foaie: x.foaie, kmTabel: x.kmTot, kmFantoma: x.kmCarpit, kmWialon: Math.round(kw), zileFaraWialon: fara,
    lSept: x.lSept, suspect: s, net: Math.round(net), luna, iunie, norma, l100: cor, abat: cor && nn ? Math.round((cor / nn - 1) * 100) : null,
    intervale: x.intervale.filter((i) => i.pana >= '2026-08-01' && i.de <= '2026-08-31'), ev: x.ev.map((e) => ({ z: e.z, ora: e.ora, src: e.src, l: e.l, km: e.kmDePrec, sofer: e.sofer })) }; });
writeFileSync('pagina-date.json', JSON.stringify(rows));
for (const r of rows) console.log(r.m.padEnd(7), r.litri, 'km tabel', r.kmTabel, 'fantomă', r.kmFantoma, 'Wialon', r.kmWialon, 'sept', r.lSept, 'susp', r.suspect, '→', r.l100, '(poster', r.luna, 'normă', r.norma, 'abat', r.abat, ')');
