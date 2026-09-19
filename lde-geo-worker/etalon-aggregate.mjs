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
    // granița DECLARATĂ numește ora; aici i se măsoară valoarea, în fereastra ei
    const g = invataGranite(pl, d.minute_declarat, { fereastraMin: TOLERANTA_GRANITA_MIN });
    const rand = g.minuteZi != null
      ? { minute_zi: g.minuteZi, observations: g.n, sursa: 'invatat', motiv: null }
      : { minute_zi: d.minute_declarat, observations: 0, sursa: 'declarat', motiv: g.motiv };
    if (rand.sursa === 'invatat') invatate++; else respinse++;
    console.log(`  ${d.uzina_id.padEnd(20)} s${d.shift_number} ${d.tip.padEnd(8)} declarat ${String(d.minute_declarat).padStart(4)} → ${String(rand.minute_zi).padStart(4)} (${rand.sursa}${rand.observations ? `, n=${rand.observations}` : ''}${rand.motiv ? `, ${rand.motiv}` : ''})`);
    if (WRITE) await supa.from('lde_uzina_shift_boundaries').update({ ...rand, updated_at: new Date().toISOString() })
      .eq('uzina_id', d.uzina_id).eq('shift_number', d.shift_number).eq('tip', d.tip);
  }
  console.log(`granițe: ${invatate} învățate, ${respinse} rămase pe orarul declarat\n`);
}

// ── 2. etalonul ───────────────────────────────────────────────────────────────
const cheie = (r) => `${r.factory_route_id}|${r.shift_number}|${r.slot}|${r.sens}`;
const norm = (x) => (x || '').toLowerCase()
  .replace(/ă|â/g, 'a').replace(/î/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't')
  .replace(/[-\s]+/g, ' ').trim();
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

