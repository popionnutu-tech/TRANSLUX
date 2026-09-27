// «Ce faci săptămâna asta» la Drăxlmaier — TEXTUL (ION-108, după rundele 2–3 de revizie). Cifrele vin din drax-ce-faci.ts (GPS,
// costul de azi) și din plan (drax-plan-schimb.ts: locul unde stă parcată mașina, estimarea, nemăsuratele din model).
//   • Sus: costul de azi pe GPS împărțit dimineață / seară; dimineața mașina stă parcată (se poate cere de luni), seara depinde
//     de o singură întrebare pe flotă; estimarea modelului o singură dată, doar dimineața + seara (golul «din mijloc» al
//     modelului nu are pereche în GPS și nu se arată).
//   • Pe mașină: o frază cu cele două bucăți (dimineața / seara) și locul din plan. Când planul nu dă loc și modelul nu vede
//     nimic de tăiat, casa e în drum spre cursa următoare: «poate sta acasă…; să nu mai umble cu ea între curse» (nu uzina).
//   • Întrebarea de seară: o dată, cu locul din plan și distanța până acasă pe fiecare mașină, și câți km de azi depind de ea.
// Fără termeni tehnici (livrare, ocol, legătură, R1a/R1b/R3). Funcții pure.
import {
  ceFaciDrax, durata, mediana, ziScurt, PRAG_KM_ZI, type CeFaciDrax, type IndicatieMasinaDrax, type LocDrax, type ParteZiDrax,
} from './drax-ce-faci';
import type { AnalizaDrax, LocParcareDrax, PlanSchimbDrax } from './drax-analiza';
import { kmModelNemasurata, locuriParcare, nemasurataDinModel, planDinRand, planOk, type StarePlanDrax } from './drax-plan-schimb';

export interface PaginaCeFaciDrax { c: CeFaciDrax; stare: StarePlanDrax; plan: PlanSchimbDrax | null }

/** cifrele GPS + planul citit din rând, legate: nemăsuratele din model intră în grupa lor */
export function paginaCeFaci(a: AnalizaDrax): PaginaCeFaciDrax {
  const stare = planDinRand(a);
  const plan = planOk(stare);
  return { c: ceFaciDrax(a, (m) => nemasurataDinModel(m, plan)), stare, plan };
}

const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');
const dupaText = (p: string, q: string) => p.localeCompare(q);
const PARTI: ParteZiDrax[] = ['dimineata', 'seara'];
const NUME_PARTE: Record<ParteZiDrax, string> = { dimineata: 'dimineața', seara: 'seara' };
const areParte = (x: IndicatieMasinaDrax, p: ParteZiDrax) => x.parti[p].kmSapt >= 0.5;
const cuMajuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── unde stă mașina pe o parte a zilei ─────────────────────────────────
/** un loc de parcare (plan sau GPS) ori «casa e în drum» (decizia planului: `casaInDrum`) */
export type LocEfectivDrax =
  | { fel: 'loc'; loc: LocParcareDrax }
  | { fel: 'casaInDrum'; dupaLant: boolean; spre: string | null }
  | null;

/** locul din GPS, adus la forma planului; «acasă» când satul e satul mașinii sau apare în eticheta drumului acasă */
function locDinGps(l: LocDrax | null, casa: string | null, eticheta: string | null): LocParcareDrax | null {
  if (!l) return null;
  if (l.tip === 'uzina') return { unde: 'uzină', departeDeCasaKm: null, acasaEChiarLocul: false };
  if (!l.sat) return null;
  const acasa = l.sat === casa || (eticheta?.split(' / ').includes(l.sat) ?? false);
  return { unde: l.sat, departeDeCasaKm: null, acasaEChiarLocul: acasa };
}

