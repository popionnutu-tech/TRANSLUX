import { describe, it, expect } from 'vitest';
import {
  frazaMasina, intrebareSeara, locEfectiv, masinaMicaSeara, orePeZile, paginaCeFaci, sectiuneaDeSus, textCard, textDoarMici, textNemasurate,
} from './drax-ce-faci-text';
import { indicatieMasina } from './drax-ce-faci';
import type { AnalizaDrax, MasinaDrax, PlanSchimbDrax } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';
import { frazaSaptamana, povesteZi } from './drax-ziua';
import { textLant, textStarePlan } from './drax-plan-schimb';
import kaj345 from './drax-345kaj-2026-09-14.fixture.json';
import fti925 from './drax-925fti-2026-09-14.fixture.json';
import yek302 from './drax-302yek-2026-09-14.fixture.json';
import plan14 from './drax-plan-schimb-2026-09-14.fixture.json';

// Mașini reale din rândul 14.09 și planul real «plan-schimb v3» (subsetul din rând): gps 1.902,4 dimineața + 2.241,9 seara;
// model 3.260,8; lanțul 763LYY ↔ 713IZX verificat pe 07.09 (−83; −252 pe rotație).
const kaj = kaj345 as unknown as MasinaDrax;
const fti = fti925 as unknown as MasinaDrax;
const yek = yek302 as unknown as MasinaDrax;
const plan = plan14 as unknown as PlanSchimbDrax;

