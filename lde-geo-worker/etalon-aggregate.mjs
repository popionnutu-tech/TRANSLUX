// ============================================================================
// LDE — agregatorul: din cursele zilelor trecute, traseul ideal al fiecărei rute.
//
// Citește DOAR Supabase-ul nostru — zero interogări la trackerul furnizorului. De aceea
// poate fi pas separat în run-nightly.sh, după gps-worker.
//
//   node --env-file=.env etalon-aggregate.mjs [--write]
//
// Două lucruri se recalculează:
//  1. Granițele de schimb ale fiecărei uzine — VALOAREA se învață din plecările de la
//     poartă, ETICHETA (sfârșit al lui N / început al lui N+1) rămâne din orarul declarat.
//     O grupare nu se poate numerota singură: Draxelmaier are 2 schimburi și 3 granițe.
//  2. Etalonul fiecărei (rută × schimb × slot × sens).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { WebSocket as WS } from 'ws';
import { hav } from './km-core.mjs';
import { invataGranite, minuteZiLocal } from './etalon-labels.mjs';
globalThis.WebSocket = globalThis.WebSocket || WS;

const WRITE = process.argv.includes('--write');
export const FEREASTRA_ZILE = 60;      // = plafonul de agregare din plan
export const PRAG_SAT = 0.60;          // un sat intră în etalon dacă apare în ≥60% din curse
export const MIN_OBSERVATII = 5;       // sub el: „etalon insuficient", km NULL
const TOLERANTA_GRANITA_MIN = 90;      // cât de departe de cea declarată mai e aceeași graniță

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// PostgREST taie TĂCUT la 1000 de rânduri. Fereastra de 60 de zile × ~163 curse/zi ≈ 9.800,
// deci fără paginare etalonul s-ar recalcula în fiecare noapte dintr-o felie de ~6 zile.
async function fetchAll(table, select, aplica = (q) => q) {
  const out = []; const pas = 1000;
  for (let de = 0; ; de += pas) {
    const { data, error } = await aplica(supa.from(table).select(select)).range(de, de + pas - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pas) break;
  }
  return out;
}

const zi = (d) => d.toISOString().slice(0, 10);
const deLa = zi(new Date(Date.now() - FEREASTRA_ZILE * 86400000));

// ── 1. granițele ──────────────────────────────────────────────────────────────
async function recalculeazaGranite() {
  const gates = await fetchAll('lde_uzine_gates', 'uzina_id,lat,lon,radius_km', (q) => q.eq('active', true));
  const declarate = await fetchAll('lde_uzina_shift_boundaries', 'uzina_id,shift_number,tip,minute_declarat');
  const opriri = await fetchAll('lde_gps_stops', 'lat,lon,departure_at', (q) => q.gte('date', deLa).not('departure_at', 'is', null));

  const plecariPeUz = new Map();
  for (const o of opriri) {
    const p = { lat: +o.lat, lon: +o.lon };
    for (const g of gates) {
      if (hav(p, { lat: +g.lat, lon: +g.lon }) <= Number(g.radius_km ?? 0.6)) {
        if (!plecariPeUz.has(g.uzina_id)) plecariPeUz.set(g.uzina_id, []);
        plecariPeUz.get(g.uzina_id).push(new Date(o.departure_at));
        break;
      }
    }
  }

  let invatate = 0, respinse = 0;
  for (const d of declarate) {
    const pl = plecariPeUz.get(d.uzina_id) ?? [];
    const grupuri = invataGranite(pl);
    // se caută gruparea cea mai apropiată de granița DECLARATĂ — eticheta nu se ghicește
    let best = null, bd = Infinity;
    for (const g of grupuri) {
      if (g.minuteZi == null) continue;
      const x = Math.abs(g.minuteZi - d.minute_declarat);
      const dist = Math.min(x, 1440 - x);
      if (dist < bd) { bd = dist; best = g; }
    }
    const rand = best && bd <= TOLERANTA_GRANITA_MIN
      ? { minute_zi: best.minuteZi, observations: best.n, sursa: 'invatat', motiv: null }
      : { minute_zi: d.minute_declarat, observations: 0, sursa: 'declarat',
          motiv: grupuri.some((g) => g.motiv === 'program_schimbat') ? 'program_schimbat' : 'fără grupare aproape' };
    if (rand.sursa === 'invatat') invatate++; else respinse++;
    console.log(`  ${d.uzina_id.padEnd(20)} s${d.shift_number} ${d.tip.padEnd(8)} declarat ${String(d.minute_declarat).padStart(4)} → ${String(rand.minute_zi).padStart(4)} (${rand.sursa}${rand.observations ? `, n=${rand.observations}` : ''}${rand.motiv ? `, ${rand.motiv}` : ''})`);
    if (WRITE) await supa.from('lde_uzina_shift_boundaries').update({ ...rand, updated_at: new Date().toISOString() })
      .eq('uzina_id', d.uzina_id).eq('shift_number', d.shift_number).eq('tip', d.tip);
  }
  console.log(`granițe: ${invatate} învățate, ${respinse} rămase pe orarul declarat\n`);
}