/** «casa în drum» e decizia planului (`casaInDrum`); locul e al planului; fără plan sau fără loc în plan, cel din GPS */
export function locEfectiv(x: IndicatieMasinaDrax, p: ParteZiDrax, plan: PlanSchimbDrax | null): LocEfectivDrax {
  const lp = locuriParcare(x.m, plan);
  if (lp?.casaInDrum[p]) return { fel: 'casaInDrum', dupaLant: lp.dupaLant, spre: lp.preia.length ? lp.preia.join(', ') : null };
  const dinPlan = lp?.locuri[p];
  if (dinPlan) return { fel: 'loc', loc: dinPlan };
  const l = locDinGps(x.parti[p].loc, x.casa, x.parti[p].acasa);
  return l ? { fel: 'loc', loc: l } : null;
}

// ─── sus ────────────────────────────────────────────────────────────────
/** costul de azi pe GPS, pe mașinile măsurate (fără nemăsurate): același total ca «gps» din plan; totalul = suma părților rotunjite */
const costAzi = (c: CeFaciDrax) => ({ ...c.kmParti, total: Math.round(c.kmParti.dimineata) + Math.round(c.kmParti.seara) });

/** ora cursei de noapte: din plan, altfel mediana GPS a întoarcerilor de seară */
function cursaDeNoapte(c: CeFaciDrax, plan: PlanSchimbDrax | null): string | null {
  if (plan?.asteptare.seara.cursaDeNoapte) return plan.asteptare.seara.cursaDeNoapte;
  const ore = c.deAratat.map((x) => x.parti.seara.revine).filter((o): o is string => !!o);
  return ore.length ? `~${mediana(ore, dupaText)}` : null;
}

/** estimarea planului (v3.1: dimineață + seară, plafonată pe mașină la GPS), o singură dată, cu leii pe aceeași bază */
function textEstimare(plan: PlanSchimbDrax): string {
  const a = plan.asteptare;
  const lei = a.leiSapt != null && a.leiSapt > 0 ? `; ≈ ${nr(a.leiSapt)} lei pe mașinile cu normă` : '';
  return `Estimare: dacă mașinile stau parcate între curse, golul scade cu ≈ ${nr(a.kmSapt)} km pe săptămână `
    + `(≈ ${nr(a.dimineata.estimare)} dimineața, ≈ ${nr(a.seara.estimare)} seara${lei}).`;
}

export function sectiuneaDeSus(c: CeFaciDrax, plan: PlanSchimbDrax | null): string[] {
  const azi = costAzi(c);
  if (azi.total < 0.5) return ['Săptămâna asta mașinile măsurate nu merg acasă între curse.'];
  const noapte = cursaDeNoapte(c, plan);
  const randuri = [
    `Azi mașinile fac ≈ ${nr(azi.total)} km pe săptămână goi mergând acasă între curse: ≈ ${nr(azi.dimineata)} km dimineața `
      + `(după tur, până la cursa de după-amiază) și ≈ ${nr(azi.seara)} km seara (după retur, până la cursa de la miezul nopții).`,
    'Dimineața: mașina stă parcată la capătul cursei următoare sau la uzină — se poate cere de luni. '
      + (plan?.asteptare.seara.intrebare.masinaMica
        ? `Seara: mașina stă parcată până la cursa de ${noapte ?? 'noapte'}, iar șoferul merge acasă cu o mașină mică acolo unde se plătește (mai jos, pe mașină).`
        : `Seara: depinde dacă șoferul are cu ce veni la cursa de ${noapte ?? 'noapte'} — o singură întrebare pentru Ion.`),
  ];
  if (plan) randuri.push(textEstimare(plan));
  return randuri;
}

// ─── întrebarea de seară ────────────────────────────────────────────────
/** o mașină din întrebare: locul de seară și distanța până acasă (din plan; fără plan, din GPS, fără distanță) */
interface PrivitaSeara { m: string; unde: string | null; departeDeCasaKm: number | null; nemasurata: boolean }

