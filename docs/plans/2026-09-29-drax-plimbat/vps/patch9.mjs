import fs from 'fs';
const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('ancoră: ' + a.slice(0, 70)); s = s.replace(a, b); };
// C2 Codex r3: zona km-ilor obligatorii = zona producătorului (categorii.mjs:157 inZonaUz, PR.ZONA_KM = 3 km de porți sau de parc):
// cursa între uzine (§5.11) e fie toată mișcarea în zonă, fie porțiunea poartă A → poartă B cu toate punctele în zonă; parcul e în zonă.
rep("  let mU = 0; for (let k = i + 1; k <= j; k++) if (laUzina(Q[k - 1]) && laUzina(Q[k])) mU += hav(Q[k - 1], Q[k]);",
    "  let mU = 0; for (let k = i + 1; k <= j; k++) if (inZonaProd(Q[k - 1]) && inZonaProd(Q[k])) mU += hav(Q[k - 1], Q[k]);");
rep("const PLIMB_R = 5;", "const PLIMB_R = 5;\nconst ZONA_PROD_KM = 3;   // = PR.ZONA_KM din categorii.mjs (producătorul lui intreUzine / parc)\nconst inZonaProd = (p) => hav(p, PARC) <= ZONA_PROD_KM || PORTI.some((q) => hav(p, q) <= ZONA_PROD_KM);");
// C3 Codex r3: validare încrucișată — CAL estimat pe o jumătate aplicat pe cealaltă; eroarea absolută mediană, pe sursă
rep("      validare: { calPare: med(par.map((c) => c.dev)), calImpare: med(imp.map((c) => c.dev)), nPare: par.length, nImpare: imp.length,",
`      validare: { calPare: med(par.map((c) => c.dev)), calImpare: med(imp.map((c) => c.dev)), nPare: par.length, nImpare: imp.length,
        incrucisat: (() => {
          const cal = (a) => Math.min(0, med(a.map((c) => c.dev)) ?? 0), err = (a, k) => med(a.map((c) => Math.abs(c.dev - k)));
          const out = { imparePeCalPare: err(imp, cal(par)), parePeCalImpare: err(par, cal(imp)), fara: err(plStat.control, 0) };
          for (const k of ['gps', 'valhalla']) { const P = par.filter((c) => c.src === k), I = imp.filter((c) => c.src === k);
            out[k] = { imparePeCalPare: err(I, cal(P)), parePeCalImpare: err(P, cal(I)), fara: err([...P, ...I], 0), nP: P.length, nI: I.length }; }
          return out; })(),`);
fs.writeFileSync(F, s); console.log('ok');
