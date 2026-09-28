// ION-123 (28.09.2026): adaugă în rândul săptămânii (date.ziIdeala) economia față de «ziua ideală» a fiecărei mașini, din <dosar>/ziua-ideala.json.
// Verdictul dezbaterii Claude + Codex (docs/plans/2026-09-28-drax-ziua-ideala, Codex r3 10/10) pe cererea lui Ion: ideal = cursele cu oameni și munca (km GPS)
// + drumul direct între curse (mediana GPS observată, altfel Valhalla × 1,05) + noaptea la capăt; economia = km făcuți − ideal, pe cauze.
// Aditiv: eșecul NU atinge rândul; o probă picată = nu scrie.   node --env-file=/root/lde-worker/.env scrie-ziua-ideala.mjs <dosar> [--write]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const DIR = process.argv[2], WRITE = process.argv.includes('--write');
if (!DIR || !existsSync(`${DIR}/analiza.json`) || !existsSync(`${DIR}/ziua-ideala.json`)) { console.error('scrie-ziua-ideala.mjs <dosar> [--write]'); process.exit(2); }
const A = JSON.parse(readFileSync(`${DIR}/analiza.json`, 'utf8')), Z = JSON.parse(readFileSync(`${DIR}/ziua-ideala.json`, 'utf8'));
const P = Z.probe, rele = ['bilantGps', 'economiePesteGol', 'idealSubObligatorii', 'cauzaNegativa', 'acasaNeUnita', 'cauzeDiferitDeEconomie', 'obsInCursa', 'munca0'].filter((k) => P[k]?.n);
if (rele.length) { console.error(`probele zilei ideale picate: ${rele.join(', ')} — date.ziIdeala NU se scrie`); process.exit(1); }
const zile = {}; for (const r of Z.randuri.filter((x) => x.esant || x.sep)) (zile[r.m] ??= []).push({
  z: r.z, gps: r.gps, ideal: r.ideal, economie: r.economie, cuOameni: r.cuOameni, obligatorii: r.obligatorii, legaturi: r.legaturi, noapteIdeala: r.noapteIdeala,
  cauze: r.cauze, separat: r.separat, steaguri: r.steaguri ?? [],
  intervale: (r.intervale ?? []).filter((i) => i.km >= 0.5).map((i) => ({ ora: i.ora, km: i.km, obl: i.obl, munca: i.munca, leg: i.leg, src: i.src, ocol: i.ocol, economie: i.economie, intreUzine: i.intreUzine ?? null })),
  jumatati: (r.jumatati ?? []).map((j) => ({ part: j.part, noapte: j.noapte, cat: j.cat, real: j.real, economie: j.economie })) });
// ION-124 (provizoriu, Ion 28.09: «dacă are oameni din Sîngerei, Copăceni nicicum nu poate fi optimizat»): orașele din actul rutei cu angajați, pe care
// §4.1 / §5.1 le scot încă din linie — mașina e marcată «de verificat: linia trece prin oraș» până la regula nouă
const ORASE_51 = ['Donduseni', 'Cupcini', 'Riscani', 'Costesti', 'Glodeni', 'Drochia', 'Floresti', 'Marculesti', 'Biruinta', 'Singerei', 'Falesti', 'Ghindesti'];
const normO = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const orasePeRuta = (() => { try { const N = JSON.parse(readFileSync(`${DIR}/nomenclator.json`, 'utf8')); const o = {};
  for (const r of Object.values(N.rute ?? {})) { const t = Object.entries(r.ang ?? {}).filter(([s, a]) => ORASE_51.some((x) => normO(x) === normO(s)) && ((a.D || 0) + (a.E || 0) + (a.Z || 0)) > 0)
    .map(([s, a]) => `${s} ${(a.D || 0) + (a.E || 0) + (a.Z || 0)}`); if (t.length) o[r.id] = t; } return o; } catch { return {}; } })();
// ION-124 (după verdictul Codex r6 10/10): marcajul provizoriu «de verificat» e înlocuit cu cursele PRELUNGITE prin oraș (economie-zile.json, seg.prelungit)
const ZZ124 = (() => { try { return JSON.parse(readFileSync(`${DIR}/economie-zile.json`, 'utf8')); } catch { return { zile: [] }; } })();
const orasPeLinie = (m) => { const c = {}; for (const d of ZZ124.zile.filter((x) => x.m === m)) for (const q of d.seg) if (q.prelungit) c[q.prelungit.oras] = (c[q.prelungit.oras] ?? 0) + 1;
  const NUME124 = { singerei: 'Sîngerei', riscani: 'Rîșcani', falesti: 'Fălești', donduseni: 'Dondușeni', costesti: 'Costești', floresti: 'Florești', marculesti: 'Mărculești', biruinta: 'Biruința', ghindesti: 'Ghindești', cupcini: 'Cupcini', glodeni: 'Glodeni', drochia: 'Drochia' };
  return Object.entries(c).map(([o, n]) => `${NUME124[o.toLowerCase()] ?? o} ${n}`); };
A.ziIdeala = {
  versiune: 'ION-123 · 28.09.2026 · dezbaterea Claude + Codex (r3 10/10)', rulat: Z.rulat,
  flota: { zile: Z.flota.zile, gps: Z.flota.gps, ideal: Z.flota.ideal, economie: Z.flota.economie, extrapolat: Z.flota.extrapolat, cauze: Z.flota.cauze, separat: Z.flota.separat },
  separatMasini: { masini: Z.separatMasini.masini, economie: Z.separatMasini.economie, motiv: 'posibilă cursă nedetectată (386PKP cursa de prânz, 293QVT golul tur → retur)' },
  legaturi: { perechi: Z.observatii.perechi, gps: Z.observatii.perechiGps, valhalla: Z.observatii.perechiValhalla },
  prag: Z.parametri.PRAG, zileSubMinus5: P.ziSubMinus5?.lista ?? [],
  masini: Z.masini.map((x) => ({ m: x.m, orasPeLinie: orasPeLinie(x.m), separat: x.separat, zileLV: x.zileLV, zileMasurate: x.zileMasurate, kmSapt: x.kmSapt12_2, peZi: x.peZi, pestePrag: x.pestePrag, cauze: x.cauze, separatKm: x.separatKm, zile: zile[x.m] ?? [] }))
    .sort((a, b) => (b.kmSapt ?? 0) - (a.kmSapt ?? 0)),
};
writeFileSync(`${DIR}/analiza.json`, JSON.stringify(A));
console.log(`ziIdeala: economie ${Z.flota.economie} măsurat · ${Z.flota.extrapolat} extrapolat · noapte ${Z.flota.cauze.noapte} · acasă ${Z.flota.cauze.acasa} · drum lung ${Z.flota.cauze.drumLung} · mai scurt ${Z.flota.cauze.drumMaiScurt} · peste prag ${A.ziIdeala.masini.filter((x) => x.pestePrag).length} · ${(JSON.stringify(A.ziIdeala).length / 1024).toFixed(0)} KB`);
if (!WRITE) { console.log('(fără --write, nimic scris în bază)'); process.exit(0); }
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SB || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY lipsesc'); process.exit(1); }
const r = await fetch(`${SB}/rest/v1/lde_analiza_reguli?uzina=eq.DRAXELMAIER&saptamina=eq.${A.saptamina}`, { method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ date: A }) });
if (!r.ok) { console.error(`lde_analiza_reguli: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
if ((await r.json()).length !== 1) { console.error('PATCH nu a atins exact un rând'); process.exit(1); }
console.log(`scris: date.ziIdeala în lde_analiza_reguli DRAXELMAIER ${A.saptamina}`);
