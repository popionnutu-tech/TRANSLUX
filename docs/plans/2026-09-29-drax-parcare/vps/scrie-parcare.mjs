// ION-136 (29.09.2026): adaugă în rândul săptămânii (date.parcare) propunerea de parcare a fiecărei mașini (1–2 locuri), din <dosar>/parcare.json.
// Ion: «hai maximele teoretice să le scoatem, ele nu pot fi realizate în realitate … poți oferi 2 locuri propuneri». Aditiv: eșecul NU atinge rândul;
// o probă picată = nu scrie.   node --env-file=/root/lde-worker/.env scrie-parcare.mjs <dosar> [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { valideazaParcare } from './parcare-valid.mjs';
const DIR = process.argv[2], WRITE = process.argv.includes('--write');
if (!DIR || !existsSync(`${DIR}/analiza.json`) || !existsSync(`${DIR}/parcare.json`)) { console.error('scrie-parcare.mjs <dosar> [--write]'); process.exit(2); }
const A = JSON.parse(readFileSync(`${DIR}/analiza.json`, 'utf8')), PK = JSON.parse(readFileSync(`${DIR}/parcare.json`, 'utf8'));
// probele comune (parcare-valid.mjs, aceleași ca la hartă): peste ideal, nefinit, două locuri neeligibile, nopți fără ancore
const rele = valideazaParcare(PK);
if (rele.length) { console.error(`probele parcării picate: ${rele.join('; ')} — date.parcare NU se scrie`); process.exit(1); }
A.parcare = {
  versiune: 'ION-136 · 29.09.2026', rulat: PK.rulat, parametri: PK.parametri, flota: PK.flota,
  masini: PK.masini.map((x) => ({ m: x.m, locuri: x.locuri, motivFara: x.motivFara ?? null, castigAlDoilea: x.castigAlDoilea ?? null, unLoc: x.unLoc, doiLocuri: x.doiLocuri, zileMasurate: x.zileMasurate, zileLV: x.zileLV,
    real: x.real, propus: x.propus, economieMasurata: x.economieMasurata, economieSapt: x.economieSapt, idealSapt: x.idealSapt,
    zile: x.zile.map((d) => ({ z: d.z, masurata: d.masurata, motiv: d.motiv, real: d.real, propus: d.propus, economie: d.economie })) })),
};
writeFileSync(`${DIR}/analiza.json`, JSON.stringify(A));
console.log(`parcare: ${PK.flota.masini} mașini · de tăiat ${PK.flota.economieSapt} km/săpt. (${PK.flota.economieMasurata} măsurat; ideal ${PK.flota.idealSapt}) · două locuri ${PK.flota.doiLocuri} · peste 100 km ${PK.flota.pestePrag}`);
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc'); process.exit(1); }
const r = await fetch(`${SB}/rest/v1/lde_analiza_reguli?uzina=eq.DRAXELMAIER&saptamina=eq.${A.saptamina}`, { method: 'PATCH',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ date: A }) });
if (!r.ok) { console.error(`lde_analiza_reguli: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
if ((await r.json()).length !== 1) { console.error('PATCH nu a atins exact un rând'); process.exit(1); }
console.log(`scris: date.parcare în lde_analiza_reguli DRAXELMAIER ${A.saptamina}`);