// ── 2. etalonul ───────────────────────────────────────────────────────────────
const cheie = (r) => `${r.factory_route_id}|${r.shift_number}|${r.slot}|${r.sens}`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function recalculeazaEtalon() {
  const curse = await fetchAll('lde_route_run',
    'factory_route_id,shift_number,slot,sens,sate_atinse,km_real,ambiguu,stare,geom,run_date',
    (q) => q.gte('run_date', deLa).eq('ambiguu', false));

  const peCheie = new Map();
  for (const c of curse) {
    if (c.stare === 'necunoscut') continue;
    const k = cheie(c);
    if (!peCheie.has(k)) peCheie.set(k, []);
    peCheie.get(k).push(c);
  }

  let scrise = 0, insuficiente = 0;
  for (const [k, lista] of peCheie) {
    const [factory_route_id, shift_number, slot, sens] = k.split('|');
    const n = lista.length;
    const frecv = new Map();
    for (const c of lista) for (const s of new Set(c.sate_atinse ?? [])) frecv.set(s, (frecv.get(s) ?? 0) + 1);
    const sate = [...frecv.entries()]
      .filter(([, f]) => f / n >= PRAG_SAT)
      .map(([nume, f]) => ({ nume, pondere: +(f / n).toFixed(2) }))
      .sort((a, b) => b.pondere - a.pondere);

    const kmuri = lista.map((c) => Number(c.km_real)).filter((x) => x > 0);
    const kmMed = median(kmuri);

    // geometria reprezentativă: diferență simetrică minimă față de setul-etalon;
    // la egalitate km-ul cel mai aproape de mediană; la egalitate cursa cea mai recentă.
    // NU „setul coincide" — etalonul e o mulțime construită (satele cu ≥60%), iar
    // pe rutele dese nicio cursă n-are exact setul ăla.
    const setEtalon = new Set(sate.map((s) => s.nume));
    let geom = null, motivLipsa = null;
    if (n >= MIN_OBSERVATII) {
      const cuGeom = lista.filter((c) => c.geom);
      if (cuGeom.length) {
        const scor = (c) => {
          const s = new Set(c.sate_atinse ?? []);
          let dif = 0;
          for (const x of setEtalon) if (!s.has(x)) dif++;
          for (const x of s) if (!setEtalon.has(x)) dif++;
          return dif;
        };
        cuGeom.sort((a, b) => scor(a) - scor(b)
          || Math.abs(Number(a.km_real) - kmMed) - Math.abs(Number(b.km_real) - kmMed)
          || String(b.run_date).localeCompare(String(a.run_date)));
        geom = cuGeom[0].geom;
      } else motivLipsa = 'nicio cursă cu geometrie';
    } else { motivLipsa = 'etalon insuficient'; insuficiente++; }

    if (WRITE) await supa.from('lde_route_etalon').upsert({
      factory_route_id, shift_number: +shift_number, slot: +slot, sens,
      sate, geom, km_median: n >= MIN_OBSERVATII ? kmMed : null,
      observations: n, source: 'gps_trace', motiv_lipsa: motivLipsa,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'factory_route_id,shift_number,slot,sens' });
    scrise++;
  }
  console.log(`etalon: ${scrise} combinații rută×schimb×slot×sens, din care ${insuficiente} sub pragul de ${MIN_OBSERVATII} curse`);
  console.log(`curse citite: ${curse.length} (fereastră ${FEREASTRA_ZILE} zile, de la ${deLa})`);
}

console.log(`\n===== etalon-aggregate ${WRITE ? '(SCRIE)' : '(probă)'} · fereastră ${FEREASTRA_ZILE} zile =====\n`);
await recalculeazaGranite();
await recalculeazaEtalon();
