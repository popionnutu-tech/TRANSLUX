// Traseul ideal al fiecărei rute, scos din zilele în care turul și returul se închid.
//
// Ideea (Ion, 22.09.2026): ziua în care autobuzul atinge exact aceleași sate la dus și la
// întors e ziua în care a făcut bucla întreagă — a adus înapoi oamenii pe care i-a dus.
// Media tuturor zilelor amestecă zilele rupte; zilele astea, nu.
//
// Rulare:  node --env-file=apps/admin/.env lde-geo-worker/rute-ideale.mjs [zile] > rute-ideale.json

import { createClient } from '@supabase/supabase-js';

const ZILE = Number(process.argv[2] || 90);
const MIN_ZILE_CURATE = 3;        // sub atât, «etalonul» e o coincidență, nu o probă
const PAS = 1000;                 // PostgREST taie orice răspuns la 1000 de rânduri

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function citesteTot(tabel, coloane, aplica = (q) => q) {
  const out = [];
  for (let de = 0; ; de += PAS) {
    const { data, error } = await aplica(db.from(tabel).select(coloane))
      .order('id', { ascending: true })
      .range(de, de + PAS - 1);
    if (error) throw new Error(`${tabel}: ${error.message}`);
    out.push(...data);
    if (data.length < PAS) return out;
  }
}

const mediana = (v) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const celMaiDes = (v) => {
  if (!v.length) return null;
  const n = new Map();
  for (const x of v) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

const acelasiSet = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
};

const dataDe = (zile) => {
  const d = new Date();
  d.setDate(d.getDate() - zile);
  return d.toISOString().slice(0, 10);
};

const rute = await citesteTot('lde_factory_routes', 'id,route_number,uzina_id');
const peId = new Map(rute.map((r) => [r.id, r]));

const curse = await citesteTot(
  'lde_route_run',
  'id,run_date,factory_route_id,shift_number,vehicle_id,sens,km_real,km_livrare,sate_oprire',
  (q) => q.gte('run_date', dataDe(ZILE)).eq('stare', 'plin').gt('km_real', 0),
);

// O pereche = un autobuz, o rută, un schimb, o zi. Turul și returul lui, nu ale altcuiva.
const perechi = new Map();
for (const c of curse) {
  if (c.sens !== 'tur' && c.sens !== 'retur') continue;
  const cheie = `${c.factory_route_id}|${c.shift_number}|${c.run_date}|${c.vehicle_id}`;
  const p = perechi.get(cheie) ?? { frid: c.factory_route_id, sch: c.shift_number, zi: c.run_date };
  p[c.sens] = c;
  perechi.set(cheie, p);
}

// Gruparea pe rută × schimb, cu zilele curate deoparte
const grupe = new Map();
for (const p of perechi.values()) {
  const t = p.tur, r = p.retur;
  if (!t || !r) continue;
  if (!t.sate_oprire?.length || !r.sate_oprire?.length) continue;
  const ruta = peId.get(p.frid);
  if (!ruta) continue;
  const cheie = `${ruta.uzina_id}|${ruta.route_number}|${p.sch}`;
  const g = grupe.get(cheie) ?? {
    uzina: ruta.uzina_id, ruta: ruta.route_number, schimb: p.sch, curate: [], restul: [],
  };
  (acelasiSet(t.sate_oprire, r.sate_oprire) ? g.curate : g.restul).push({
    zi: p.zi, kmTur: +t.km_real, kmRetur: +r.km_real,
    livrare: +t.km_livrare + +r.km_livrare, traseu: t.sate_oprire.join(' · '),
  });
  grupe.set(cheie, g);
}

const rezultat = [...grupe.values()]
  .map((g) => ({
    uzina: g.uzina, ruta: g.ruta, schimb: g.schimb,
    zileCurate: g.curate.length, zileTotal: g.curate.length + g.restul.length,
    traseu: celMaiDes(g.curate.map((z) => z.traseu)),
    kmTur: mediana(g.curate.map((z) => z.kmTur)),
    kmRetur: mediana(g.curate.map((z) => z.kmRetur)),
    livrare: mediana(g.curate.map((z) => z.livrare)),
    kmRestul: mediana(g.restul.map((z) => z.kmTur + z.kmRetur)),
    livrareRestul: mediana(g.restul.map((z) => z.livrare)),
  }))
  .sort((a, b) => a.uzina.localeCompare(b.uzina) || a.ruta - b.ruta || a.schimb - b.schimb);

const cuEtalon = rezultat.filter((r) => r.zileCurate >= MIN_ZILE_CURATE);
const faraEtalon = rezultat.filter((r) => r.zileCurate < MIN_ZILE_CURATE);

process.stdout.write(JSON.stringify({
  generat: new Date().toISOString().slice(0, 16).replace('T', ' '),
  fereastra: { de: dataDe(ZILE), pana: new Date().toISOString().slice(0, 10), zile: ZILE },
  minZileCurate: MIN_ZILE_CURATE,
  total: {
    perechi: [...perechi.values()].filter((p) => p.tur && p.retur).length,
    curate: rezultat.reduce((a, r) => a + r.zileCurate, 0),
    combinatii: rezultat.length, cuEtalon: cuEtalon.length, faraEtalon: faraEtalon.length,
  },
  cuEtalon, faraEtalon,
}, null, 1));
