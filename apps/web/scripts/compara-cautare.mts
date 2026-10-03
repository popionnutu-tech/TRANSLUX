// Compararea căutării «Mai târziu» înainte/după ION-205: cheamă searchTrips pe aceleași perechi
// și zile, pe commit-ul vechi și pe cel nou, și compară JSON-ul (ordinea curselor, prețuri, câmpuri).
// Rezultatul trebuie identic — doar ordinea în care se cer datele s-a schimbat.
//
// Rulare, din `apps/web` al arborelui măsurat (tsx citește tsconfig-ul din cwd pentru `@/…`):
//   node --env-file=.env --import tsx -C react-server scripts/compara-cautare.mts <ieșire.json> [cale/actions.ts]
//     -C react-server: `server-only` (din lib/bilete-api) aruncă în Node fără condiția asta.
//     Pentru «înainte»: `git show <commit-vechi>:"apps/web/src/app/(public)/actions.ts" > /tmp/x/actions-vechi.ts`
//     și calea aceea ca al doilea argument — tot din `apps/web` al arborelui curent (lib-urile și
//     @translux/db se iau de aici; ele nu s-au schimbat în ION-205).
//     Fiecare caz rulează de două ori (rece, apoi cald din cache); se măsoară cererile HTTP și
//     rundele secvențiale (o rundă = cereri care pornesc abia după ce altele s-au terminat).
//   node --import tsx scripts/compara-cautare.mts --compara <vechi.json> <nou.json>
//
// Ce NU face: nu scrie în bază — search_log e înlocuit cu un insert fals, iar unstable_cache
// primește o memorie în proces (în Next, cache-ul de date e al platformei). Rate-limit-ul nu
// intră (fără headers() nu există ip_hash), deci nicio căutare nu e blocată.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface Cerere { url: string; start: number; end: number }
interface Masura { cereri: number; cereriSupabase: number; runde: number; ms: number }
interface Caz {
  from: string;
  to: string;
  date: string;
  rezultat: unknown[];
  rece: Masura;
  cald: Masura & { identicCuRece: boolean };
}
interface Iesire { modul: string; la: string; azi: string; oraChisinau: string; cazuri: Caz[] }

const PERECHI: [string, string][] = [
  ['Chișinău', 'Bălți'],
  ['Chișinău', 'Briceni'],
  ['Bălți', 'Chișinău'],
  ['Chișinău', 'Larga'],
];

const ziChisinau = (plusZile: number) =>
  new Date(Date.now() + plusZile * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });

/** Rundele secvențiale: cererea care pornește după ce alta s-a terminat e cu o rundă mai jos. */
function runde(cereri: Cerere[]): number {
  const ordonate = [...cereri].sort((a, b) => a.start - b.start);
  const nivel: number[] = [];
  let max = 0;
  for (let i = 0; i < ordonate.length; i++) {
    let r = 1;
    for (let j = 0; j < i; j++) if (ordonate[j].end <= ordonate[i].start) r = Math.max(r, nivel[j] + 1);
    nivel[i] = r;
    max = Math.max(max, r);
  }
  return max;
}

function compara(caleVechi: string, caleNou: string): number {
  const vechi = JSON.parse(readFileSync(caleVechi, 'utf8')) as Iesire;
  const nou = JSON.parse(readFileSync(caleNou, 'utf8')) as Iesire;
  let diferite = 0;
  console.log(`vechi: ${vechi.modul} (${vechi.la}, azi ${vechi.azi} ${vechi.oraChisinau})`);
  console.log(`nou:   ${nou.modul} (${nou.la}, azi ${nou.azi} ${nou.oraChisinau})`);
  for (const a of vechi.cazuri) {
    const b = nou.cazuri.find((c) => c.from === a.from && c.to === a.to && c.date === a.date);
    const eticheta = `${a.from} → ${a.to} ${a.date}`;
    if (!b) { console.log(`${eticheta}: lipsește în nou`); diferite++; continue; }
    const ja = JSON.stringify(a.rezultat);
    const jb = JSON.stringify(b.rezultat);
    const masura = `runde ${a.rece.runde}→${b.rece.runde} (cald ${b.cald.runde}), cereri ${a.rece.cereriSupabase}→${b.rece.cereriSupabase} (cald ${b.cald.cereriSupabase}), ${a.rece.ms}→${b.rece.ms} ms (cald ${b.cald.ms} ms)`;
    if (ja === jb) { console.log(`${eticheta}: identic, ${a.rezultat.length} curse; ${masura}`); continue; }
    diferite++;
    console.log(`${eticheta}: DIFERIT (${a.rezultat.length} vs ${b.rezultat.length} curse); ${masura}`);
    const n = Math.max(a.rezultat.length, b.rezultat.length);
    const linii: string[] = [];
    for (let i = 0; i < n; i++) {
      const ra = a.rezultat[i] as Record<string, unknown> | undefined;
      const rb = b.rezultat[i] as Record<string, unknown> | undefined;
      if (JSON.stringify(ra) === JSON.stringify(rb)) continue;
      if (!ra || !rb) { linii.push(`  [${i}]: ${!ra ? 'doar în nou' : 'doar în vechi'}: ${JSON.stringify(ra ?? rb)}`); continue; }
      const chei = new Set([...Object.keys(ra), ...Object.keys(rb)]);
      for (const k of chei) {
        if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) linii.push(`  [${i}].${k}: ${JSON.stringify(ra[k])} → ${JSON.stringify(rb[k])}`);
      }
    }
    for (const l of linii.slice(0, 20)) console.log(l);
    if (linii.length > 20) console.log(`  … încă ${linii.length - 20} diferențe`);
  }
  console.log(diferite === 0 ? 'REZULTAT: identic' : `REZULTAT: ${diferite} cazuri diferite`);
  return diferite === 0 ? 0 : 1;
}

