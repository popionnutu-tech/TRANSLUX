// ============================================================================
// LDE — scrierea curselor și a contribuțiilor pe ziua GPS.
//
// Partea cu I/O; logica pură stă în etalon-labels.mjs. Chemată din gps-worker,
// DUPĂ ce s-au scris km_total și opririle — ordinea nu e cosmetică: bucla worker-ului
// n-are try/catch, iar km_total duce salariile (praguri 6.000/7.000 km) și facturarea
// per_km. O excepție în etichetare, scrisă înainte, ar lăsa restul flotei fără km
// pe noaptea aia.
// ============================================================================
import { simplifica } from './geom-simplify.mjs';
import {
  secvente, treceriPorti, sateDeservite, segmenteZi, kmInterval, PRAG_SAT_KM,
} from './etalon-labels.mjs';

/**
 * Capetele REALE ale unei curse: prima și ultima oprire stabilă care NU e baza.
 *
 * Nu primul/ultimul punct al urmei — acelea sunt casa șoferului, iar km-ii de acolo
 * până la prima stație sunt tocmai livrarea pe care o măsurăm. Ion, 17.09: «unde se
 * începe și se termină ruta după ultima și prima oprire stabilă față locul de trai la
 * șofer». Măsurat atunci: în 730 din 1.099 de cazuri capătul geometriei era la sub 1 km
 * de locul unde doarme mașina.
 */
function capeteReale(stops, pts, from, to) {
  const t0 = pts[from].t, t1 = pts[to].t;
  const inSegment = stops.filter((st) => !st.isBase && st.arrival >= t0 && st.arrival <= t1);
  if (!inSegment.length) return { prima: null, ultima: null };
  const pct = (st) => ({ lat: st.lat, lon: st.lon, locality: st.locality ?? null });
  return { prima: pct(inSegment[0]), ultima: pct(inSegment[inSegment.length - 1]) };
}

const norm = (s) => (s || '').toLowerCase()
  .replace(/ă|â/g, 'a').replace(/î/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't')
  .replace(/[-\s]+/g, ' ').trim();

/** Contextul unei zile: porți, atribuiri, granițe. Se încarcă o dată, nu per mașină. */
export async function incarcaContext(supa, day) {
  const [{ data: gates }, { data: atrib }, { data: granite }, { data: rute }] = await Promise.all([
    supa.from('lde_uzine_gates').select('uzina_id,label,lat,lon,radius_km').eq('active', true),
    supa.from('lde_atribuiri_zilnice')
      .select('factory_route_id,shift_number,slot,vehicle_id,vehicle_id_retur,direction,status')
      .eq('date', day).eq('route_kind', 'uzina').not('vehicle_id', 'is', null),
    supa.from('lde_uzina_shift_boundaries').select('uzina_id,shift_number,tip,minute_zi'),
    supa.from('lde_factory_routes').select('id,uzina_id,stops_in_order').eq('active', true),
  ]);
  const porti = new Map(), granitePeUz = new Map(), sateRuta = new Map();
  for (const g of gates ?? []) {
    if (!porti.has(g.uzina_id)) porti.set(g.uzina_id, []);
    porti.get(g.uzina_id).push({ ...g, lat: +g.lat, lon: +g.lon });
  }
  for (const b of granite ?? []) {
    if (!granitePeUz.has(b.uzina_id)) granitePeUz.set(b.uzina_id, []);
    // baza scrie minute_zi (snake_case), modulul pur așteaptă minuteZi — fără maparea
    // asta toate cursele ieșeau 'necunoscut', km_plin 0, km_gol 0.
    granitePeUz.get(b.uzina_id).push({ minuteZi: b.minute_zi, tip: b.tip, shift_number: b.shift_number });
  }
  for (const r of rute ?? []) sateRuta.set(r.id, (r.stops_in_order || '').replace(/->/g, '→').split('→').map((s) => norm(s)).filter(Boolean));
  // atribuirile mașinii, inclusiv cele unde e doar mașina de retur
  const peMasina = new Map();
  for (const a of atrib ?? []) {
    for (const vid of [a.vehicle_id, a.vehicle_id_retur]) {
      if (!vid) continue;
      if (!peMasina.has(vid)) peMasina.set(vid, []);
      peMasina.get(vid).push({ ...a, eRetur: vid === a.vehicle_id_retur && vid !== a.vehicle_id });
    }
  }
  return { porti, peMasina, granitePeUz, sateRuta };
}