async function recalculeazaEtalon() {
  const curse = await fetchAll('lde_route_run',
    'factory_route_id,shift_number,slot,sens,sate_atinse,km_real,ambiguu,stare,geom,run_date,prima_statie,ultima_statie',
    (q) => q.gte('run_date', deLa).eq('ambiguu', false));

  const peCheie = new Map();
  for (const c of curse) {
    if (c.stare === 'necunoscut') continue;
    const k = cheie(c);
    if (!peCheie.has(k)) peCheie.set(k, []);
    peCheie.get(k).push(c);
  }

  let scrise = 0, insuficiente = 0, abateri = 0;
  const chei = new Set();
  for (const [k, lista] of peCheie) {
    const [factory_route_id, shift_number, slot, sens] = k.split('|');
    const n = lista.length;
    // Satele se ordonează DUPĂ TRASEU, nu după cât de des apar. `sate_atinse` e deja în
    // ordinea în care mașina a intrat în raza fiecăruia, deci poziția unui sat într-o cursă
    // e indicele lui acolo; peste curse se ia mediana. Ordonarea după pondere (cum era
    // până acum) punea prima localitatea cea mai des atinsă — de obicei orașul uzinei,
    // adică ULTIMA de pe drum — și inversa citirea traseului pe pagină. Contează dincolo
    // de afișare: capătul etalonului e «prima stație», iar pe el se socotesc costurile.
    const frecv = new Map();
    const pozitii = new Map();
    for (const c of lista) {
      const ale = c.sate_atinse ?? [];
      const vazute = new Set();
      for (let i = 0; i < ale.length; i++) {
        const sat = ale[i];
        if (vazute.has(sat)) continue;          // un sat traversat și la dus, și la întors
        vazute.add(sat);                        // contează o dată, cu prima lui poziție
        frecv.set(sat, (frecv.get(sat) ?? 0) + 1);
        if (!pozitii.has(sat)) pozitii.set(sat, []);
        pozitii.get(sat).push(i);
      }
    }
    const sate = [...frecv.entries()]
      .filter(([, f]) => f / n >= PRAG_SAT)
      .map(([nume, f]) => ({ nume, pondere: +(f / n).toFixed(2), poz: median(pozitii.get(nume)) }))
      .sort((a, b) => a.poz - b.poz || b.pondere - a.pondere)
      .map(({ nume, pondere }) => ({ nume, pondere }));

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

    // Fără etalon solid nu există „sate lipsă": se golesc, ca să nu rămână pe pagină
    // valorile vechi, socotite față de numele rutei — două înțelesuri în aceeași coloană.
    if (WRITE && (kmMed == null || n < MIN_OBSERVATII)) {
      for (const c of lista) {
        await supa.from('lde_route_run')
          .update({ sate_lipsa: [], sate_extra: [], km_etalon: null, abatere_km: null })
          .eq('run_date', c.run_date).eq('factory_route_id', factory_route_id)
          .eq('shift_number', +shift_number).eq('slot', +slot).eq('sens', sens);
      }
    }

    // Capetele reale: stația care SE REPETĂ, nu mediana coordonatelor.
    // Ion, 17.09: «chiar dacă prima și ultima oprire e greșită, în ideal ea se repetă».
    // Are dreptate, și e mai tare decât mediana: media a două stații reale aflate la 3 km
    // una de alta cade la mijloc, unde nu oprește nimeni. Ziua în care mașina a oprit
    // aiurea rămâne un grup de unu și pierde; stația adevărată câștigă prin repetiție.
    // Grupare simplă la 500 m; reprezentantul e punctul observat cel mai apropiat de
    // centrul grupului (un punct REAL, nu unul calculat).
    const RAZA_GRUP_KM = 0.5;
    const modaPct = (camp) => {
      const v = lista.map((c) => c[camp]).filter((x) => x && x.lat != null)
        .map((x) => ({ lat: Number(x.lat), lon: Number(x.lon), locality: x.locality ?? null }));
      if (!v.length) return null;
      const grupuri = [];
      for (const p of v) {
        const g = grupuri.find((gr) => hav(gr[0], p) <= RAZA_GRUP_KM);
        if (g) g.push(p); else grupuri.push([p]);
      }
      grupuri.sort((a, b) => b.length - a.length);
      const g = grupuri[0];
      const cx = g.reduce((s, p) => s + p.lat, 0) / g.length;
      const cy = g.reduce((s, p) => s + p.lon, 0) / g.length;
      const medoid = g.reduce((b, p) => (hav(p, { lat: cx, lon: cy }) < hav(b, { lat: cx, lon: cy }) ? p : b), g[0]);
      return { ...medoid, pondere: +(g.length / v.length).toFixed(2), observatii: g.length };
    };

    if (WRITE) await supa.from('lde_route_etalon').upsert({
      factory_route_id, shift_number: +shift_number, slot: +slot, sens,
      prima_statie: modaPct('prima_statie'), ultima_statie: modaPct('ultima_statie'),
      sate, geom, km_median: n >= MIN_OBSERVATII ? kmMed : null,
      observations: n, source: 'gps_trace', motiv_lipsa: motivLipsa,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'factory_route_id,shift_number,slot,sens' });

    // Abaterea se scrie ÎNAPOI pe curse. Worker-ul de noapte nu poate: când scrie cursa,
    // etalonul ei încă nu există — se naște abia din ea și din celelalte. Fără pasul ăsta
    // `km_etalon` și `abatere_km` rămâneau NULL pe toate cele 2.829 de curse, iar pagina
    // arăta «abatere medie: —» pe tot tabelul, adică funcția cerută de la bun început
    // («să vedem devierile de la traseu») nu producea nimic.
    // Sub pragul de observații NU se scrie o cifră: un etalon dintr-o singură cursă ar
    // declara-o pe ea însăși «fără abatere», iar pe a doua «abatere mare».
    if (WRITE && kmMed != null && n >= MIN_OBSERVATII) {
      for (const c of lista) {
        const km = Number(c.km_real);
        if (!(km > 0)) continue;
        // Satele lipsă/în plus se socot față de ETALON, nu față de numele rutei.
        // Ion, 17.09: «denumirea rutei e 1-2 sate, de obicei cursa e mai lungă, cu mai
        // multe sate». Măsurat: 33 din 111 rute sunt numite cu două sate, iar drumul
        // real trece prin 18,8 în medie; pe toată flota, 2-9 nume față de 13-19 sate.
        // Comparate cu numele, aproape toate satele reale ieșeau „în plus" și abaterea
        // nu însemna nimic. Etalonul e singurul etalon: ce face ruta de obicei.
        const pe = new Set((c.sate_atinse ?? []).map(norm));
        const lipsa = sate.filter((x) => !pe.has(norm(x.nume))).map((x) => x.nume);
        const inEtalon = new Set(sate.map((x) => norm(x.nume)));
        const extra = (c.sate_atinse ?? []).filter((x) => !inEtalon.has(norm(x)));
        await supa.from('lde_route_run')
          .update({
            km_etalon: kmMed, abatere_km: +(km - kmMed).toFixed(2),
            sate_lipsa: lipsa, sate_extra: extra,
          })
          .eq('run_date', c.run_date).eq('factory_route_id', factory_route_id)
          .eq('shift_number', +shift_number).eq('slot', +slot).eq('sens', sens);
        abateri++;
      }
    }
    chei.add(k);
    scrise++;
  }

  // Etaloanele rămase FĂRĂ dovadă în fereastră se șterg. Upsert-ul singur nu le atinge:
  // el suprascrie doar cheile care au curse acum, iar o cheie care nu mai produce curse
  // (ruta a fost oprită, sau cursele ei au devenit `ambiguu` după o corectare de logică)
  // rămânea pe pagină cu traseul și km-ii unei logici care nu mai există. Găsit pe ruta
  // 14 Draxelmaier: etalonul arăta un lanț de 17 sate, deși toate cursele ei din
  // fereastră erau marcate ambigue și niciuna nu intrase în calcul.
  if (WRITE) {
    const vechi = await fetchAll('lde_route_etalon', 'factory_route_id,shift_number,slot,sens');
    let sterse = 0;
    for (const e of vechi) {
      if (chei.has(cheie(e))) continue;
      await supa.from('lde_route_etalon').delete()
        .eq('factory_route_id', e.factory_route_id).eq('shift_number', e.shift_number)
        .eq('slot', e.slot).eq('sens', e.sens);
      sterse++;
    }
    if (sterse) console.log(`etalon: ${sterse} combinații șterse — nicio cursă neambiguă în fereastră`);
  }
  console.log(`etalon: ${scrise} combinații rută×schimb×slot×sens, din care ${insuficiente} sub pragul de ${MIN_OBSERVATII} curse`);
  console.log(`abateri scrise pe curse: ${abateri}`);
  console.log(`curse citite: ${curse.length} (fereastră ${FEREASTRA_ZILE} zile, de la ${deLa})`);
}