const cuDistanta = (p: PrivitaSeara) =>
  `${p.m}${p.departeDeCasaKm != null ? ` ${nr(p.departeDeCasaKm)} km` : ''}${p.nemasurata ? ' (nemăsurată)' : ''}`;

/** unde rămâne mașina seara, pe flotă: «la capătul liniei», cu excepțiile de la uzină */
function undeSeara(privite: PrivitaSeara[]): string {
  const laUzina = privite.filter((p) => p.unde === 'uzină').map((p) => p.m);
  if (laUzina.length === privite.length) return 'la uzină';
  return laUzina.length ? `la capătul liniei (${laUzina.join(', ')} la uzină)` : 'la capătul liniei';
}

interface DateIntrebare { privite: PrivitaSeara[]; de: string | null; kmAzi: number; estimare: number | null }

/** cu plan: lista, orele și sumele sunt ale planului (`asteptare.seara.intrebare`) */
function dinPlan(plan: PlanSchimbDrax): DateIntrebare {
  const q = plan.asteptare.seara.intrebare;
  const ore = q.masini.map((x) => x.de).filter((o): o is string => !!o);
  return {
    privite: q.masini.map((x) => ({ m: x.m, unde: x.unde, departeDeCasaKm: x.departeDeCasaKm, nemasurata: !x.masurat })),
    de: ore.length ? mediana(ore, dupaText) : null, kmAzi: q.gpsKmSapt, estimare: q.estimareKmSapt,
  };
}

/** fără plan: mașinile din listă cu seara departe de sat, din GPS */
function dinGps(c: CeFaciDrax): DateIntrebare {
  const masini = c.deAratat.filter((x) => {
    if (!areParte(x, 'seara')) return false;
    const l = locEfectiv(x, 'seara', null);
    return !(l?.fel === 'casaInDrum' || (l?.fel === 'loc' && l.loc.acasaEChiarLocul));
  });
  const privite = masini.map((x) => {
    const l = locEfectiv(x, 'seara', null);
    return { m: x.m, unde: l?.fel === 'loc' ? l.loc.unde : null, departeDeCasaKm: null, nemasurata: false };
  }).sort((p, q) => p.m.localeCompare(q.m));
  const ore = masini.map((x) => x.parti.seara.termina).filter((o): o is string => !!o);
  return { privite, de: ore.length ? mediana(ore, dupaText) : null, kmAzi: masini.reduce((s, x) => s + x.parti.seara.kmSapt, 0), estimare: null };
}

const zec = (x: number) => x.toLocaleString('ro-RO', { maximumFractionDigits: 2 });

/** v3.2 — răspunsul lui Ion la întrebarea de seară: mașina mică. Pe mașină, cât rămâne pe lună ca să plătească mașina mică
 *  (autobuzul fără salariu, mașina mică dus-întors în fiecare seară); costul fix al mașinii mici nu se presupune. */
