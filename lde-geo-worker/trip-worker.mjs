// ============================================================================
// LDE camioane — metricile curselor din GPS (Ion, 31.08.2026).
// Rulează noaptea, după wialon-worker: pentru fiecare cursă care atinge ziua dată
// și nu e anulată, scoate track-ul camionului din Wialon și scrie în
// lde_truck_trip_metrics: km reali, km ideali (dacă există furnizor de rutare),
// abaterea, opririle lungi, orele reale de încărcare/descărcare și întârzierile.
//
// Adevărul GPS se calculează AICI, post-factum — tabloul dispecerului rămâne
// manual (decizia lui Ion). Nimic din ce scrie workerul nu mută stări de cursă.
//
// Rulare:  node --env-file=.env trip-worker.mjs [YYYY-MM-DD] [--write]
// Fără --write: doar tipărește ce ar scrie (rulare de probă).
// ============================================================================
import { login, listUnits, loadTrack } from './wialon-api.mjs';
import { tripMetrics } from './trip-metrics.mjs';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const WIALON_TOKEN = process.env.WIALON_TOKEN;
// Furnizor de rutare pentru «km ideali» (API Valhalla). LIPSEȘTE în infrastructura
// actuală: harta de pe VPS acoperă doar Moldova, iar camioanele merg în UA/RO/BG.
// Fără el metrica rămâne NULL — analitica scrie «traseu ideal indisponibil»,
// nu inventează o cifră.
const ROUTING_URL = process.env.ROUTING_URL;

const ziua = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
  ? process.argv[2]
  : new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
const WRITE = process.argv.includes('--write');

if (!SB_URL || !SB_KEY) { console.error('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!WIALON_TOKEN) { console.error('Lipsește WIALON_TOKEN'); process.exit(1); }

async function sb(path, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'content-type': 'application/json', ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`supabase ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  // PostgREST întoarce 201 cu corp GOL la POST fără `return=representation`.
  // r.json() pe corp gol arunca SyntaxError și workerul murea la PRIMA cursă
  // scrisă, în fiecare noapte (arch review 31.08, Critical).
  const ct = r.headers.get('content-type') || '';
  if (r.status === 204 || !ct.includes('application/json')) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

/** Aceeași regulă ca în wialon-worker: numele unității → plăcuță normalizată. */
function placaDinNume(nume) {
  const m = (nume || '').match(/([A-Z]{3})\s?(\d{3})/);
  return m ? `${m[1]}${m[2]}` : null;
}
const normPlaca = (p) => (p || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

/** Km de drum între două puncte, dacă avem furnizor de rutare. Altfel null. */
async function kmIdeali(a, b) {
  if (!ROUTING_URL || !a || !b || a.lat == null || b.lat == null) return null;
  try {
    const r = await fetch(`${ROUTING_URL}/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }],
        costing: 'truck',
        units: 'kilometers',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const km = j?.trip?.summary?.length;
    return typeof km === 'number' ? Math.round(km * 10) / 10 : null;
  } catch {
    return null; // ruterul căzut nu are voie să oprească restul metricilor
  }
}

