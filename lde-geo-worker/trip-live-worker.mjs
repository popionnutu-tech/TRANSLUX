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
//  · urma GPS a ultimelor zile (lde_gps_stops) → cursa pe care automatul n-a
//    văzut-o, recuperată (recupereazaDinIstoric), și zilele în care camionul a
//    stat, puse ca «odihnă» (zileDeStat).
//
// Nu trimite nimic și nu cere nimănui nimic (Ion, 21.09: «nu trebuie alerte»;
// «trebuie programul să ruleze și să înțeleagă starea automat, asta tot»). Tot ce
// hotărăște singur se explică în nota cursei — acolo se citește, când se citește.
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
import {
  actualizeazaStationarea, cursaExpirata, deciziaCamion, punctulUndeSta,
  recupereazaDinIstoric, zileCuCursa, zileDeStat, ORE_STAT_PE_ZI, STARI_DESCHISE, ZILE_RECUPERARE,
} from './camion-auto.mjs';

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
/** Ultima cursă a camionului (orice stare) se caută atât în urmă — ca să nu refacem ce tocmai s-a închis. */
const ZILE_ULTIMA_CURSA = 30;
/** Cât înapoi se citește istoricul opririlor: pornirea la rece ține sub o săptămână, dar
 *  cisterna plină poate sta la bază și două-trei săptămâni până descarcă — plecarea de la
 *  încărcare trebuie să fie încă în fereastră când vine bonul, altfel bonul vechi ar închide iar. */