export function masinaMicaSeara(plan: PlanSchimbDrax | null): string | null {
  const q = plan?.asteptare.seara.intrebare;
  const ip = q?.masinaMica;
  if (!q || !ip || !q.masini.length || !q.masini.every((x) => x.masinaMica)) return null;
  const cuSold = q.masini.filter((x) => x.masinaMica!.soldLuna != null).sort((a, b) => b.masinaMica!.soldLuna! - a.masinaMica!.soldLuna!);
  const plus = cuSold.filter((x) => x.masinaMica!.soldLuna! > 0), minus = cuSold.filter((x) => x.masinaMica!.soldLuna! <= 0);
  const faraNorma = q.masini.filter((x) => x.masinaMica!.soldLuna == null).map((x) => x.m);
  const privite = q.masini.map((x) => ({ m: x.m, unde: x.unde, departeDeCasaKm: x.departeDeCasaKm, nemasurata: !x.masurat }));
  const noapte = plan!.asteptare.seara.cursaDeNoapte;
  return `Seara, propunerea lui Ion: mașina rămâne parcată ${undeSeara(privite)} până la cursa de noapte${noapte ? ` (${noapte})` : ''}, `
    + `iar șoferul merge acasă și înapoi cu o mașină mică (${ip.litri} l/100 km${ip.leiKm != null ? `, ≈ ${zec(ip.leiKm)} lei/km` : ''}). `
    + `Cât rămâne pe lună ca să plătească mașina mică: ${plus.map((x) => `${x.m} ${nr(x.masinaMica!.soldLuna!)} lei`).join(', ') || 'la nicio mașină'}. `
    + `Merită acolo unde mașina mică costă pe lună mai puțin decât cifra. `
    + (minus.length ? `Nu merită: ${minus.map((x) => x.m).join(', ')} (casa e prea aproape, autobuzul face puțin în plus). ` : '')
    + (faraNorma.length ? `Fără normă în bază, deci fără lei: ${faraNorma.join(', ')}. ` : '')
    + `Socoteala: km scutiți autobuzului × costul lui pe km fără salariu (șoferul e plătit la fel), minus mașina mică dus-întors în fiecare seară.`;
}

/** întrebarea de seară, o singură dată pe flotă: locul, distanța până acasă pe mașină și km de azi care depind de ea */
export function intrebareSeara(c: CeFaciDrax, plan: PlanSchimbDrax | null): string | null {
  const mica = masinaMicaSeara(plan);
  if (mica) return mica;
  const d = plan ? dinPlan(plan) : dinGps(c);
  if (!d.privite.length) return null;
  const noapte = cursaDeNoapte(c, plan);
  const n = d.privite.length;
  const cuDist = d.privite.some((p) => p.departeDeCasaKm != null);
  const estimare = d.estimare != null ? `; estimare de tăiat ≈ ${nr(d.estimare)}` : '';
  return `Întrebarea pentru Ion: seara${d.de ? `, după întoarcerea de ~${d.de}` : ''}, mașina ar rămâne parcată ${undeSeara(d.privite)} `
    + `până pleacă spre cursa de noapte${noapte ? ` (${noapte})` : ''}. Are șoferul cum ajunge de acolo acasă și înapoi la mașină, `
    + `sau poate aștepta lângă ea? Privește ${n} ${n === 1 ? 'mașină' : 'mașini'}${cuDist ? ', cu distanța până acasă' : ''}: `
    + `${d.privite.map(cuDistanta).join(', ')}. De răspuns depind ≈ ${nr(d.kmAzi)} km pe săptămână de azi (pe mașinile măsurate${estimare}).`;
}

// ─── pe mașină ──────────────────────────────────────────────────────────
function aceeasi(a: LocEfectivDrax, b: LocEfectivDrax): boolean {
  if (!a || !b || a.fel !== b.fel) return false;
  if (a.fel === 'casaInDrum' && b.fel === 'casaInDrum') return a.spre === b.spre && a.dupaLant === b.dupaLant;
  return a.fel === 'loc' && b.fel === 'loc' && a.loc.unde === b.loc.unde && a.loc.acasaEChiarLocul === b.loc.acasaEChiarLocul;
}

function dispozitie(cand: string, l: LocEfectivDrax, casa: string | null): string | null {
  const Cand = cuMajuscula(cand);
  if (!l) return null;
  if (l.fel === 'casaInDrum') {
    if (l.dupaLant && l.spre) return `${Cand}, după schimbul de linii, trece pe acasă${casa ? ` (${casa})` : ''} în drum spre ${l.spre} — nu mai e drum în plus; să nu mai umble cu ea între curse.`;
    return `${Cand} poate sta acasă, e în drum spre cursa următoare; să nu mai umble cu ea între curse.`;
  }
  if (l.loc.acasaEChiarLocul) return `${Cand} stă parcată la ${l.loc.unde}, chiar în satul lui, și nu mai umblă prin sat.`;
  return `${Cand} stă parcată la ${l.loc.unde}.`;
}

