// ============================================================================
// LDE camioane — stările automate ale curselor, la fiecare 5 minute (Ion, 08.09.2026).
// «Dacă mașina s-a încărcat la Constanța, a ajuns în Moldova și stă, stă, stă —
// trece singură «la descărcare». Dacă descarcă la o stație TLX, luăm din TLX
// când s-a descărcat și închidem cursa. Dacă descarcă în altă parte (baza
// Briceni), închide dispecerul.»
//
// Două surse, două semnale — regulile stau în trip-auto.mjs (pur, testat):
//  · Wialon (poziția live a fiecărui camion) → «la_descarcare» după 15 min
//    de stat în raza punctului de descărcare;
//  · TLX fuel_receipts (recepția de carburant la stație, cu nr_auto) → «incheiata».
// Scrierea e OPTIMISTĂ: PATCH cu `status=eq.<starea citită>` — dacă dispecerul a
// apăsat el între timp, automatul nu suprascrie nimic.
//
// Rulare:  node --env-file=.env trip-live-worker.mjs [--write]
// Fără --write: doar tipărește ce ar scrie.
// Crontab (VPS lde-worker), cu flock ca două rulări să nu se calce:
//   */5 * * * * cd /root/lde-worker && flock -n /tmp/trip-live.lock node --env-file=.env trip-live-worker.mjs --write >> trip-live.log 2>&1
// ============================================================================
import { login, listUnitsPozitii } from './wialon-api.mjs';
import { deciziaGps, deciziaTlx, normPlaca } from './trip-auto.mjs';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const WIALON_TOKEN = process.env.WIALON_TOKEN;
// TLX e ALT proiect Supabase (aceleași chei ca price-worker). Fără ele, partea
// TLX se sare cu un rând în log — GPS-ul merge oricum.
const TLX_URL = process.env.TLX_SUPABASE_URL;
const TLX_KEY = process.env.TLX_SERVICE_KEY;
const WRITE = process.argv.includes('--write');