/**
 * BRAMBURA — Ion, 19.09: «ceva ieșit din comun, unic». Nu se desparte geometric de navetă
 * (drumul lui Vartic la Chișinău trece pe lângă casa lui din Orhei; naveta lui Popescu
 * trece prin Orhei, departe și de casă, și de rută), ci se citește ca EXCES: km-ii din
 * afara rutei ai unei zile, peste ce face aceeași mașină într-o zi obișnuită (mediana
 * zilelor ei din fereastră), cu o marjă. Excesul se pune pe cursa cu cei mai mulți km în
 * afara rutei din ziua aia; restul curselor zilei primesc 0. `km_brambura` e subset al
 * `km_livrare`: naveta = livrare − brambura.
 */
const MARJA_BRAMBURA_KM = 15;
const MIN_ZILE_BRAMBURA = 5;    // sub atâtea zile nu există „obișnuit"
async function recalculeazaBrambura() {
  const curse = await fetchAll('lde_route_run', 'id,run_date,vehicle_id,km_livrare,km_brambura',
    (q) => q.gte('run_date', deLa).not('km_real', 'is', null));
  const peZi = new Map();
  for (const c of curse) {
    const k = `${c.vehicle_id}|${c.run_date}`;
    if (!peZi.has(k)) peZi.set(k, { vehicle_id: c.vehicle_id, suma: 0, curse: [] });
    const z = peZi.get(k); z.suma += Number(c.km_livrare) || 0; z.curse.push(c);
  }
  const peMasina = new Map();
  for (const z of peZi.values()) {
    if (!peMasina.has(z.vehicle_id)) peMasina.set(z.vehicle_id, []);
    peMasina.get(z.vehicle_id).push(z);
  }
  let zileCuExces = 0, scrise = 0;
  for (const zile of peMasina.values()) {
    const med = zile.length >= MIN_ZILE_BRAMBURA ? median(zile.map((z) => z.suma)) : null;
    for (const z of zile) {
      const exces = med == null ? 0 : Math.max(0, z.suma - med - MARJA_BRAMBURA_KM);
      const varf = z.curse.reduce((b, c) => (Number(c.km_livrare) > Number(b.km_livrare) ? c : b));
      if (exces > 0) zileCuExces++;
      for (const c of z.curse) {
        const val = c === varf ? +Math.min(exces, Number(c.km_livrare) || 0).toFixed(2) : 0;
        if (Math.abs(val - (Number(c.km_brambura) || 0)) < 0.01) continue;
        if (WRITE) await supa.from('lde_route_run').update({ km_brambura: val }).eq('id', c.id);
        scrise++;
      }
    }
  }
  console.log(`brambura: ${zileCuExces} zile-mașină cu exces peste mediană + ${MARJA_BRAMBURA_KM} km; ${scrise} curse actualizate`);
}

