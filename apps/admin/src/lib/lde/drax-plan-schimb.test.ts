import { describe, it, expect } from 'vitest';
import {
  estePlanSchimb, locuriParcare, nemasurataDinModel, planDinRand, schimbPublicat, textLant, textLeiLant, textStarePlan,
} from './drax-plan-schimb';
import type { AnalizaDrax, PlanSchimbDrax } from './drax-analiza';
import { fixtureDrax } from './drax-fixture.test-util';
import plan14 from './drax-plan-schimb-2026-09-14.fixture.json';

// ieșirea reală a părții A pe 14.09, «plan-schimb v3.1» (subsetul care intră în rând, §6 + v3.1): lanțul 763LYY ↔ 713IZX verificat pe 07.09
const plan = plan14 as unknown as PlanSchimbDrax;
const copie = (): PlanSchimbDrax => JSON.parse(JSON.stringify(plan));
// testele stricăciunilor mută JSON liber în adâncime: `any` e aici intenționat, exact ca datele din bază înainte de gardă
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonLiber = any;
const rand = (planSchimb: unknown, o: Partial<AnalizaDrax> = {}): AnalizaDrax => ({ ...fixtureDrax(), planSchimb: planSchimb as PlanSchimbDrax, ...o });

describe('garda strictă, pe §6 v3.1', () => {
  it('planul real v3 trece', () => expect(estePlanSchimb(plan)).toBe(true));

  it('N2: mutarea cu un singur sens (tur sau retur null) e validă', () => {
    const p = copie() as JsonLiber;
    p.schimb.lanturi[0].mutari[0].retur = null;
    p.schimb.lanturi[0].mutari[1].tur = null;
    expect(estePlanSchimb(p)).toBe(true);
  });

  const stricate: [string, (p: JsonLiber) => void][] = [
    ['mutare fără niciun sens', (p) => { p.schimb.lanturi[0].mutari[0].tur = null; p.schimb.lanturi[0].mutari[0].retur = null; }],
    ['forma v3 fără câmpurile v3.1 (fără asteptare.dimineata)', (p) => { delete p.asteptare.dimineata; }],
    ['seara fără întrebare', (p) => { delete p.asteptare.seara.intrebare; }],
    ['întrebare: mașină fără «masurat»', (p) => { delete p.asteptare.seara.intrebare.masini[0].masurat; }],
    ['întrebare: gpsKmSapt text', (p) => { p.asteptare.seara.intrebare.gpsKmSapt = '1648'; }],
    ['kmSapt estimare lipsă', (p) => { delete p.asteptare.kmSapt; }],
    ['casaInDrum lipsă', (p) => { delete p.asteptare.masini[0].casaInDrum; }],
    ['casaInDrum după lanț text', (p) => { p.asteptare.masini.find((m: JsonLiber) => m.dupaLant).dupaLant.casaInDrum = { dimineata: 'da', seara: false }; }],
    ['schimb fără stare', (p) => { delete p.schimb.stare; }],
    ['stare necunoscută', (p) => { p.schimb.stare = 'poate'; }],
    ['rotatie lipsă', (p) => { delete p.rotatie; }],
    ['verificatPe număr', (p) => { p.rotatie.verificatPe = 20260907; }],
    ['mutare fără nume', (p) => { delete p.schimb.lanturi[0].mutari[0].nume; }],
    ['lanț fără mutări', (p) => { p.schimb.lanturi[0].mutari = []; }],
    ['lei text', (p) => { p.schimb.lanturi[0].leiSapt = '605'; }],
    ['loc fără «unde»', (p) => { delete p.asteptare.masini[0].asteapta.dimineata.unde; }],
    ['loc cu acasaEChiarLocul text', (p) => { p.asteptare.masini[0].asteapta.seara.acasaEChiarLocul = 'da'; }],
    ['dupaLant stricat', (p) => { p.asteptare.masini.find((m: JsonLiber) => m.dupaLant).dupaLant.asteapta = null; }],
    ['nemasurate fără km', (p) => { delete p.asteptare.nemasurate[0].kmSapt; }],
    ['neconfirmateKmSapt lipsă', (p) => { delete p.schimb.neconfirmateKmSapt; }],
  ];
  it.each(stricate)('%s → nu trece', (_, strica) => {
    const p = copie() as JsonLiber;
    strica(p);
    expect(estePlanSchimb(p)).toBe(false);
  });
});