if (!SB_URL || !SB_KEY) { console.error('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!WIALON_TOKEN) { console.error('Lipsește WIALON_TOKEN'); process.exit(1); }

/** Recepțiile se introduc și cu zile întârziere (văzut 08.09: descărcare pe 04.09,
 *  scrisă pe 08.09) — de aceea fereastra de citire e largă. */
const ZILE_RECEPTII = 14;
const ZILE_FOLOSITE = 60;

function rest(baseUrl, key) {
  return async (path, init = {}) => {
    const r = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'content-type': 'application/json', ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const ct = r.headers.get('content-type') || '';
    if (r.status === 204 || !ct.includes('application/json')) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
}
const sb = rest(SB_URL, SB_KEY);
const tlx = TLX_URL && TLX_KEY ? rest(TLX_URL, TLX_KEY) : null;

/** Aceeași regulă ca în wialon-worker/trip-worker: numele unității → plăcuță. */
function placaDinNume(nume) {
  const m = (nume || '').match(/([A-Z]{3})\s?(\d{3})/);
  return m ? `${m[1]}${m[2]}` : null;
}

const ora = () => new Date().toISOString().slice(11, 19);

async function main() {
  const acumMs = Date.now();
  console.log(`[trip-live ${ora()}]${WRITE ? '' : ' (probă)'}`);

  // Cursele cu marfa în camion. Cele planificate/spre încărcare nu ne interesează:
  // un camion gol oprit lângă stație nu descarcă nimic.
  const curse = await sb(
    `lde_truck_trips?select=id,status,unload_seen_at,load_planned_at,unload_planned_at,` +
    `unload_point:unload_point_id(name,lat,lng,radius_m),vehicles:vehicle_id(plate_number)` +
    `&status=in.(la_incarcare,asteapta_descarcare,spre_descarcare,la_descarcare)&limit=500`,
  ) || [];
  if (curse.length === 0) { console.log('  nicio cursă cu marfă — nimic de făcut'); return; }

  // ── Wialon: poziția live a fiecărui camion ──
  const pozitieDupaPlaca = new Map();
  try {
    const { sid } = await login(WIALON_TOKEN);
    for (const u of await listUnitsPozitii(sid)) {
      const p = placaDinNume(u.name);
      if (p) pozitieDupaPlaca.set(p, { lat: u.lat, lon: u.lon, speed: u.speed, at: new Date(u.t * 1000).toISOString() });
    }
  } catch (e) {
    // Wialon căzut nu oprește partea TLX.
    console.error(`  Wialon: ${e instanceof Error ? e.message : e}`);
  }

  // ── TLX: stațiile și recepțiile recente ──
  let statii = [];
  let receptii = [];
  const folosite = new Set();
  if (!tlx) {
    console.log('  TLX: lipsesc TLX_SUPABASE_URL / TLX_SERVICE_KEY — se sare închiderea din recepții');
  } else {
    try {
      const deLa = new Date(acumMs - ZILE_RECEPTII * 86400e3).toISOString();
      const [st, rc, fol] = await Promise.all([
        tlx('stations?select=id,name,lat,lng&lat=not.is.null&lng=not.is.null'),
        tlx(`fuel_receipts?select=id,station_id,nr_auto,volume,unloaded_at,created_at,is_deleted` +
            `&nr_auto=not.is.null&created_at=gte.${encodeURIComponent(deLa)}&order=created_at.desc&limit=1000`),
        sb(`lde_truck_trips?select=tlx_receipt_id&tlx_receipt_id=not.is.null` +
           `&updated_at=gte.${encodeURIComponent(new Date(acumMs - ZILE_FOLOSITE * 86400e3).toISOString())}&limit=1000`),
      ]);
      statii = (st || []).map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lng }));
      receptii = rc || [];
      for (const f of fol || []) if (f.tlx_receipt_id) folosite.add(f.tlx_receipt_id);
    } catch (e) {
      console.error(`  TLX: ${e instanceof Error ? e.message : e}`);
    }
  }

  let scrise = 0;
  let esuate = 0;
  for (const t of curse) {
    const placa = normPlaca(t.vehicles?.plate_number);
    const up = t.unload_point;
    const cursa = {
      id: t.id, status: t.status, plate: placa, unload_seen_at: t.unload_seen_at,
      load_planned_at: t.load_planned_at, unload_planned_at: t.unload_planned_at,
      unloadPoint: up ? { lat: up.lat, lon: up.lng, radius_m: up.radius_m } : null,
    };
    try {
      // Recepția TLX e dovada mai tare — închide cursa indiferent de GPS.
      let schimbare = deciziaTlx(cursa, receptii, statii, folosite, acumMs);
      let sursa = 'tlx';
      if (!schimbare) {
        schimbare = deciziaGps(cursa, pozitieDupaPlaca.get(placa) ?? null, acumMs);
        sursa = 'gps';
      }
      if (!schimbare) continue;

      const ce = schimbare.status
        ? `${t.status} → ${schimbare.status} (${sursa})`
        : schimbare.unload_seen_at ? `văzut stând la «${up?.name}» de la ${schimbare.unload_seen_at}` : 'a plecat din rază';
      console.log(`  ${placa}: ${ce}`);
      if (!WRITE) continue;

      // Optimist: doar dacă starea e cea citită. Dispecerul care a apăsat între
      // timp câștigă — automatul nu se ceartă cu omul.
      await sb(`lde_truck_trips?id=eq.${t.id}&status=eq.${t.status}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(schimbare),
      });
      if (schimbare.tlx_receipt_id) folosite.add(schimbare.tlx_receipt_id);
      scrise++;
    } catch (e) {
      esuate++;
      console.error(`  cursa ${t.id} (${placa}): ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  curse: ${curse.length}, poziții: ${pozitieDupaPlaca.size}, recepții: ${receptii.length}, scrise: ${scrise}, eșuate: ${esuate}`);
  if (esuate > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('[trip-live]', e); process.exit(1); });
