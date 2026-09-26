// c4.mjs — efectul autodublurilor (C4) pe DISPOZITIV, pur (ION-95 v4.1, Codex r2 C1). Folosit de drax.mjs și de proba sintetică (proba.mjs c4).
// Variantele sunt eliminarea COERENTĂ a fiecărui dispozitiv: TOATE deplasările lui în zilele cu dublură sigură, inclusiv cele fără pereche.
// Identitatea dispozitivului vine din câmpul `dev` al deplasării (păstrat de lanț la unire). Dacă o deplasare dintr-o zi dublă n-are `dev`,
// identitatea NU e reconstituibilă (cele două dispozitive ale aceluiași autobuz au aceleași poziții; lungimea nu identifică dispozitivul)
// → NEDETERMINAT = blocant. Se calculează totuși marginile (păstrează lunga / scurta / sosirea devreme / târzie, pe pereche) ca ordin de mărime.
export const okey = c => `${c.m}|${c.t0}|${c.km}`;

// perechi = [{ m, zi, a, b }] suprapuse în timp (treapta «sigur»); cursePeZi(m, zi) = toate deplasările plăcii în ziua de lucru; obsDe(d) = observațiile deplasării
export function variante(perechi, cursePeZi, obsDe) {
  const zile = new Map(); for (const x of perechi) { const k = x.m + '|' + x.zi; if (!zile.has(k)) zile.set(k, { m: x.m, zi: x.zi }); }
  const toate = [...zile.values()].flatMap(z => cursePeZi(z.m, z.zi));
  const faraDev = toate.filter(d => d.dev == null).length;
  const chei = ds => new Set(ds.flatMap(d => obsDe(d).map(okey)));
  if (!faraDev && toate.length) {
    const devs = [...new Set(toate.map(d => String(d.dev)))].sort();
    return { determinat: true, devs, variante: devs.map(dv => [`fără dispozitivul ${dv}`, chei(toate.filter(d => String(d.dev) === dv))]) };
  }
  const pe = f => chei(perechi.map(f));
  return { determinat: false, motiv: `${faraDev}/${toate.length} deplasări din zilele duble fără identitatea dispozitivului`,
    margini: [['păstrează lunga', pe(x => x.a.km >= x.b.km ? x.b : x.a)], ['păstrează scurta', pe(x => x.a.km >= x.b.km ? x.a : x.b)],
      ['păstrează sosirea devreme', pe(x => new Date(x.a.t1) <= new Date(x.b.t1) ? x.b : x.a)], ['păstrează sosirea târzie', pe(x => new Date(x.a.t1) <= new Date(x.b.t1) ? x.a : x.b)]] };
}

// compară metricile unei variante cu baza; întoarce listele de diferențe (blocante / informative)
export function diferente(nume, baza, q, zaleasa, P) {
  const dif = [], info = [];
  if (q.etalonGPS == null || !q.reg.tur || !q.reg.retur) return { nedet: true, dif, info };
  for (const sens of ['tur', 'retur']) if (q.reg[sens].join() !== baza.reg[sens]?.join()) dif.push(`${nume}: sate ${sens} [${baza.reg[sens]}] → [${q.reg[sens]}]`);
  if (baza.etalonGPS != null && Math.abs(q.etalonGPS - baza.etalonGPS) / baza.etalonGPS > P.KM_5) dif.push(`${nume}: etalon GPS ${baza.etalonGPS} → ${q.etalonGPS}`);
  if (q.tureZi !== baza.tureZi) dif.push(`${nume}: ture/zi ${baza.tureZi} → ${q.tureZi}`);
  for (const o of Object.keys(baza.ore)) if (baza.ore[o] != null && q.ore[o] != null && Math.abs(q.ore[o] - baza.ore[o]) * 60 >= P.ORE_MIN) dif.push(`${nume}: ora ${o} ${baza.ore[o]} → ${q.ore[o]}`);
  if (zaleasa && baza.bune.has(zaleasa) !== q.bune.has(zaleasa)) dif.push(`${nume}: ziua aleasă ${zaleasa} ${q.bune.has(zaleasa) ? 'devine' : 'nu mai e'} zi bună GPS`);
  if (q.nBune !== baza.nBune) info.push(`${nume}: zile bune GPS ${baza.nBune} → ${q.nBune}`);
  return { nedet: false, dif, info };
}

// efectul pe o linie: { nivel, motiv, determinat }
export function efectLinie({ l, baza, metrici, V, P }) {
  const za = l.zi ? `${l.schimbZi}|${l.masinaZi}|${l.zi}` : null;
  if (baza.etalonGPS == null || !baza.reg.tur || !baza.reg.retur) return { nivel: 'blocant', determinat: V.determinat, motiv: 'NEDETERMINAT — baza nu se poate măsura' };
  const lista = V.determinat ? V.variante : V.margini; const dif = [], info = []; let nedet = false;
  for (const [n, sc] of lista) { const r = diferente(n, baza, metrici(l, sc), za, P); nedet ||= r.nedet; dif.push(...r.dif); info.push(...r.info); }
  if (!V.determinat) return { nivel: 'blocant', determinat: false, motiv: `NEDETERMINAT — ${V.motiv}; marginile (nu variante pe dispozitiv): ${dif.concat(info).join(' · ') || 'fără diferențe'}` };
  if (nedet) return { nivel: 'blocant', determinat: true, motiv: 'NEDETERMINAT — o metrică nu s-a putut măsura într-o variantă pe dispozitiv' };
  return { nivel: dif.length ? 'blocant' : 'informativ', determinat: true, motiv: dif.length ? dif.concat(info).join(' · ') : `efect măsurat nul pe dispozitive (${V.devs.join(', ')})${info.length ? ' · ' + info.join(' · ') : ''}` };
}
