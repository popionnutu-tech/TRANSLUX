// ============================================================================
// LDE camioane — stările curselor puse AUTOMAT, la fiecare 5 minute.
// Ion, 10.09.2026: «scopul final este ca AI maximal să pună starea la auto și
// dispecerul minimal». Spec: docs/specs/camioane-stari-automate.md.
//
// Trei surse, un singur loc de scriere:
//  · Wialon (poziția live) + punctele cu tip (lde_dispatch_points.kind) +
//    memoria staționărilor (lde_truck_gps_stationari) → camion-auto.mjs decide:
//    cursă nouă la încărcare, la încărcare, spre descărcare, la descărcare;
//  · TLX fuel_receipts (bonul de recepție, pe DATA descărcării) → «încheiată»
//    (trip-auto.mjs, deciziaTlx);
//  · ce nu poate decide → lde_truck_auto_alerte, pentru dispecerul de camioane.
// Scrierea stării e OPTIMISTĂ: PATCH cu `status=eq.<starea citită>` — dacă
// dispecerul a apăsat el între timp, automatul nu suprascrie nimic.
//
// Rulare:  node --env-file=.env trip-live-worker.mjs [--write]
// Fără --write: doar tipărește ce ar scrie.
// Crontab (VPS lde-worker), cu flock ca două rulări să nu se calce:
//   */5 * * * * cd /root/lde-worker && flock -n /tmp/trip-live.lock node --env-file=.env trip-live-worker.mjs --write >> trip-live.log 2>&1
// ============================================================================
import { login, listUnitsPozitii } from './wialon-api.mjs';
import { deciziaTlx, normPlaca } from './trip-auto.mjs';
import { actualizeazaStationarea, alerteCamion, deciziaCamion, punctulUndeSta, STARI_DESCHISE } from './camion-auto.mjs';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const WIALON_TOKEN = process.env.WIALON_TOKEN;
// TLX e ALT proiect Supabase (aceleași chei ca price-worker). Fără ele, partea
// TLX se sare cu un rând în log — GPS-ul merge oricum.
const TLX_URL = process.env.TLX_SUPABASE_URL;
const TLX_KEY = process.env.TLX_SERVICE_KEY;
const WRITE = process.argv.includes('--write');
/** Central-hub trimite alertele pe Telegram (el știe cine e dispecerul); cheia e aceeași ca la cron-urile din crontab. */
const HUB_URL = (process.env.CAMIOANE_HUB_URL || 'https://central-hub-md.vercel.app').replace(/\/$/, '');
const CRON_SECRET = (process.env.CRON_SECRET || '').trim();