describe('starea planului în rând', () => {
  it('lipsă → «se calculează luni»', () => {
    const a = fixtureDrax();
    expect(planDinRand(a)).toEqual({ stare: 'lipsa' });
    expect(textStarePlan(planDinRand(a))).toContain('Planul se calculează luni');
  });
  it('null cu motiv → indisponibil, cu motivul', () => {
    expect(textStarePlan(planDinRand(rand(null, { planSchimbLipsa: 'drumurile nu s-au putut calcula' }))))
      .toBe('Planul de schimb nu e disponibil săptămâna asta (drumurile nu s-au putut calcula).');
  });
  it('formă greșită → indisponibil, nu excepție', () => {
    expect(planDinRand(rand({ sapt: 'x' }))).toEqual({ stare: 'indisponibil', motiv: 'forma planului nu e cea așteptată' });
  });
  it('N8: plan de altă săptămână → indisponibil', () => {
    expect(planDinRand(rand({ ...plan, sapt: '2026-09-07' }))).toEqual({ stare: 'indisponibil', motiv: 'planul e al săptămânii 2026-09-07' });
  });
  it('bun și aceeași săptămână → ok', () => expect(planDinRand(rand(plan))).toEqual({ stare: 'ok', plan }));
});

describe('N5 — schimbul se publică doar verificat pe rotație', () => {
  it('real: verificat pe 07.09', () => {
    expect(schimbPublicat(plan)).toBe(true);
    expect(textStarePlan({ stare: 'ok', plan })).toBe('După ce mașinile stau parcate între curse, schimbul de linii mai taie ≈ 83 km '
      + 'pe săptămână (estimare; verificat și pe săptămâna 2026-09-07, cu schimburile inversate).');
  });
  it('neverificat: nu se aplică, cu ce ar fi tăiat', () => {
    const p = { ...plan, rotatie: { ...plan.rotatie, verificatPe: null }, schimb: { ...plan.schimb, stare: 'neverificat' as const, lanturi: [], neconfirmateKmSapt: 285.8 } };
    expect(schimbPublicat(p)).toBe(false);
    expect(textStarePlan({ stare: 'ok', plan: p })).toBe('Schimbul de linii: încercare, neverificată pe săptămâna precedentă — nu se aplică (ar tăia ≈ 286 km, estimare).');
  });
  it('«verificat» fără dată de rotație nu se publică', () => {
    expect(schimbPublicat({ ...plan, rotatie: { ...plan.rotatie, verificatPe: null } })).toBe(false);
  });
  it('nimic găsit ≠ găsit dar neconfirmat', () => {
    const p = { ...plan, schimb: { ...plan.schimb, lanturi: [], neconfirmateKmSapt: 0 } };
    expect(textStarePlan({ stare: 'ok', plan: p })).toBe('Schimbul de linii nu găsește nimic de tăiat după ce mașinile stau parcate între curse.');
  });
});

describe('lanțul: fraza ambelor mașini, apoi flota', () => {
  it('763LYY −288, 713IZX +205, flota −83 (−252 pe rotație); lei: motivul', () => {
    const [l] = plan.schimb.lanturi;
    expect(textLant(l)).toBe('763LYY dă Coșernița (R30) lui 713IZX și ia Prajila (R17): merge cu ≈ 288 km mai puțin pe săptămână. '
      + '713IZX dă Prajila (R17) lui 763LYY și ia Coșernița (R30): merge cu ≈ 205 km mai mult pe săptămână. '
      + 'Flota: −83 km pe săptămână (estimare; pe săptămâna cu schimburile inversate −252).');
    expect(textLeiLant(l)).toBe('fără lei: 763LYY fără normă');
  });
});

describe('locurile și nemăsuratele din plan', () => {
  it('C2: mașina din lanțul publicat primește locurile de DUPĂ lanț', () => {
    expect(locuriParcare('713IZX', plan)).toMatchObject({ dupaLant: true, casaInDrum: { dimineata: true, seara: false }, preia: ['Coșernița (R30)'], locuri: { dimineata: null, seara: { unde: 'capătul Prajila (R17)' } } });
    expect(locuriParcare('925FTI', plan)).toMatchObject({ dupaLant: false, locuri: { dimineata: { unde: 'capătul Musteața (R37)' } } });
    expect(locuriParcare('NU-E', plan)).toBeNull();
  });
  it('N7: 549RNK (0 zile GPS, model ≥ 20 km/zi) e nemăsurată; 804MUM (sub prag) nu', () => {
    expect(nemasurataDinModel('549RNK', plan)).toBe(true);
    expect(nemasurataDinModel('804MUM', plan)).toBe(false);
    expect(nemasurataDinModel('925FTI', plan)).toBe(false);
  });
});