async function masoara(): Promise<void> {
  const iesire = process.argv[2];
  if (!iesire) throw new Error('lipsește fișierul de ieșire');
  const modul = path.resolve(process.argv[3] ?? path.join(process.cwd(), 'src/app/(public)/actions.ts'));

  // unstable_cache cere incrementalCache-ul Next și AsyncLocalStorage-ul pe globalThis (Next îl pune
  // la pornirea serverului); în afara Next îi dăm o memorie în proces, ca a doua rulare a fiecărui
  // caz să treacă prin cache (cu serializarea JSON cu tot).
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import('node:async_hooks')).AsyncLocalStorage;
  const memorie = new Map<string, unknown>();
  (globalThis as unknown as { __incrementalCache: unknown }).__incrementalCache = {
    isOnDemandRevalidate: false,
    async generateCacheKey(cheie: string) { return createHash('sha1').update(cheie).digest('hex'); },
    async get(cheie: string) { const v = memorie.get(cheie); return v ? { value: v, isStale: false, cacheState: 'fresh' } : null; },
    async set(cheie: string, valoare: unknown) { memorie.set(cheie, valoare); },
  };

  // Jurnalul cererilor HTTP (clientul Supabase cheamă fetch-ul global la fiecare cerere).
  let jurnal: Cerere[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const start = performance.now();
    try { return await fetchOriginal(input, init); } finally { jurnal.push({ url, start, end: performance.now() }); }
  }) as typeof fetch;

  // search_log fără scriere: scriptul nu lasă urme în analytics. Clientul e cel din `@/lib/supabase`
  // al arborelui curent (același modul pe care-l primește și actions.ts prin tsconfig paths).
  const libSupabase = pathToFileURL(path.join(process.cwd(), 'src/lib/supabase.ts')).href;
  const { getSupabase } = (await import(libSupabase)) as { getSupabase: () => { from: (t: string) => unknown } };
  const client = getSupabase();
  const fromOriginal = client.from.bind(client);
  client.from = (tabel: string) => (tabel === 'search_log' ? { insert: async () => ({ error: null }) } : fromOriginal(tabel));

  type Cautare = (a: string, b: string, c: string) => Promise<unknown[]>;
  const m = (await import(pathToFileURL(modul).href)) as { searchTrips?: Cautare; default?: { searchTrips?: Cautare } };
  const searchTrips = m.searchTrips ?? m.default?.searchTrips; // .ts în apps/web se încarcă drept CJS → exporturile stau pe default
  if (!searchTrips) throw new Error(`searchTrips lipsește din ${modul}`);
  const supabaseUrl = process.env.SUPABASE_URL || '';

  const masura = (ms: number): Masura => ({
    cereri: jurnal.length,
    cereriSupabase: jurnal.filter((c) => supabaseUrl && c.url.startsWith(supabaseUrl)).length,
    runde: runde(jurnal.filter((c) => supabaseUrl && c.url.startsWith(supabaseUrl))),
    ms: Math.round(ms),
  });

  const cazuri: Caz[] = [];
  for (const [from, to] of PERECHI) {
    for (const date of [ziChisinau(0), ziChisinau(1)]) {
      jurnal = [];
      let t = performance.now();
      const rezultat = await searchTrips(from, to, date);
      const rece = masura(performance.now() - t);
      jurnal = [];
      t = performance.now();
      const rezultatCald = await searchTrips(from, to, date);
      const cald = { ...masura(performance.now() - t), identicCuRece: JSON.stringify(rezultat) === JSON.stringify(rezultatCald) };
      cazuri.push({ from, to, date, rezultat, rece, cald });
      console.log(`${from} → ${to} ${date}: ${rezultat.length} curse; rece ${rece.runde} runde/${rece.cereriSupabase} cereri/${rece.ms} ms; cald ${cald.runde} runde/${cald.cereriSupabase} cereri/${cald.ms} ms${cald.identicCuRece ? '' : ' — CALD DIFERIT DE RECE'}`);
    }
  }

  const out: Iesire = {
    modul,
    la: new Date().toISOString(),
    azi: ziChisinau(0),
    oraChisinau: new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false }),
    cazuri,
  };
  writeFileSync(iesire, JSON.stringify(out, null, 2));
  console.log(`scris ${iesire}`);
}

if (process.argv[2] === '--compara') process.exitCode = compara(process.argv[3], process.argv[4]);
else await masoara();