if (!SB_URL || !SB_KEY) { console.error('Lipsesc SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!WIALON_TOKEN) { console.error('Lipsește WIALON_TOKEN'); process.exit(1); }

/** Recepțiile se introduc și cu zile întârziere (văzut 08.09: descărcare pe 04.09,
 *  scrisă pe 08.09) — de aceea fereastra de citire e largă. */
const ZILE_RECEPTII = 14;
const ZILE_FOLOSITE = 60;
/** Ultima cursă a camionului (orice stare) se caută atât în urmă — ca să nu refacem ce tocmai s-a închis. */
const ZILE_ULTIMA_CURSA = 30;
/** Cât înapoi se citește istoricul opririlor pentru pornirea la rece: o cursă de biodiesel ține sub o săptămână. */
const ZILE_OPRIRI = 10;

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
const unu = (x) => (Array.isArray(x) ? x[0] ?? null : x);
const punctIO = (p) => (p ? { id: p.id, name: p.name, country: p.country, lat: p.lat, lon: p.lng, radius_m: p.radius_m, kind: p.kind ?? null } : null);
const ora = () => new Date().toISOString().slice(11, 19);
const enc = encodeURIComponent;

async function main() {
  const acumMs = Date.now();
  const acumIso = new Date(acumMs).toISOString();
  console.log(`[trip-live ${ora()}]${WRITE ? '' : ' (probă)'}`);

  // ── Flota: camioanele active, cu tipul și șoferul titular ──
  const [vehicule, profiluri, atribuiri, puncteRaw, stationariRaw, curseDeschise, curseRecente] = await Promise.all([
    sb(`vehicles?select=id,plate_number&active=is.true&is_lde=is.true&directions=cs.{camioane}&limit=1000`),
    sb(`lde_truck_profile?select=vehicle_id,fleet_type&limit=1000`),
    sb(`lde_active_assignments?select=vehicle_id,driver_id&valid_to=is.null&limit=1000`),
    sb(`lde_dispatch_points?select=id,name,country,lat,lng,radius_m,kind&active=is.true&limit=1000`),
    sb(`lde_truck_gps_stationari?select=*&limit=1000`),
    sb(`lde_truck_trips?select=id,vehicle_id,status,cargo,load_point_id,unload_point_id,load_planned_at,unload_planned_at,status_changed_at,` +
       `load_point:load_point_id(id,name,country,lat,lng,radius_m,kind),unload_point:unload_point_id(id,name,country,lat,lng,radius_m,kind),vehicles:vehicle_id(plate_number)` +
       `&status=in.(${STARI_DESCHISE.join(',')})&order=load_planned_at.asc&limit=1000`),
    sb(`lde_truck_trips?select=vehicle_id,load_point_id,load_planned_at,status` +
       `&load_planned_at=gte.${enc(new Date(acumMs - ZILE_ULTIMA_CURSA * 86400e3).toISOString())}&order=load_planned_at.desc&limit=1000`),
  ]);
  const tipDupaVehicul = new Map((profiluri || []).map((p) => [p.vehicle_id, p.fleet_type]));
  const soferDupaVehicul = new Map((atribuiri || []).map((a) => [a.vehicle_id, a.driver_id]));
  const puncte = (puncteRaw || []).map(punctIO);
  const puncteDupaId = new Map(puncte.map((p) => [p.id, p]));
  const stationareDupaVehicul = new Map((stationariRaw || []).map((s) => [s.vehicle_id, s]));
  const deschiseDupaVehicul = new Map();
  for (const t of curseDeschise || []) {
    const l = deschiseDupaVehicul.get(t.vehicle_id) ?? [];
    l.push(t); deschiseDupaVehicul.set(t.vehicle_id, l);
  }
  const ultimaDupaVehicul = new Map();
  for (const t of curseRecente || []) if (!ultimaDupaVehicul.has(t.vehicle_id)) ultimaDupaVehicul.set(t.vehicle_id, t);

  // Istoricul opririlor (importat noaptea), doar pentru camioanele cu cursa încă
  // «planificată»/«spre încărcare»: pornirea la rece — au încărcat înainte ca
  // automatul să existe. Doar opririle lungi, doar aceste camioane: Supabase taie
  // răspunsul la 1000 de rânduri.
  const opririDupaVehicul = new Map();
  const cuCursaNeporita = [...new Set((curseDeschise || []).filter((t) => t.status === 'planificata' || t.status === 'spre_incarcare').map((t) => t.vehicle_id))];
  if (cuCursaNeporita.length > 0) {
    try {
      const deLa = new Date(acumMs - ZILE_OPRIRI * 86400e3).toISOString().slice(0, 10);
      const opriri = await sb(`lde_gps_stops?select=vehicle_id,lat,lon,dwell_min,arrival_at,departure_at` +
        `&vehicle_id=in.(${cuCursaNeporita.join(',')})&date=gte.${deLa}&dwell_min=gte.60&order=arrival_at.desc&limit=1000`) || [];
      for (const o of opriri) {
        const l = opririDupaVehicul.get(o.vehicle_id) ?? [];
        l.push(o); opririDupaVehicul.set(o.vehicle_id, l);
      }
    } catch (e) {
      console.error(`  opriri: ${e instanceof Error ? e.message : e}`);
    }
  }

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
        tlx(`fuel_receipts?select=id,station_id,nr_auto,volume,unloaded_at,delivery_date,created_at,is_deleted` +
            `&nr_auto=not.is.null&created_at=gte.${enc(deLa)}&order=created_at.desc&limit=1000`),
        sb(`lde_truck_trips?select=tlx_receipt_id&tlx_receipt_id=not.is.null` +
           `&updated_at=gte.${enc(new Date(acumMs - ZILE_FOLOSITE * 86400e3).toISOString())}&limit=1000`),
      ]);
      statii = (st || []).map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lng }));
      receptii = rc || [];
      for (const f of fol || []) if (f.tlx_receipt_id) folosite.add(f.tlx_receipt_id);
    } catch (e) {
      console.error(`  TLX: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Cursa deschisă «de acum» a camionului: cea pornită bate cele doar planificate; între planificate, cea mai timpurie. */
  const cursaDeAcum = (vehicleId) => {
    const l = deschiseDupaVehicul.get(vehicleId) ?? [];
    return l.find((t) => t.status !== 'planificata') ?? l[0] ?? null;
  };
  const cursaIO = (t) => (t ? {
    id: t.id, status: t.status, cargo: t.cargo, plate: normPlaca(t.vehicles?.plate_number),
    load_point_id: t.load_point_id, unload_point_id: t.unload_point_id,
    load_planned_at: t.load_planned_at, unload_planned_at: t.unload_planned_at, status_changed_at: t.status_changed_at,
    loadPoint: punctIO(unu(t.load_point)), unloadPoint: punctIO(unu(t.unload_point)),
  } : null);

  const stationariDeScris = [];
  const alerteDeScris = [];
  let scrise = 0;
  let esuate = 0;

  const scrieStare = async (t, patch, motiv) => {
    console.log(`  ${normPlaca(t.vehicles?.plate_number)}: ${t.status} → ${patch.status} — ${motiv}`);
    if (!WRITE) return;
    // Optimist: doar dacă starea e cea citită. Dispecerul care a apăsat între
    // timp câștigă — automatul nu se ceartă cu omul.
    await sb(`lde_truck_trips?id=eq.${t.id}&status=eq.${t.status}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
    scrise++;
  };

  // ── 1. Bonul TLX închide cursele cu marfă, indiferent de tipul camionului ──
  const inchiseAcum = new Set();
  for (const t of curseDeschise || []) {
    const cursa = cursaIO(t);
    try {
      const d = deciziaTlx(cursa, receptii, statii, folosite, acumMs, puncte);
      if (!d) continue;
      await scrieStare(t, d, `bon TLX ${d.tlx_receipt_id.slice(0, 8)} din ${d.tlx_receipt_at.slice(0, 10)}${d.unload_point_id ? ', punctul completat' : ''}`);
      folosite.add(d.tlx_receipt_id);
      inchiseAcum.add(t.id);
    } catch (e) {
      esuate++;
      console.error(`  cursa ${t.id} (${cursa.plate}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 2. GPS: staționarea, apoi decizia, pentru fiecare cisternă ──
  let cisterne = 0;
  for (const v of vehicule || []) {
    const placa = normPlaca(v.plate_number);
    const camion = { id: v.id, plate: placa, fleetType: tipDupaVehicul.get(v.id) ?? null, driverId: soferDupaVehicul.get(v.id) ?? null };
    const pozitie = pozitieDupaPlaca.get(placa) ?? null;
    // Staționarea se ține pentru toate camioanele cu GPS — e doar memorie; deciziile, doar pentru cisterne.
    const punct = pozitie ? punctulUndeSta(pozitie, puncte) : null;
    const veche = stationareDupaVehicul.get(v.id) ?? null;
    const { stationare, schimbata } = actualizeazaStationarea(veche, punct, pozitie, acumMs);
    if (schimbata) stationariDeScris.push({ vehicle_id: v.id, ...stationare, updated_at: acumIso });
    if (camion.fleetType !== 'cisterna') continue;
    cisterne++;

    const t = cursaDeAcum(v.id);
    const cursa = t && !inchiseAcum.has(t.id) ? cursaIO(t) : null;
    const ultima = ultimaDupaVehicul.get(v.id) ?? null;
    try {
      const d = deciziaCamion({ camion, cursa, ultimaCursa: ultima, stationare, punct, pozitie, puncteDupaId, opriri: opririDupaVehicul.get(v.id) ?? [], acumMs });
      if (d.creeaza) {
        console.log(`  ${placa}: ${d.motiv}`);
        if (WRITE) {
          await sb('lde_truck_trips', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(d.creeaza) });
          scrise++;
        }
      } else if (d.schimba && t) {
        await scrieStare(t, d.schimba.patch, d.motiv);
      }
      for (const a of alerteCamion({ camion, cursa, stationare, punct, pozitie, acumMs })) {
        alerteDeScris.push({ vehicle_id: v.id, trip_id: a.trip_id ?? null, fel: a.fel, mesaj: a.mesaj, cheie: a.cheie });
      }
    } catch (e) {
      esuate++;
      console.error(`  ${placa}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 3. Memoria staționărilor și alertele ──
  if (WRITE && stationariDeScris.length > 0) {
    try {
      await sb('lde_truck_gps_stationari?on_conflict=vehicle_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(stationariDeScris),
      });
    } catch (e) { esuate++; console.error(`  staționări: ${e instanceof Error ? e.message : e}`); }
  }
  if (alerteDeScris.length > 0) {
    for (const a of alerteDeScris) console.log(`  alertă ${a.fel}: ${a.mesaj}`);
    if (WRITE) {
      try {
        // Cheia unică oprește repetarea: aceeași alertă se scrie o singură dată.
        await sb('lde_truck_auto_alerte?on_conflict=cheie', {
          method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(alerteDeScris),
        });
      } catch (e) { esuate++; console.error(`  alerte: ${e instanceof Error ? e.message : e}`); }
      // Trimiterea pe Telegram o face central-hub (știe cine e dispecerul); aici doar o pornim.
      if (CRON_SECRET) {
        try {
          const r = await fetch(`${HUB_URL}/api/cron/lde-camioane-alerte`, {
            headers: { Authorization: `Bearer ${CRON_SECRET}` }, signal: AbortSignal.timeout(25000),
          });
          console.log(`  alerte trimise: ${r.status} ${(await r.text()).slice(0, 120)}`);
        } catch (e) { console.error(`  alerte Telegram: ${e instanceof Error ? e.message : e}`); }
      }
    }
  }

  console.log(`  camioane: ${(vehicule || []).length} (cisterne ${cisterne}), curse deschise: ${(curseDeschise || []).length}, poziții: ${pozitieDupaPlaca.size}, ` +
    `recepții: ${receptii.length}, staționări scrise: ${stationariDeScris.length}, stări scrise: ${scrise}, alerte: ${alerteDeScris.length}, eșuate: ${esuate}`);
  if (esuate > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('[trip-live]', e); process.exit(1); });
