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
import { hav } from './km-core.mjs';
import {
  secvente, treceriPorti, sateDeservite, segmenteZi, imperecheazaTreceri,
  opririScurte, kmInterval, PRAG_SAT_KM,
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
  if (!inSegment.length) return { prima: null, ultima: null, iPrima: null, iUltima: null };
  const pct = (st) => ({ lat: st.lat, lon: st.lon, locality: st.locality ?? null });
  // indicele punctului la care mașina a ajuns în stație — de acolo începe cursa cu pasageri
  const idx = (st) => {
    for (let i = from; i <= to; i++) if (pts[i].t >= st.arrival) return i;
    return to;
  };
  const p = inSegment[0], u = inSegment[inSegment.length - 1];
  return { prima: pct(p), ultima: pct(u), iPrima: idx(p), iUltima: idx(u) };
}

/**
 * LIVRAREA: drumul gol dintre casa șoferului și capătul rutei.
 *
 * E lucrul pe care Ion l-a cerut din prima frază — «să minimizăm livrarea» — și tocmai el
 * NU se socotea: segmentul de dimineață începe de acasă, deci km-ii casă → prima stație
 * stăteau ascunși în `km_real` al cursei pline. Măsurat pe 01-17.09: circa 1.000 km/zi pe
 * flotă, din care 431 la Draxelmaier și 335 la Orhei. Orhei părea că are 3% gol, fiindcă
 * nu merge acasă între ture (3 schimburi la rând) — dar tot pleacă de acasă dimineața și
 * se întoarce seara.
 *
 * Tăietura e la prima (respectiv ultima) oprire stabilă care nu e baza: înainte de ea
 * mașina merge goală după oameni, după ea îi duce. La segmentele de peste zi bucata iese
 * zero, fiindcă ele încep deja în sat sau la poartă — deci regula se aplică uniform, fără
 * cazuri speciale.
 */
/**
 * Golul care trece pe ACASĂ — partea optimizabilă prin repartizare.
 *
 * Ion, 18.09: «trebuie să facem distincție între km goi care pot fi optimizați și goi care
 * nu pot fi optimizați». Un drum gol de la poartă înapoi în zona de unde se iau oamenii
 * schimbului următor e impus de felul în care uzina își împarte rutele — noi nu-l putem
 * tăia fără să tăiem serviciul. Un drum gol care trece pe la casa șoferului ține de
 * REPARTIZARE: cine stă lângă poartă îl face scurt, cine stă departe îl face lung.
 */
function golPrinCasa(seg, pts, calc, baze, razaKm = 1.0) {
  if (seg.stare !== 'gol' || !baze.length) return 0;
  let km = 0;
  for (let i = seg.from + 1; i <= seg.to; i++)
    if (baze.some((b) => hav(pts[i], b) <= razaKm)) km += calc.stepKm[i];
  return +km.toFixed(2);
}

function taieLivrarea(seg, capete, calc) {
  if (seg.stare !== 'plin' || !capete) return null;
  const i = seg.tip === 'apropiere' ? capete.iPrima : capete.iUltima;
  if (i == null || i <= seg.from || i >= seg.to) return null;
  return seg.tip === 'apropiere'
    ? { livrare: kmInterval(calc.stepKm, seg.from, i), plin: kmInterval(calc.stepKm, i, seg.to) }
    : { livrare: kmInterval(calc.stepKm, i, seg.to), plin: kmInterval(calc.stepKm, seg.from, i) };
}

const norm = (s) => (s || '').toLowerCase()
  .replace(/ă|â/g, 'a').replace(/î/g, 'i').replace(/ș|ş/g, 's').replace(/ț|ţ/g, 't')
  .replace(/[-\s]+/g, ' ').trim();