console.log(`\n===== etalon-aggregate ${WRITE ? '(SCRIE)' : '(probă)'} · fereastră ${FEREASTRA_ZILE} zile =====\n`);
await recalculeazaGranite();
await recalculeazaEtalon();
/**
 * SATUL DE START REAL al rutei — Ion, 19.09: «dacă se întâmplă sistematic, zilnic, e rută;
 * scrii sub denumirea rutei primul sat de unde urcă». Nomenclatorul numește ruta după un
 * sat care nu e mereu capătul (2 «Cișmea» pleacă zilnic din Ocnița-Răzeși, 18 «Telenești»
 * din Mîndrești). Se ia, pe fiecare rută, satul cel mai depărtat pe traseu în care
 * autobuzul OPREȘTE în cel puțin 60% din tururi — fără satul de casă al șoferului, care
 * e oprire zilnică fără să fie stație. Worker-ul taie livrarea acolo la rularea următoare.
 */
const COTA_START_REAL = 0.6;
async function recalculeazaStartReal() {
  const tururi = await fetchAll('lde_route_run', 'factory_route_id,vehicle_id,sate_oprire',
    (q) => q.gte('run_date', deLa).eq('sens', 'tur').gt('km_real', 0).not('sate_oprire', 'is', null));
  const nopti = await fetchAll('lde_gps_stops', 'vehicle_id,locality',
    (q) => q.gte('date', deLa).eq('is_base', true).not('locality', 'is', null));
  const casaMasinii = new Map();
  { const n = new Map();
    for (const s of nopti) { const k = `${s.vehicle_id}|${norm(s.locality)}`; n.set(k, (n.get(k) ?? 0) + 1); }
    for (const [k, c] of n) { const [v, loc] = k.split('|'); if (!casaMasinii.has(v) || casaMasinii.get(v).c < c) casaMasinii.set(v, { loc, c }); } }
  const peRuta = new Map();
  for (const t of tururi) {
    if (!peRuta.has(t.factory_route_id)) peRuta.set(t.factory_route_id, { n: 0, pozitii: new Map(), nume: new Map() });
    const r = peRuta.get(t.factory_route_id); r.n++;
    const casa = casaMasinii.get(t.vehicle_id)?.loc;
    const vazute = new Set();
    (t.sate_oprire ?? []).forEach((s, i) => {
      const k = norm(s);
      if (!k || k === casa || vazute.has(k)) return;
      vazute.add(k);
      if (!r.pozitii.has(k)) { r.pozitii.set(k, []); r.nume.set(k, s); }
      r.pozitii.get(k).push(i);
    });
  }
  let scrise = 0;
  const rute = await fetchAll('lde_factory_routes', 'id', (q) => q.eq('active', true));
  for (const { id } of rute) {
    const r = peRuta.get(id);
    let ales = null;
    if (r && r.n >= MIN_OBSERVATII) {
      let bestPoz = Infinity;
      for (const [k, poz] of r.pozitii) {
        if (poz.length / r.n < COTA_START_REAL) continue;
        const m = median(poz);
        if (m < bestPoz) { bestPoz = m; ales = r.nume.get(k); }
      }
    }
    if (WRITE) await supa.from('lde_route_etalon').update({ sat_start_real: ales }).eq('factory_route_id', id);
    if (ales) scrise++;
  }
  console.log(`start real: ${scrise} rute cu sat de start dedus din opriri (≥${COTA_START_REAL * 100}% din tururi)`);
}

// ordinea contează: startul real se deduce din cursele scrise azi și îl folosește worker-ul
// de mâine; brambura se judecă pe naveta deja scrisă
await recalculeazaStartReal();
await recalculeazaBrambura();