const ZILE_OPRIRI = 30;
/** Cât înapoi se caută zilele în care camionul a stat, pentru starea «odihnă» automată. */
const ZILE_STAT_FEREASTRA = 14;

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
    sb(`lde_truck_trips?select=id,vehicle_id,status,cargo,load_point_id,unload_point_id,load_planned_at,unload_planned_at,status_changed_at,notes,` +
       `load_point:load_point_id(id,name,country,lat,lng,radius_m,kind),unload_point:unload_point_id(id,name,country,lat,lng,radius_m,kind),vehicles:vehicle_id(plate_number)` +
       `&status=in.(${STARI_DESCHISE.join(',')})&order=load_planned_at.asc&limit=1000`),
    sb(`lde_truck_trips?select=vehicle_id,load_point_id,load_planned_at,status,status_changed_at` +
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

  // Istoricul opririlor (importat noaptea), pentru camioanele cu o cursă deschisă:
  // pornirea la rece (au încărcat înainte ca automatul să existe) și plecarea
  // reală de la încărcare, de care bonul TLX trebuie să fie mai nou (KYK742, 11.09).
  // Doar opririle lungi, doar aceste camioane: Supabase taie răspunsul la 1000 de
  // rânduri (11 camioane × 30 de zile ≈ 620 de rânduri pe 11.09).
  const opririDupaVehicul = new Map();
  const cuCursaDeschisa = [...new Set((curseDeschise || []).map((t) => t.vehicle_id))];
  if (cuCursaDeschisa.length > 0) {
    try {
      const deLa = new Date(acumMs - ZILE_OPRIRI * 86400e3).toISOString().slice(0, 10);
      const opriri = await sb(`lde_gps_stops?select=vehicle_id,lat,lon,dwell_min,arrival_at,departure_at` +
        `&vehicle_id=in.(${cuCursaDeschisa.join(',')})&date=gte.${deLa}&dwell_min=gte.60&order=arrival_at.desc&limit=1000`) || [];
      if (opriri.length >= 1000) console.error('  opriri: răspunsul a atins plafonul de 1000 de rânduri — istoricul vechi lipsește');
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
    load_planned_at: t.load_planned_at, unload_planned_at: t.unload_planned_at, status_changed_at: t.status_changed_at, notes: t.notes ?? null,
    loadPoint: punctIO(unu(t.load_point)), unloadPoint: punctIO(unu(t.unload_point)),
  } : null);

  const stationariDeScris = [];
  let scrise = 0;
  let esuate = 0;

  /** @returns true dacă rândul chiar a fost mutat (sau am fi mutat-o, în probă). */
  const scrieStare = async (t, patch, motiv) => {
    console.log(`  ${normPlaca(t.vehicles?.plate_number)}: ${t.status} → ${patch.status} — ${motiv}`);
    if (!WRITE) return true;
    // Optimist: doar dacă starea e cea citită. Dispecerul care a apăsat între
    // timp câștigă — automatul nu se ceartă cu omul. Răspunsul cu rândul mutat
    // (nu `return=minimal`) e singurul fel de a ști DACĂ s-a mutat: când decizia
    // e «închide cursa veche ȘI deschide una nouă», cursa nouă n-are voie să se
    // nască peste o închidere care n-a prins.
    const mutate = await sb(`lde_truck_trips?id=eq.${t.id}&status=eq.${t.status}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
    });
    const ok = Array.isArray(mutate) ? mutate.length > 0 : true;
    if (ok) scrise++;
    else console.log(`  ${normPlaca(t.vehicles?.plate_number)}: starea s-a schimbat între timp — automatul se dă la o parte`);
    return ok;
  };

  // ── 1. Bonul TLX închide cursele cu marfă, indiferent de tipul camionului ──
  const inchiseAcum = new Set();
  /** Cursele pe care rularea asta le-a mutat deja: expirarea nu le mai judecă. */
  const atinseAcum = new Set();
  for (const t of curseDeschise || []) {
    const cursa = cursaIO(t);
    try {
      const d = deciziaTlx(cursa, receptii, statii, folosite, acumMs, puncte, opririDupaVehicul.get(t.vehicle_id) ?? []);
      if (!d) continue;
      if (!await scrieStare(t, d, `bon TLX ${d.tlx_receipt_id.slice(0, 8)} din ${d.tlx_receipt_at.slice(0, 10)}${d.unload_point_id ? ', punctul completat' : ''}`)) continue;
      folosite.add(d.tlx_receipt_id);
      inchiseAcum.add(t.id);
    } catch (e) {
      esuate++;
      console.error(`  cursa ${t.id} (${cursa.plate}): ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 2. GPS: staționarea, apoi decizia, pentru fiecare cisternă ──
  let cisterne = 0;
  /** Cisternele care au avut o cursă la începutul rulării sau au primit una acum:
   *  recuperarea din istoric nu le atinge, ca să nu reînvie drumul tocmai închis. */
  const cuCursaAcum = new Set();
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
      // Reîncărcarea întoarce amândouă: cursa veche se închide, cursa nouă se naște.
      // Închiderea merge prima — dacă ea nu prinde (a apăsat omul între timp), cursa
      // nouă nu se mai face, altfel camionul ar rămâne cu două curse deschise.
      const mutata = d.schimba && t ? await scrieStare(t, d.schimba.patch, d.motiv) : true;
      if (d.schimba && t && mutata) atinseAcum.add(t.id);
      if (d.creeaza && mutata) {
        console.log(`  ${placa}: cursă nouă ${d.creeaza.cargo}, la încărcare — ${d.motiv}`);
        if (WRITE) {
          await sb('lde_truck_trips', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(d.creeaza) });
          scrise++;
        }
        cuCursaAcum.add(v.id);
      }
      if (t) cuCursaAcum.add(v.id);
    } catch (e) {
      esuate++;
      console.error(`  ${placa}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 2b. Cursa pe care nimic n-a mai mișcat-o se stinge (Ion, 21.09) ──
  // Plasa de sub toate celelalte reguli, și singurul loc care se uită și la
  // camioanele care nu-s cisterne: pentru zernovoz sau pentru marfa «alta»
  // automatul n-are nicio regulă, deci nimeni n-ar închide cursa niciodată —
  // RWN169 stă «planificată» din 10.09 cu «el amu la Romanie» scris de mână.
  for (const t of curseDeschise || []) {
    if (inchiseAcum.has(t.id) || atinseAcum.has(t.id)) continue;
    const e = cursaExpirata(t, acumMs);
    if (!e) continue;
    const placa = normPlaca(t.vehicles?.plate_number);
    try {
      // Motivul rămâne scris în nota cursei (cursaExpirata îl pune acolo): cine se
      // uită la cursă îl vede, fără ca cineva să fie chemat.
      await scrieStare(t, e.patch, e.motiv);
    } catch (err) {
      esuate++;
      console.error(`  cursa ${t.id} (${placa}): ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── 2c. Cursa pe care automatul n-a văzut-o, recuperată din urma GPS (Ion, 21.09) ──
  // Automatul vede doar ce se întâmplă cât timp rulează și doar pentru camionul
  // liber. Cine a încărcat în timp ce cursa veche îl ținea agățat n-are cursă și
  // n-ar căpăta una niciodată: ANT344 a luat biodiesel la Berdichev pe 17–18.09,
  // RWN193 pe 18–20.09, iar banda nu arăta nimic. Se rejoacă opririle cu aceleași
  // reguli ca deciziile vii; se scrie doar drumul care încă nu s-a terminat.
  let recuperate = 0;
  const deRecuperat = (vehicule || []).filter((v) => tipDupaVehicul.get(v.id) === 'cisterna' && !cuCursaAcum.has(v.id));
  if (deRecuperat.length > 0) {
    try {
      const deLa = new Date(acumMs - ZILE_RECUPERARE * 86400e3).toISOString().slice(0, 10);
      const istoric = await sb(`lde_gps_stops?select=vehicle_id,lat,lon,dwell_min,arrival_at,departure_at` +
        `&vehicle_id=in.(${deRecuperat.map((v) => v.id).join(',')})&date=gte.${deLa}&dwell_min=gte.45` +
        `&order=arrival_at.asc&limit=1000`) || [];
      if (istoric.length >= 1000) console.error('  recuperare: răspunsul a atins plafonul de 1000 de rânduri — istoricul vechi lipsește');
      const istoricDupaVehicul = new Map();
      for (const o of istoric) {
        const l = istoricDupaVehicul.get(o.vehicle_id) ?? [];
        l.push(o); istoricDupaVehicul.set(o.vehicle_id, l);
      }
      for (const v of deRecuperat) {
        const opriri = istoricDupaVehicul.get(v.id);
        if (!opriri?.length) continue;
        const placa = normPlaca(v.plate_number);
        const camion = { id: v.id, plate: placa, fleetType: 'cisterna', driverId: soferDupaVehicul.get(v.id) ?? null };
        try {
          const r = recupereazaDinIstoric({ camion, opriri, puncte, ultimaCursa: ultimaDupaVehicul.get(v.id) ?? null, acumMs });
          if (!r) continue;
          console.log(`  ${placa}: ${r.motiv}`);
          if (WRITE) {
            await sb('lde_truck_trips', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(r.creeaza) });
            scrise++;
          }
          recuperate++;
        } catch (e) {
          esuate++;
          console.error(`  ${placa} (recuperare): ${e instanceof Error ? e.message : e}`);
        }
      }
    } catch (e) {
      esuate++;
      console.error(`  recuperare: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 2e. Camionul care stă zile întregi primește «odihnă» automat (Ion, 21.09) ──
  // Fără operator, lde_truck_day_states rămânea gol (ultima intrare pusă de om e
  // din 11.09) și mașina din curte arăta în bandă la fel ca una gata de drum.
  // GPS-ul dovedește că nu se mișcă, nu și DE CE — de aceea starea scrisă e
  // «odihnă», niciodată «reparație». Rândul pus de om nu se atinge: se scriu doar
  // zilele care n-au deja o stare.
  let zileStat = 0;
  const faraCursa = (vehicule || []).filter((v) => !deschiseDupaVehicul.has(v.id) && !cuCursaAcum.has(v.id));
  if (faraCursa.length > 0) {
    try {
      const deLa = new Date(acumMs - ZILE_STAT_FEREASTRA * 86400e3).toISOString().slice(0, 10);
      const azi = new Date(acumMs).toISOString().slice(0, 10);
      const ids = faraCursa.map((v) => v.id);
      const [opriri, stariExistente, curseDinFereastra] = await Promise.all([
        sb(`lde_gps_stops?select=vehicle_id,date,dwell_min&vehicle_id=in.(${ids.join(',')})` +
           `&date=gte.${deLa}&dwell_min=gte.${ORE_STAT_PE_ZI * 60}&limit=1000`),
        sb(`lde_truck_day_states?select=vehicle_id,date&vehicle_id=in.(${ids.join(',')})&date=gte.${deLa}&limit=1000`),
        // Cursele care ating fereastra, orice stare: ziua cu cursă nu e odihnă nici
        // după ce cursa s-a închis. Se caută de mai devreme decât fereastra, fiindcă
        // o cursă începută acum trei săptămâni poate ajunge cu coada în ea.
        sb(`lde_truck_trips?select=vehicle_id,load_planned_at,unload_planned_at,status_changed_at,status` +
           `&vehicle_id=in.(${ids.join(',')})&status=neq.anulata` +
           `&load_planned_at=gte.${enc(new Date(acumMs - (ZILE_STAT_FEREASTRA + 45) * 86400e3).toISOString())}&limit=1000`),
      ]);
      const opririDupaV = new Map();
      for (const o of opriri || []) {
        const l = opririDupaV.get(o.vehicle_id) ?? [];
        l.push(o); opririDupaV.set(o.vehicle_id, l);
      }
      const curseDupaV = new Map();
      for (const c of curseDinFereastra || []) {
        const l = curseDupaV.get(c.vehicle_id) ?? [];
        l.push(c); curseDupaV.set(c.vehicle_id, l);
      }
      const dejaScrise = new Set((stariExistente || []).map((s) => `${s.vehicle_id}|${String(s.date).slice(0, 10)}`));
      const deScris = [];
      for (const v of faraCursa) {
        const cuCursa = zileCuCursa(curseDupaV.get(v.id) ?? []);
        for (const zi of zileDeStat(opririDupaV.get(v.id) ?? [], azi, cuCursa)) {
          if (dejaScrise.has(`${v.id}|${zi}`)) continue;
          deScris.push({
            vehicle_id: v.id, date: zi, state: 'odihna',
            reason: 'Automat: mașina n-a avut cursă și n-a lucrat toată ziua (GPS)',
            created_by: 'auto:gps',
          });
        }
      }
      if (deScris.length > 0) {
        for (const d of deScris) console.log(`  ${normPlaca((vehicule || []).find((v) => v.id === d.vehicle_id)?.plate_number)}: ${d.date} → odihnă (stat toată ziua, fără cursă)`);
        if (WRITE) {
          await sb('lde_truck_day_states', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(deScris) });
        }
        zileStat = deScris.length;
      }
    } catch (e) {
      esuate++;
      console.error(`  zile de stat: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── 3. Memoria staționărilor ──
  if (WRITE && stationariDeScris.length > 0) {
    try {
      await sb('lde_truck_gps_stationari?on_conflict=vehicle_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(stationariDeScris),
      });
    } catch (e) { esuate++; console.error(`  staționări: ${e instanceof Error ? e.message : e}`); }
  }

  console.log(`  camioane: ${(vehicule || []).length} (cisterne ${cisterne}), curse deschise: ${(curseDeschise || []).length}, poziții: ${pozitieDupaPlaca.size}, ` +
    `recepții: ${receptii.length}, staționări scrise: ${stationariDeScris.length}, stări scrise: ${scrise}, recuperate: ${recuperate}, zile stat: ${zileStat}, eșuate: ${esuate}`);
  if (esuate > 0) process.exitCode = 1;
}

main().catch((e) => { console.error('[trip-live]', e); process.exit(1); });
