// ION-143 (Codex r1 C1): publicarea ATOMICĂ a parcării propuse LEAR — date.parcare în rândul săptămânii (lde_analiza_reguli) și harta
// (lde_harta_zi) într-o singură tranzacție, prin funcția lde_publica_lear_parcare (migr. 441). Ori se scriu amândouă, ori nimic: harta de
// dinainte rămâne întreagă dacă ceva pică. Probele (lear-parcare-valid.mjs + forma hărții) se fac ÎNAINTE de orice apel.
//   node --env-file=/root/lde-worker/.env publica-lear-parcare.mjs <parcare.json> <harta.json> [--write]
import { readFileSync, existsSync } from 'node:fs';
import { valideazaParcareLear, valideazaHartaLear } from './lear-parcare-valid.mjs';
const [PF, HF] = process.argv.slice(2), WRITE = process.argv.includes('--write');
if (!PF || !HF || !existsSync(PF) || !existsSync(HF)) { console.error('publica-lear-parcare.mjs <parcare.json> <harta.json> [--write]'); process.exit(2); }
const PK = JSON.parse(readFileSync(PF, 'utf8')), H = JSON.parse(readFileSync(HF, 'utf8'));
const rele = [...valideazaParcareLear(PK), ...valideazaHartaLear(H, PK)];
if (rele.length) { console.error(`probele au picat: ${rele.slice(0, 10).join('; ')} — NU se publică nimic`); process.exit(1); }
const r1 = (x) => Math.round(x * 10) / 10;
// forma blocului din panou (ParcareDrax.tsx); la LEAR toate zilele sunt măsurate (măsurat = pe săptămână), fără maxim teoretic.
// Programul pe drum (Codex r1 C2): fiecare drum de parcare cu locul lui (P1 / P2) sau «rămâne cum e» (loc 0) și unde stă acum.
const flota = { ...PK.flota, economieMasurata: PK.flota.economieSapt, idealSapt: 0, pestePrag: PK.masini.filter((x) => (x.economieSapt ?? 0) >= 100).length };
const parcare = { versiune: 'ION-143 · 29.09.2026', rulat: PK.rulat, parametri: PK.parametri, flota,
  masini: PK.masini.map((x) => ({ m: x.m, casa: x.casa ?? null, rute: x.rute ?? [], locuri: x.locuri, motivFara: x.motivFara ?? null, castigAlDoilea: x.castigAlDoilea ?? null,
    unLoc: x.unLoc ?? null, doiLocuri: x.doiLocuri ?? null, zileMasurate: (x.zile ?? []).length, zileLV: (x.zile ?? []).length, real: x.real ?? 0, propus: x.propus ?? 0,
    economieMasurata: x.economieSapt ?? 0, economieSapt: x.economieSapt ?? 0, idealSapt: null,
    zile: (x.zile ?? []).map((d) => ({ z: d.z, masurata: true, motiv: null, real: d.real, propus: d.propus, economie: d.economie, drumuri: d.drumuri })),
    drumuri: x.locuri.length ? (x.legi ?? []).map((l) => ({ z: l.z, ora: l.ora, de: l.aN, spre: l.bN, acum: l.acum?.n ?? null, loc: l.loc, real: l.real, propus: l.km })) : [] })) };
console.log(`${PK.nume} ${PK.saptamina}: ${flota.masini} mașini · de tăiat ${flota.economieSapt} km/săpt. · hartă ${H.randuri.length} rânduri`);
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc'); process.exit(1); }
const corp = JSON.stringify({ p_uzina_id: PK.uzina, p_uzina_nume: PK.nume, p_saptamina: PK.saptamina, p_parcare: parcare, p_harta: H.randuri });
// Limita efectivă: statement_timeout 8 s al rolului authenticator (PostgREST; service_role n-are altul). Măsurat 29.09: Ungheni 1,55 MB în ≈ 4 s,
// Florești 0,55 MB în ≈ 2,4 s (cap la cap, cu urcarea). Cererea crește doar cu mașini × zile; peste 2,5 MB (≈ 6,5 s) se refuză înainte de apel.
// Dacă totuși trece de 8 s, Postgres anulează tranzacția (57014): nimic schimbat, raportul și harta de dinainte rămân, lanțul iese ≠ 0.
const MAX_MB = 2.5;
const mb = Buffer.byteLength(corp, 'utf8') / 1048576;
if (mb > MAX_MB) { console.error(`cererea are ${mb.toFixed(2)} MB > ${MAX_MB} MB — NU se publică`); process.exit(1); }
const t0 = Date.now();
const r = await fetch(`${SB}/rest/v1/rpc/lde_publica_lear_parcare`, { method: 'POST', signal: AbortSignal.timeout(120000),
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: corp });
if (!r.ok) { const txt = await r.text(); console.error(`lde_publica_lear_parcare: HTTP ${r.status} ${txt.slice(0, 400)}${txt.includes("57014") ? " — a depășit statement_timeout (8 s)" : ""} — nimic schimbat (tranzacția s-a anulat)`); process.exit(1); }
const n = await r.json();
if (n !== H.randuri.length) { console.error(`funcția a scris ${n} rânduri de hartă, așteptat ${H.randuri.length}`); process.exit(1); }
console.log(`publicat: date.parcare + ${n} rânduri lde_harta_zi · ${PK.uzina} ${PK.saptamina} · ${mb.toFixed(2)} MB în ${Date.now() - t0} ms`);