/** o frază pe mașină: cele două bucăți de azi (GPS) și unde stă parcată fiecare (plan, altfel GPS) */
export function frazaMasina(x: IndicatieMasinaDrax, plan: PlanSchimbDrax | null): string {
  const parti = PARTI.filter((p) => areParte(x, p));
  const cat = parti.map((p) => `${NUME_PARTE[p]} ≈ ${nr(x.parti[p].kmZi)} km`).join(', ');
  const cine = `${x.m}${x.casa ? ` (${x.casa})` : ''}`;
  const problema = `${cine} — azi merge acasă între curse: ${cat} pe zi (${nr(x.kmSapt)} pe săptămână).`;
  const locuri = parti.map((p) => locEfectiv(x, p, plan));
  const ce = locuri.length === 2 && aceeasi(locuri[0], locuri[1])
    ? [dispozitie('dimineața și seara', locuri[0], x.casa)]
    : parti.map((p, i) => dispozitie(NUME_PARTE[p], locuri[i], x.casa));
  const nota = locuriParcare(x.m, plan)?.dupaLant ? ' Locurile sunt cele de după schimbul de linii din plan.' : '';
  return `${problema} ${ce.filter(Boolean).join(' ')}${nota}`.trim();
}

// ─── rândurile de sub listă ─────────────────────────────────────────────
export function textDoarMici(c: CeFaciDrax): string | null {
  const n = c.doarMici.length;
  if (!n) return null;
  return `Alte ${n} ${n === 1 ? 'mașină merge' : 'mașini merg'} acasă între curse mai puțin de ${PRAG_KM_ZI} km pe zi `
    + `(${nr(c.kmGrupe.doarMici)} km pe săptămână împreună) — nu merită o dispoziție.`;
}

export function textNemasurate(c: CeFaciDrax, plan: PlanSchimbDrax | null): string | null {
  if (!c.nemasurate.length) return null;
  const lista = c.nemasurate.map((x) => {
    if (x.kmSapt > 0) return `${x.m} (${x.zileMasurate} ${x.zileMasurate === 1 ? 'zi măsurată' : 'zile măsurate'} din ${x.zileLucrate}, ≈ ${nr(x.kmSapt)} km pe săptămână)`;
    const model = kmModelNemasurata(x.m, plan);
    return `${x.m} (nicio zi măsurată${model != null ? `; estimare: ≈ ${nr(model)} km pe săptămână` : ''})`;
  });
  return `Nemăsurate destul, de verificat: ${lista.join(', ')}.`;
}

/** detaliile la apăsare: zilele și orele fiecărui drum acasă */
export function orePeZile(x: IndicatieMasinaDrax): string[] {
  return x.cazuri.flatMap((c) => c.zile)
    .sort((p, q) => p.z.localeCompare(q.z) || p.ora.localeCompare(q.ora))
    .map((d) => `${ziScurt(d.z)}, ${d.ora}: ${nr(d.km)} km în plus pe acasă (${durata(d.asteptareMin)} între curse)`);
}

/** nota cardului «Gol între curse»: părțile de azi care dau cifra cardului (rotunjite pe parte, deci «≈») */
export function textCard(c: CeFaciDrax): string {
  const parti = [`dimineața ${nr(c.kmParti.dimineata)}`, `seara ${nr(c.kmParti.seara)}`];
  if (c.kmGrupe.nemasurate >= 0.5) parti.push(`nemăsurate ${nr(c.kmGrupe.nemasurate)}`);
  return `Cost de azi, pe GPS: ${parti.join(' + ')} ≈ ${nr(c.card)} km. Mașinile din listă (peste ${PRAG_KM_ZI} km pe zi): `
    + `${nr(c.kmGrupe.deAratat)} · sub prag: ${nr(c.kmGrupe.doarMici)} km.`;
}