async function main() {
  console.log(`[trip-worker] ziua ${ziua}${WRITE ? ' (write)' : ' (probă)'}`);

  // Cursele ÎNCHEIATE în ziua dată (descărcarea planificată cade în ea). O cursă
  // de 3 zile atingea 3 nopți, se descărca track-ul de 3 ori și primele două
  // rulări scriau metrici pe o cursă neterminată — apoi le suprascria a treia
  // (perf review 31.08). Anulatele nu se măsoară.
  // Fus: la fel ca wialon-worker — ora locală a VPS-ului (TZ=Europe/Chisinau),
  // nu offset fix (vara +03, iarna +02).
  const de = new Date(`${ziua}T00:00:00`).toISOString();
  const la = new Date(`${ziua}T23:59:59.999`).toISOString();
  const CAMPURI =
    `select=id,vehicle_id,load_planned_at,unload_planned_at,status,` +
    `load_point:load_point_id(name,lat,lng,radius_m),unload_point:unload_point_id(name,lat,lng,radius_m),` +
    `vehicles:vehicle_id(plate_number)`;

  const [incheiateAzi, restante] = await Promise.all([
    sb(`lde_truck_trips?${CAMPURI}&status=neq.anulata` +
       `&unload_planned_at=gte.${encodeURIComponent(de)}&unload_planned_at=lte.${encodeURIComponent(la)}`),
    // A DOUA trecere: cursele rămase DESCHISE, cu descărcarea planificată în
    // ultimele 7 zile. Fără ea, o cursă care întârzia peste fereastră nu mai era
    // niciodată recalculată — și tocmai întârzierile mari dispăreau din analitică
    // (arch/business review 31.08). Se recalculează până se închid.
    sb(`lde_truck_trips?${CAMPURI}&status=not.in.(incheiata,anulata)` +
       `&unload_planned_at=lt.${encodeURIComponent(de)}` +
       `&unload_planned_at=gte.${encodeURIComponent(new Date(Date.parse(de) - 7 * 86400e3).toISOString())}`),
  ]);
  const vazute = new Set();
  const curse = [...incheiateAzi, ...restante].filter((t) => !vazute.has(t.id) && vazute.add(t.id));
  console.log(`[trip-worker] curse de măsurat: ${curse.length} (${incheiateAzi.length} încheiate azi, ${restante.length} restante)`);
  if (curse.length === 0) return;

  const { sid } = await login(WIALON_TOKEN);
  const units = await listUnits(sid);
  const unitDupaPlaca = new Map();
  for (const u of units) {
    const p = placaDinNume(u.name);
    if (p) unitDupaPlaca.set(p, u.id);
  }

  let scrise = 0;
  let esuate = 0;
  for (const t of curse) {
    try {
    const placa = normPlaca(t.vehicles?.plate_number);
    const unitId = unitDupaPlaca.get(placa);
    if (!unitId) { console.log(`  ${placa}: fără unitate Wialon — sar`); continue; }

    // Fereastra e ASIMETRICĂ: o oră înainte de încărcare (camionul poate ajunge
    // devreme), dar 24h după descărcarea planificată. Cu doar +1h, cursa care
    // întârzia peste o oră ieșea din fereastră, sosirea nu se detecta, iar
    // analitica o număra «la timp» — exact cursele care contează dispăreau
    // (audit 31.08, Critical).
    const to = Math.min(
      Math.floor(Date.now() / 1000),
      Math.floor(Date.parse(t.unload_planned_at) / 1000) + 24 * 3600,
    );
    // Plafon dur pe fereastră: o cursă cu anul greșit la încărcare cerea de la
    // Wialon un interval de ani întregi, în fiecare noapte, pe contul comun cu
    // gps-worker/fuel-worker (security review 31.08, High).
    const MAX_ZILE_TRACK = 14;
    const from = Math.max(
      Math.floor(Date.parse(t.load_planned_at) / 1000) - 3600,
      to - MAX_ZILE_TRACK * 86400,
    );
    const points = await loadTrack(sid, unitId, from, to);
    if (points.length < 2) { console.log(`  ${placa}: track gol — sar`); continue; }

    const lp = t.load_point ? { lat: t.load_point.lat, lon: t.load_point.lng } : null;
    const up = t.unload_point ? { lat: t.unload_point.lat, lon: t.unload_point.lng } : null;
    // Raza e editabilă de dispecer (până la 20 km în formular), iar ea decide
    // când «a sosit» camionul — deci și întârzierea din analitică. O plafonăm la
    // 2 km la CALCUL: cel evaluat nu-și alege singur toleranța (security 31.08).
    // Fiecare punct cu raza LUI: maximul comun impunea unui punct mic toleranța
    // terminalului mare și ascundea întârzierea (arch review 31.08).
    // Plafon ȘI podea: dispecerul putea coborî raza sub distanța dintre două
    // ping-uri GPS, sosirea nu se mai detecta și cursa ieșea din punctualitate
    // ca «nemăsurată» (security review 31.08).
    const RAZA_MAX_M = 2000;
    const RAZA_MIN_M = 200;
    const raza = (p) => Math.min(RAZA_MAX_M, Math.max(RAZA_MIN_M, p?.radius_m ?? 500));
    const razaLoad = raza(t.load_point);
    const razaUnload = raza(t.unload_point);

    const ideal = await kmIdeali(lp, up);
    const m = tripMetrics({
      points, loadPoint: lp, unloadPoint: up, razaLoad, razaUnload,
      kmIdeal: ideal,
      plannedLoad: t.load_planned_at,
      plannedUnload: t.unload_planned_at,
    });

    const rand = {
      trip_id: t.id,
      ...m,
      computed_at: new Date().toISOString(),
      note: [
        t.status !== 'incheiata' ? `provizoriu (cursa e în «${t.status}»)` : null,
        ideal === null ? 'traseu ideal indisponibil (fără ROUTING_URL sau puncte fără coordonate)' : null,
      ].filter(Boolean).join('; ') || null,
    };
    console.log(`  ${placa}: ${m.km_real} km real, ideal ${ideal ?? '—'}, opriri ${m.stops_over_30min}, ` +
      `întârziere desc. ${m.unload_delay_min ?? '—'} min`);

    if (WRITE) {
      await sb('lde_truck_trip_metrics?on_conflict=trip_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([rand]),
      });
      scrise++;
    }
    } catch (e) {
      // O cursă căzută (unitate lipsă, rețea, punct fără coordonate) nu are voie
      // să omoare toată noaptea: cursele deja încheiate nu s-ar mai reîncerca
      // niciodată (security review 31.08).
      esuate++;
      console.error(`  cursa ${t.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`[trip-worker] gata${WRITE ? `, scrise ${scrise}` : ''}${esuate ? `, eșuate ${esuate}` : ''}`);
}

main().catch((e) => { console.error('[trip-worker]', e); process.exit(1); });