/**
 * Scrie cursele unei mașini-zi + contribuția ei pe ziua GPS.
 * Idempotent: cursele de ZI se șterg și se rescriu pe (run_date, vehicle_id); cele de
 * noapte se COMPLETEAZĂ (upsert pe cheia cursei), fiindcă turul lor a fost scris de
 * rularea de ieri, ale cărei puncte nu mai sunt în memorie.
 */
export async function scrieCurse(supa, { vehicle_id, plate }, day, r, ctx) {
  const lista = ctx.peMasina.get(vehicle_id) ?? [];
  if (!lista.length || !r.pts || r.pts.length < 2) return { curse: 0 };
  const uz = lista[0].direction;
  const gts = ctx.porti.get(uz) ?? [];
  const granite = ctx.granitePeUz.get(uz) ?? [];

  const secv = secvente(r.pts, r.calc);
  const tr = treceriPorti(r.pts, secv, gts);
  const segs = segmenteZi(r.pts, r.calc, tr, granite);

  // contribuția pe ziua GPS — cheia e (mașină, zi GPS), diferită de cheia cursei
  const contrib = { km_plin: 0, km_gol: 0, km_necunoscut: 0 };
  for (const s of segs) {
    if (s.stare === 'plin') contrib.km_plin += s.km;
    else if (s.stare === 'gol') contrib.km_gol += s.km;
    else contrib.km_necunoscut += s.km;
  }
  await supa.from('lde_route_day_contrib').upsert({
    vehicle_id, gps_date: day,
    km_plin: +contrib.km_plin.toFixed(2), km_gol: +contrib.km_gol.toFixed(2),
    km_necunoscut: +contrib.km_necunoscut.toFixed(2),
    stare: 'ok', motiv: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'vehicle_id,gps_date' });

  if (!tr.length) {
    // n-a mers, sau GPS-ul a avut gaură? Două motive distincte, nu unul.
    const acoperire = r.calc.stepAccepted.filter(Boolean).length / r.pts.length;
    const motiv = acoperire < 0.8 ? 'gaura_semnal' : 'fara_trecere';
    for (const a of lista) {
      await supa.from('lde_route_run').upsert({
        run_date: day, factory_route_id: a.factory_route_id, shift_number: a.shift_number,
        slot: a.slot ?? 1, sens: a.eRetur ? 'retur' : 'tur', vehicle_id,
        stare: 'necunoscut', ambiguu: true, motiv,
      }, { onConflict: 'run_date,factory_route_id,shift_number,slot,sens' });
    }
    return { curse: 0, motiv };
  }

  // fiecare segment cu pasageri devine o cursă, legată de atribuirea din fereastra lui
  let scrise = 0;
  const declarate = new Set();
  for (const a of lista) for (const s of ctx.sateRuta.get(a.factory_route_id) ?? []) declarate.add(s);

  for (const s of segs) {
    if (s.stare === 'necunoscut' || s.km < 1) continue;
    const a = lista[Math.min(scrise, lista.length - 1)];
    const sate = sateDeservite(r.pts, ctx.placesIdx, s.from, s.to, PRAG_SAT_KM);
    const capete = capeteReale(r.stops ?? [], r.pts, s.from, s.to);
    const ale = ctx.sateRuta.get(a.factory_route_id) ?? [];
    const atinse = sate.filter((x) => ale.includes(norm(x)));
    await supa.from('lde_route_run').upsert({
      run_date: day, factory_route_id: a.factory_route_id, shift_number: a.shift_number,
      slot: a.slot ?? 1, sens: s.tip === 'apropiere' ? 'tur' : 'retur', vehicle_id,
      sate_atinse: sate, sate_lipsa: ale.filter((x) => !sate.map(norm).includes(x)),
      sate_extra: sate.filter((x) => !ale.includes(norm(x))),
      km_real: s.km, km_goi: s.stare === 'gol' ? s.km : 0,
      prima_statie: capete.prima, ultima_statie: capete.ultima,
      stare: s.stare, ambiguu: false, motiv: s.motiv,
      geom: simplifica(r.pts, r.calc, s.from, s.to),
    }, { onConflict: 'run_date,factory_route_id,shift_number,slot,sens' });
    scrise++;
  }
  return { curse: scrise, treceri: tr.length };
}

/** Rândul de statut când etichetarea a crăpat — „lipsă" și „eșec" nu arată la fel. */
export async function scrieEsec(supa, vehicle_id, day, motiv) {
  await supa.from('lde_route_day_contrib').upsert({
    vehicle_id, gps_date: day, km_plin: 0, km_gol: 0, km_necunoscut: 0,
    stare: 'esuat', motiv: String(motiv).slice(0, 300), updated_at: new Date().toISOString(),
  }, { onConflict: 'vehicle_id,gps_date' });
}