/** Contextul unei zile: porți, atribuiri, granițe. Se încarcă o dată, nu per mașină. */
export async function incarcaContext(supa, day) {
  const [{ data: gates }, { data: atrib }, { data: granite }, { data: rute }, { data: etaloane }] = await Promise.all([
    supa.from('lde_uzine_gates').select('uzina_id,label,lat,lon,radius_km').eq('active', true),
    supa.from('lde_atribuiri_zilnice')
      .select('factory_route_id,shift_number,slot,vehicle_id,vehicle_id_retur,direction,status')
      .eq('date', day).eq('route_kind', 'uzina').not('vehicle_id', 'is', null),
    supa.from('lde_uzina_shift_boundaries').select('uzina_id,shift_number,tip,minute_zi'),
    supa.from('lde_factory_routes').select('id,uzina_id,stops_in_order').eq('active', true),
    // Satele ETALON ale fiecărei rute — ce face ruta de obicei, nu cum se numește.
    // Ion, 17.09: «denumirea rutei e 1-2 sate, de obicei cursa e mai lungă». Numele dă un
    // semnal slab când trebuie spus a cui e cursa (33 de rute au două nume, drumul real
    // trece prin 18,8 sate); etalonul dă treisprezece-nouăsprezece. Se ia doar etalonul
    // cu ≥5 observații, construit DOAR din curse neambigue — deci nu se hrănește din
    // propriile lui ghiciri.
    supa.from('lde_route_etalon').select('factory_route_id,sate,observations').gte('observations', 5),
  ]);
  const porti = new Map(), granitePeUz = new Map(), sateRuta = new Map(), uzinaRutei = new Map();
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
  for (const r of rute ?? []) uzinaRutei.set(r.id, r.uzina_id);
  for (const r of rute ?? []) sateRuta.set(r.id, (r.stops_in_order || '').replace(/->/g, '→').split('→').map((s) => norm(s)).filter(Boolean));
  const sateEtalon = new Map();
  for (const e of etaloane ?? []) {
    const nume = (e.sate ?? []).map((x) => norm(x.nume)).filter(Boolean);
    if (!nume.length) continue;
    const ex = sateEtalon.get(e.factory_route_id);
    // o rută are etalon pe fiecare schimb×slot×sens; pentru «a cui e cursa» ajunge reuniunea
    sateEtalon.set(e.factory_route_id, ex ? [...new Set([...ex, ...nume])] : nume);
  }
  // atribuirile mașinii, inclusiv cele unde e doar mașina de retur
  const peMasina = new Map();
  for (const a of atrib ?? []) {
    for (const vid of [a.vehicle_id, a.vehicle_id_retur]) {
      if (!vid) continue;
      if (!peMasina.has(vid)) peMasina.set(vid, []);
      peMasina.get(vid).push({ ...a, eRetur: vid === a.vehicle_id_retur && vid !== a.vehicle_id });
    }
  }
  return { porti, peMasina, granitePeUz, sateRuta, sateEtalon, uzinaRutei };
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
  // UZINELE mașinii, nu prima dintre ele. Ion, 17.09: «schimburile nu pot fi interzise,
  // ele sunt planificate de client; dacă vorbim de Draxelmaier, el are 2 uzine». Măsurat:
  // 29 de mașini-zile din 16 au atribuiri la DOUĂ uzine, iar codul lua porțile doar de la
  // prima — deci la cealaltă nu vedea nicio trecere și toată ziua ieșea „necunoscut".
  // 9.651 km din 13.089 se pierdeau exact așa (74%). Cazul găsit: 283BRAT pe 16.09, cu
  // Ungheni #3 prima în listă și Orhei #15 lucrată efectiv — 586 km, toți necunoscuți.
  const uzine = [...new Set(lista.map((a) => ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction).filter(Boolean))];
  const gts = uzine.flatMap((u) => ctx.porti.get(u) ?? []);

  // Ziua se rescrie de la zero pentru mașina asta. Fără ștergere, o re-rulare după o
  // corecție de segmentare lasă în urmă cursele pe care noul calcul NU le mai produce —
  // și ele rămân în fereastra de 60 de zile a etalonului, cu km și abateri de la o logică
  // care nu mai există. Ștergerea e pe (zi, mașină), cheie pe care worker-ul o DEȚINE.
  // Cursele de noapte ale zilei de IERI nu sunt atinse: ele poartă run_date = ieri, iar
  // rularea de azi le completează prin upsert, nu le rescrie.
  await supa.from('lde_route_run').delete().eq('run_date', day).eq('vehicle_id', vehicle_id);

  const secv = secvente(r.pts, r.calc);
  const tr = treceriPorti(r.pts, secv, gts);

  // Împerecherea se face PE FIECARE UZINĂ: fiecare poartă are orarul ei, iar o atingere
  // la Orhei nu poate primi rolul unui schimb de la Ungheni. Capacitatea unui (schimb,
  // rol) = câte rute are mașina în schimbul ăla la uzina aia — o mașină cu două rute în
  // același schimb face două livrări și două ridicări.
  const perechi = tr.map(() => ({ livrare: null, ridicare: null }));
  for (const u of uzine) {
    const indici = tr.map((t, i) => ({ t, i })).filter((x) => x.t.uzina_id === u);
    if (!indici.length) continue;
    const aleUzinei = lista.filter((a) => (ctx.uzinaRutei.get(a.factory_route_id) ?? a.direction) === u);
    const shifturi = [...new Set(aleUzinei.map((a) => a.shift_number).filter((x) => x != null))];
    const capacitate = new Map();
    for (const sh of shifturi)
      capacitate.set(String(sh), new Set(aleUzinei.filter((a) => a.shift_number === sh)
        .map((a) => a.factory_route_id)).size);
    const p = imperecheazaTreceri(indici.map((x) => x.t), ctx.granitePeUz.get(u) ?? [], shifturi, undefined, capacitate);
    indici.forEach((x, k) => { perechi[x.i] = p[k]; });
  }
  const segs = segmenteZi(r.pts, r.calc, tr, perechi);

  // contribuția pe ziua GPS — cheia e (mașină, zi GPS), diferită de cheia cursei
  // Livrarea (casă ↔ capătul rutei) se scade din plin și se adună la gol — altfel ea
  // rămâne ascunsă în cursa cu pasageri, iar cifra care trebuie micșorată nu se vede.
  const contrib = { km_plin: 0, km_gol: 0, km_necunoscut: 0, km_livrare: 0, km_gol_acasa: 0 };
  const bazeP = (r.stops ?? []).filter((st) => st.isBase).map((st) => ({ lat: st.lat, lon: st.lon }));
  for (const s of segs) {
    if (s.stare === 'plin') {
      const t = taieLivrarea(s, capeteReale(r.stops ?? [], r.pts, s.from, s.to), r.calc);
      if (t) { contrib.km_plin += t.plin; contrib.km_gol += t.livrare; contrib.km_livrare += t.livrare; }
      else contrib.km_plin += s.km;
    } else if (s.stare === 'gol') {
      contrib.km_gol += s.km;
      contrib.km_gol_acasa += golPrinCasa(s, r.pts, r.calc, bazeP);
    }
    else contrib.km_necunoscut += s.km;
  }
  await supa.from('lde_route_day_contrib').upsert({
    vehicle_id, gps_date: day,
    km_plin: +contrib.km_plin.toFixed(2), km_gol: +contrib.km_gol.toFixed(2),
    km_necunoscut: +contrib.km_necunoscut.toFixed(2),
    km_livrare: +contrib.km_livrare.toFixed(2),
    km_gol_acasa: +contrib.km_gol_acasa.toFixed(2),
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

  // ── de la segmente la CURSE ────────────────────────────────────────────────
  // O cursă are un sens și un singur drum cu pasageri. Ziua unui schimb are patru
  // segmente, nu două, și ele se împerechează câte două:
  //
  //   tur   = apropierea PLINĂ (aduce oamenii) + plecarea GOALĂ de după ea
  //   retur = apropierea GOALĂ (vine să-i ia)  + plecarea PLINĂ cu ei acasă
  //
  // Varianta dinainte scria fiecare segment ca pe o cursă separată, iar cheia cursei
  // are un singur rând pe (zi, rută, schimb, slot, sens): segmentul gol se scria PESTE
  // cel plin. De acolo veneau cele 545 de curse de „tur" marcate `gol` — nu era mașina
  // care mergea goală spre uzină, era drumul plin suprascris de repoziționare. Se vedea
  // și în numere: 366 de segmente scrise, 264 de rânduri rămase.
  let scrise = 0;

  const peSchimb = new Map();
  for (const a of lista) {
    if (a.shift_number == null) continue;
    if (!peSchimb.has(a.shift_number)) peSchimb.set(a.shift_number, []);
    peSchimb.get(a.shift_number).push(a);
  }

  // poarta uzinei și baza șoferului nu spun nimic despre cursă: staționarea de la poartă
  // e 17-51 de minute, iar acasă mașina stă ore
  const baze = (r.stops ?? []).filter((st) => st.isBase).map((st) => ({ lat: st.lat, lon: st.lon, raza: 0.5 }));
  const deSarit = (seg) => [...baze, seg.gate ? { lat: +seg.gate.lat, lon: +seg.gate.lon, raza: 1.0 } : null];
  // «în sat» = la cel mult 500 m de o localitate cunoscută. Nu 2 km (pragul de etichetare):
  // aproape orice punct din Moldova e la 2 km de ceva, deci n-ar despărți nimic.
  const RAZA_OPRIRE_SAT_KM = 0.5;
  const locul = (p) => ctx.placesIdx?.nearestWithin(p, RAZA_OPRIRE_SAT_KM)?.name ?? null;
  const inSat = (p) => locul(p) != null;
  // «a oprit într-un sat AL RUTEI LUI» — regula lui Ion, 18.09. Lista de referință e
  // etalonul rutei (satele ei deduse din cursele neambigue), nu numele scris în grafic:
  // numele are 1-2 sate, etalonul are 13-19.
  const inSatulRutei = (rid) => {
    const ale = new Set(ctx.sateEtalon?.get(rid) ?? ctx.sateRuta.get(rid) ?? []);
    return ale.size ? (p) => { const n = locul(p); return n != null && ale.has(norm(n)); } : null;
  };

  for (const [sh, candidati] of peSchimb) {
    const alSchimbului = (tip, stare) =>
      segs.find((x) => x.shift_number === sh && x.tip === tip && x.stare === stare && x.km >= 1);

    for (const [sens, plin, gol] of [
      ['tur', alSchimbului('apropiere', 'plin'), alSchimbului('plecare', 'gol')],
      ['retur', alSchimbului('plecare', 'plin'), alSchimbului('apropiere', 'gol')],
    ]) {
      if (!plin) continue;                       // fără drumul cu pasageri nu există cursă
      const sate = sateDeservite(r.pts, ctx.placesIdx, plin.from, plin.to, PRAG_SAT_KM);
      const vazute = new Set(sate.map(norm));
      const capete = capeteReale(r.stops ?? [], r.pts, plin.from, plin.to);
      const taiat = taieLivrarea(plin, capete, r.calc);

      // A CUI e cursa, când mașina are două rute în același schimb (22 din 169 de
      // perechi mașină×schimb pe 16.09). Întrebarea se pune pe SATE, nu se ocolește:
      // 302YEK avea rutele 14 și 32; urma ei trece prin toate cele șase sate ale rutei
      // 14 și prin niciunul dintre cele opt ale rutei 32. Marcând totul `ambiguu`,
      // rutele Draxelmaier rămâneau fără etalon deși dovada era în date.
      // Rămâne `ambiguu` doar când dovada chiar lipsește: nicio potrivire, sau două
      // rute la fel de bune.
      const potrivire = (rid) => {
        // întâi etalonul rutei (13-19 sate), apoi numele ei (2-9) dacă n-are încă etalon
        const ref = ctx.sateEtalon?.get(rid) ?? ctx.sateRuta.get(rid) ?? [];
        if (!ref.length) return 0;
        return ref.filter((x) => vazute.has(x)).length / ref.length;
      };
      const eligibili = candidati.filter((x) => (sens === 'tur' ? !x.eRetur : true));
      if (!eligibili.length) continue;
      const cuScor = eligibili
        .map((x) => ({ a: x, scor: potrivire(x.factory_route_id) }))
        .sort((p, q) => q.scor - p.scor);
      const a = cuScor[0].a;
      const alDoilea = cuScor.find((x) => x.a.factory_route_id !== a.factory_route_id);
      const ambiguu = cuScor[0].scor < 0.34 || (alDoilea != null && alDoilea.scor >= cuScor[0].scor - 0.1);

      const ale = ctx.sateRuta.get(a.factory_route_id) ?? [];
      await supa.from('lde_route_run').upsert({
        run_date: day, factory_route_id: a.factory_route_id, shift_number: sh,
        slot: a.slot ?? 1, sens, vehicle_id,
        // Satele lipsă/în plus NU se scriu aici: worker-ul n-are cu ce compara. Numele
        // rutei are 1-2 sate, drumul real are 13-19 (Ion, 17.09), deci comparat cu numele
        // aproape tot ieșea „în plus". Le umple agregatorul, față de ETALON, după ce
        // etalonul există.
        sate_atinse: sate, sate_lipsa: [], sate_extra: [],
        km_real: taiat ? taiat.plin : plin.km,
        km_goi: gol ? gol.km : 0,
        km_livrare: taiat ? taiat.livrare : 0,
        km_gol_acasa: gol ? golPrinCasa(gol, r.pts, r.calc, bazeP) : 0,
        opriri_plin: opririScurte(r.pts, plin.from, plin.to, { exclude: deSarit(plin), inSat }),
        opriri_pe_traseu: (() => {
          const f = inSatulRutei(a.factory_route_id);
          return f ? opririScurte(r.pts, plin.from, plin.to, { exclude: deSarit(plin), inSat: f }) : null;
        })(),
        opriri_gol: gol ? opririScurte(r.pts, gol.from, gol.to, { exclude: deSarit(gol), inSat }) : null,
        prima_statie: capete.prima, ultima_statie: capete.ultima,
        stare: 'plin', ambiguu,
        motiv: ambiguu ? (cuScor[0].scor < 0.34 ? 'sate_nepotrivite' : 'doua_rute_la_fel') : null,
        geom: simplifica(r.pts, r.calc, plin.from, plin.to),
      }, { onConflict: 'run_date,factory_route_id,shift_number,slot,sens' });
      scrise++;
    }
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