/** termenii tehnici și formulările scoase în rundele 1–2 */
const INTERZIS_CUVINTE = /\b(livrare\w*|ocol\w*|legătur\w*|candidat\w*)\b|§|A \(LEAR|capete diferite|schimbul \d|modelul estimează|De întrebat|merge acasă altfel/i;
/** R1a / R1b / R3 ca termeni; «R3 Nihoreni» și «(R3)» sunt nume de linii și au voie */
const INTERZIS_COD = /\bR1[ab]\b|(?<!\()\bR3\b(?! \p{Lu})/u;
const esteTehnic = (t: string) => INTERZIS_CUVINTE.test(t) || INTERZIS_COD.test(t);

const rand = (masini: MasinaDrax[], planSchimb?: PlanSchimbDrax | null): AnalizaDrax => {
  const f = fixtureDrax();
  const card = masini.reduce((s, m) => s + (m.extrapolat.R1b ?? 0) + (m.extrapolat.R3 ?? 0), 0);
  return { ...f, masini, economie: { ...f.economie, carduri: { ...f.economie.carduri, R1bR3: card } }, ...(planSchimb !== undefined ? { planSchimb } : {}) };
};
const cuPlan = paginaCeFaci(rand([fti, kaj, yek], plan));
const faraPlan = paginaCeFaci(rand([fti, kaj, yek]));

describe('N1 — sus: costul de azi pe GPS, estimarea o singură dată', () => {
  const sus = sectiuneaDeSus(cuPlan.c, cuPlan.plan);

  it('cifra GPS e «azi», împărțită dimineață / seară; nu stă lângă «se taie»', () => {
    const d = Math.round(cuPlan.c.kmParti.dimineata), s = Math.round(cuPlan.c.kmParti.seara);
    expect(sus[0]).toBe(`Azi mașinile fac ≈ ${(d + s).toLocaleString('ro-RO')} km pe săptămână goi mergând acasă între curse: `
      + `≈ ${d} km dimineața (după tur, până la cursa de după-amiază) și ≈ ${s} km seara (după retur, până la cursa de la miezul nopții).`);
    expect(sus.join(' ')).not.toMatch(/se taie/);
  });

  it('dimineața de luni; seara o singură întrebare, cu ora cursei de noapte din plan', () => {
    expect(sus[1]).toBe('Dimineața: mașina stă parcată la capătul cursei următoare sau la uzină — se poate cere de luni. '
      + 'Seara: depinde dacă șoferul are cu ce veni la cursa de 00:08–00:23 — o singură întrebare pentru Ion.');
  });

  it('F3 / v3.1: estimarea o singură dată, luată din plan (dimineața / seara / total plafonate), cu lei pe aceeași bază', () => {
    expect(sus.filter((r) => r.includes('Estimare'))).toEqual([
      'Estimare: dacă mașinile stau parcate între curse, golul scade cu ≈ 2.633 km pe săptămână '
      + '(≈ 1.074 dimineața, ≈ 1.558 seara; ≈ 17.167 lei pe mașinile cu normă).',
    ]);
    expect(sus.join(' ')).not.toMatch(/între aducere și întoarcere/);
    expect(sectiuneaDeSus(faraPlan.c, null).join(' ')).not.toMatch(/Estimare/);
  });

  it('schimbul de linii nu apare sus', () => expect(sus.join(' ')).not.toMatch(/schimb/i));
});

describe('F4 — întrebarea de seară: o dată, cu locul din plan, distanța și km care depind de ea', () => {
  it('v3.1: lista, orele și sumele sunt ale planului (asteptare.seara.intrebare), nu recalculate', () => {
    expect(intrebareSeara(cuPlan.c, cuPlan.plan)).toBe('Întrebarea pentru Ion: seara, după întoarcerea de ~16:44, mașina ar rămâne '
      + 'parcată la capătul liniei (912RNK la uzină) până pleacă spre cursa de noapte (00:08–00:23). Are șoferul cum ajunge de acolo '
      + 'acasă și înapoi la mașină, sau poate aștepta lângă ea? Privește 12 mașini, cu distanța până acasă: 912RNK 43 km, 345KAJ 29 km, '
      + '549RNK 26 km (nemăsurată), 457BRAX 25 km, 760BXI 24 km, 518MHD 22 km (nemăsurată), 925FTI 22 km, 302YEK 20 km, 713IZX 12 km, '
      + '725CWN 7 km, 830MUM 7 km, 146BRAZ 5 km. De răspuns depind ≈ 1.648 km pe săptămână de azi (pe mașinile măsurate; estimare de '
      + 'tăiat ≈ 1.466).');
  });
  it('lista nu depinde de mașinile din pagină: e a planului', () => {
    const c = { ...cuPlan.c, deAratat: [] };
    expect(intrebareSeara(c, plan)).toContain('Privește 12 mașini');
  });
  it('lista goală în plan → fără întrebare', () => {
    const gol = { ...plan, asteptare: { ...plan.asteptare, seara: { ...plan.asteptare.seara, intrebare: { ...plan.asteptare.seara.intrebare, masini: [] } } } };
    expect(intrebareSeara(cuPlan.c, gol)).toBeNull();
  });
  it('fără plan: din GPS, fără distanțe, fără estimare', () => {
    const q = intrebareSeara(faraPlan.c, null)!;
    expect(q).toContain('Privește 3 mașini: 302YEK, 345KAJ, 925FTI.');
    expect(q).not.toMatch(/estimare|km,/);
  });
  it('nicio frază de mașină nu repetă întrebarea', () => {
    for (const x of cuPlan.c.deAratat) expect(frazaMasina(x, cuPlan.plan)).not.toMatch(/întrebare|cum ajunge|cu ce veni/i);
  });
});

describe('F1 / v3.1 — «casa în drum» e decizia planului (casaInDrum): 715IZX, 446ASB, 041BRAU, 880RNK', () => {
  const rnk880 = { ...indicatieMasina(fti), m: '880RNK', casa: 'Pelinia' };
  it('fraza: poate sta acasă, nu uzina', () => {
    const f = frazaMasina(rnk880, plan);
    expect(f).toContain('Dimineața și seara poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse.');
    expect(f).not.toMatch(/uzină/);
    expect(locEfectiv(rnk880, 'seara', plan)).toEqual({ fel: 'casaInDrum', dupaLant: false, spre: null });
  });
  it('nu intră în întrebarea de seară', () => {
    const c = { ...cuPlan.c, deAratat: [...cuPlan.c.deAratat, rnk880, { ...rnk880, m: '715IZX' }, { ...rnk880, m: '446ASB' }, { ...rnk880, m: '041BRAU' }] };
    expect(intrebareSeara(c, plan)).not.toMatch(/880RNK|715IZX|446ASB|041BRAU/);
    for (const m of ['880RNK', '715IZX', '446ASB', '041BRAU']) expect(plan.asteptare.masini.find((x) => x.m === m)?.casaInDrum).toEqual({ dimineata: true, seara: true });
  });
  it('fără plan, seara locul din GPS e capătul returului, nu uzina', () => {
    expect(locEfectiv(indicatieMasina(fti), 'seara', null)).toEqual({ fel: 'loc', loc: { unde: 'Ilenuța', departeDeCasaKm: null, acasaEChiarLocul: false } });
  });
});

describe('N2 — pe mașină: cele două bucăți și locul din plan', () => {
  it('925FTI: locul = cel din plan (capătul Musteața / capătul Ilenuța), fără «modelul», fără întrebare', () => {
    expect(frazaMasina(indicatieMasina(fti), plan)).toBe('925FTI (Sărata Veche) — azi merge acasă între curse: dimineața ≈ 52 km, '
      + 'seara ≈ 43 km pe zi (475 pe săptămână). Dimineața stă parcată la capătul Musteața (R37). Seara stă parcată la capătul Ilenuța (R26).');
  });
  it('302YEK: dimineața locul e chiar satul lui — «nu mai umblă prin sat», nu «merge acasă altfel»', () => {
    expect(frazaMasina(indicatieMasina(yek), plan)).toBe('302YEK (Căinarii Vechi) — azi merge acasă între curse: dimineața ≈ 11 km, '
      + 'seara ≈ 41 km pe zi (257 pe săptămână). Dimineața stă parcată la capătul Căinarii Vechi (R32), chiar în satul lui, și nu mai '
      + 'umblă prin sat. Seara stă parcată la capătul Baroncea (R14).');
  });
  it('fără plan: locul din GPS, satul casei recunoscut', () => {
    expect(frazaMasina(indicatieMasina(fti), null)).toContain('Dimineața stă parcată la Musteața. Seara stă parcată la Ilenuța.');
    expect(frazaMasina(indicatieMasina(yek), null)).toContain('chiar în satul lui');
  });
  it('fraza fără ore; orele la apăsare, în ordine', () => {
    expect(frazaMasina(indicatieMasina(kaj), plan)).not.toMatch(/\d\d:\d\d/);
    expect(orePeZile(indicatieMasina(fti))[0]).toBe('lun 14.09, 06:20–13:49: 52 km în plus pe acasă (7 h 29 min între curse)');
  });
});

describe('C2 — mașina din lanțul publicat: locurile din calendarul DUPĂ lanț', () => {
  it('F2 — 713IZX: dimineața trece pe acasă în drum spre Coșernița (pauza rămâne, drumul în plus nu), seara la Prajila', () => {
    const x = { ...indicatieMasina(fti), m: '713IZX', casa: 'Florești' };
    const f = frazaMasina(x, plan);
    expect(f).toContain('Dimineața, după schimbul de linii, trece pe acasă (Florești) în drum spre Coșernița (R30) — nu mai e drum în plus; '
      + 'să nu mai umble cu ea între curse. Seara stă parcată la capătul Prajila (R17).');
    expect(f).not.toMatch(/nu mai are pauză/);
    expect(f).toContain('Locurile sunt cele de după schimbul de linii din plan.');
  });
  it('lanț neverificat → locurile de azi, nu cele de după lanț', () => {
    const nev = { ...plan, schimb: { ...plan.schimb, stare: 'neverificat' as const, lanturi: [] } };
    const f = frazaMasina({ ...indicatieMasina(fti), m: '763LYY', casa: 'Băhrinești' }, nev);
    expect(f).toContain('Dimineața stă parcată la uzină.');
    expect(f).not.toContain('după schimbul de linii');
  });
});

describe('rândurile de sub listă și rândul deschis', () => {
  it('nemăsurate: GPS parțial și, din model, mașina fără nicio zi măsurată (549RNK)', () => {
    const zero: MasinaDrax = { ...fti, m: '549RNK', zileIncluse: 0, extrapolat: { R1a: null, R1b: null, R3: null, B: null }, detalii: [] };
    const doua: MasinaDrax = { ...kaj, m: '518MHD', zileIncluse: 2 };
    const p = paginaCeFaci(rand([fti, zero, doua], plan));
    expect(textNemasurate(p.c, p.plan)).toBe('Nemăsurate destul, de verificat: 518MHD (2 zile măsurate din 5, ≈ 276 km pe săptămână), '
      + '549RNK (nicio zi măsurată; estimare: ≈ 156 km pe săptămână).');
  });
  it('«alte N mașini» = sub 20 km pe zi', () => {
    const mica: MasinaDrax = { ...kaj, m: 'MICA', extrapolat: { ...kaj.extrapolat, R1b: 60 } };
    expect(textDoarMici(paginaCeFaci(rand([fti, mica])).c)).toBe('Alte 1 mașină merge acasă între curse mai puțin de 20 km pe zi '
      + '(60 km pe săptămână împreună) — nu merită o dispoziție.');
  });
  it('rândul deschis: aceeași cifră, pe dimineață și seară', () => {
    expect(frazaSaptamana(fti, indicatieMasina(fti))).toBe('În cele 4 zile măsurate din 5: 639 km cu oameni, 994 km goi. '
      + 'Drumul acasă între curse: dimineața ≈ 52 km, seara ≈ 43 km pe zi (475 pe săptămână).');
  });
});

describe('fără termeni tehnici în niciun text generat', () => {
  it('pe tot ce apare pe pagină, cu plan și fără', () => {
    const texte = [cuPlan, faraPlan].flatMap((p) => [
      ...sectiuneaDeSus(p.c, p.plan), intrebareSeara(p.c, p.plan) ?? '', textDoarMici(p.c) ?? '', textNemasurate(p.c, p.plan) ?? '',
      textStarePlan(p.stare), ...(p.plan?.schimb.lanturi.map(textLant) ?? []),
      ...p.c.deAratat.flatMap((x) => [frazaMasina(x, p.plan), ...orePeZile(x)]),
    ]).concat([fti, kaj, yek].flatMap((m) => [frazaSaptamana(m, indicatieMasina(m)), ...m.detalii.flatMap((d) => povesteZi(d, m.casa).map((q) => q.text))]));
    expect(texte.length).toBeGreaterThan(80);
    expect(texte.filter(esteTehnic)).toEqual([]);
  });
  it('controlul prinde termenii, nu numele liniilor', () => {
    expect(['R1b + R3 = 276', 'ocolul pe acasă', 'pe schimbul 2', 'modelul estimează 94', 'De întrebat: cum'].every(esteTehnic)).toBe(true);
    expect(['preia R3 Nihoreni', 'la capătul Nihoreni (R3).'].some(esteTehnic)).toBe(false);
  });
});

describe('F6 — nota cardului adună la cifra cardului', () => {
  it('dimineața + seara + nemăsurate ≈ cardul', () => {
    const doua: MasinaDrax = { ...kaj, m: '518MHD', zileIncluse: 2 };
    const p = paginaCeFaci(rand([fti, kaj, doua], plan));
    const d = Math.round(p.c.kmParti.dimineata), s = Math.round(p.c.kmParti.seara), n = Math.round(p.c.kmGrupe.nemasurate);
    expect(textCard(p.c)).toBe(`Cost de azi, pe GPS: dimineața ${d} + seara ${s} + nemăsurate ${n} ≈ ${Math.round(p.c.card).toLocaleString('ro-RO')} km. `
      + `Mașinile din listă (peste 20 km pe zi): ${Math.round(p.c.kmGrupe.deAratat)} · sub prag: 0 km.`);
    expect(Math.abs(d + s + n - p.c.card)).toBeLessThanOrEqual(2);
  });
});

describe('v3.2 — mașina mică seara (Ion, 27.09: doar km; Codex r3b: km mașinii mici = seri × 2 × loc→casă)', () => {
  // soldurile reale ale workerului v3.2 pe 14.09 (prețul săptămânii 35,89 lei/l → 2,653 lei/km mașina mică)
  const SOLD: Record<string, [number, number, number | null, number | null]> = {
    '912RNK': [5, 426, 5.7, 2321], '345KAJ': [5, 290, 5.35, 1441], '549RNK': [5, 261, 5.7, 840], '457BRAX': [5, 247, 6.05, 1082],
    '760BXI': [5, 237, 5.63, 498], '518MHD': [5, 223, null, null], '925FTI': [5, 215, null, null], '302YEK': [5, 197, 5.63, 660],
    '713IZX': [5, 121, 11.42, 934], '725CWN': [5, 69, 5.35, -475], '830MUM': [5, 69, 11.42, 1665], '146BRAZ': [4, 38.4, 5.35, 277],
  };
  const cu = (fara: string | null = null): PlanSchimbDrax => {
    const q = plan.asteptare.seara.intrebare;
    return { ...plan, asteptare: { ...plan.asteptare, seara: { ...plan.asteptare.seara, intrebare: {
      ...q, masinaMica: { litri: 6, uzura: 0.5, pret: 35.89, leiKm: 2.653, saptLuna: 4.33, soldPozitivLuna: 9718 },
      masini: q.masini.map((x) => (x.m === fara ? x : { ...x, masinaMica: { seri: SOLD[x.m][0], kmSapt: SOLD[x.m][1], leiKmAutobuz: SOLD[x.m][2], soldLuna: SOLD[x.m][3] } })),
    } } } };
  };
  const t = masinaMicaSeara(cu())!;
  it('înlocuiește întrebarea: doar km, autobuzul / mașina mică, de la cel mai mare', () => {
    expect(intrebareSeara(cuPlan.c, cu())).toBe(t);
    expect(t).toContain('mașina rămâne parcată la capătul liniei (912RNK la uzină) până la cursa de noapte (00:08–00:23)');
    expect(t).toContain('912RNK 292 / 426, 925FTI 206 / 215, 345KAJ 206 / 290');
    expect(t).toContain('725CWN 14 / 69');
    expect(t).toContain('549RNK 156 / 261 (nemăsurată)');
  });
  it('fără lei', () => expect(t).not.toMatch(/lei|normă|merită/));
  it('sus: seara nu mai e întrebare', () => {
    expect(sectiuneaDeSus(cuPlan.c, cu()).join(' ')).toContain('șoferul merge acasă cu o mașină mică');
    expect(sectiuneaDeSus(cuPlan.c, plan).join(' ')).toContain('o singură întrebare pentru Ion');
  });
  it('plan v3.1 sau o mașină fără câmp → întrebarea veche', () => {
    expect(masinaMicaSeara(plan)).toBeNull();
    expect(masinaMicaSeara(cu('345KAJ'))).toBeNull();
    expect(intrebareSeara(cuPlan.c, cu('345KAJ'))).toContain('Întrebarea pentru Ion');
  });
  it('fără termeni tehnici', () => expect(esteTehnic(t)).toBe(false));
});
