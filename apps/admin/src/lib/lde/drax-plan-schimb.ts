// Planul Drăxlmaier (ION-108): partea A îl scrie pe VPS în rândul săptămânii (`planSchimb`, contractul §6 din plan-v3, cu câmpurile «v3.1»), aici se
// citește cu gardă strictă și se spune în cuvinte. Pârghia principală: între curse mașina stă parcată; cât se taie e o ESTIMARE
// de model și apare o singură dată. Schimbul de linii stă doar în secțiunea lui, publicat numai când e verificat pe săptămâna
// precedentă (schimburile inversate); textul numește LINIA, nu schimbul. Funcții pure.
import type {
  AnalizaDrax, AsteptareMasinaDrax, CasaInDrumDrax, GpsEstimareDrax, IntrebareSearaMasinaDrax, KmPartiDrax, LantSchimbDrax,
  LocParcareDrax, LocuriParcareDrax, MasinaLantDrax, MutareSchimbDrax, PlanSchimbDrax,
} from './drax-analiza';

/** o mașină fără destule zile GPS intră la «nemăsurate» dacă modelul îi dă cel puțin atâția km pe zi */
export const PRAG_NEMASURATA_KM_ZI = 20;

// ─── garda: JSON scris de alt proces; fiecare câmp citit de pagină se verifică ────
const esteText = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const esteNumar = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const numarSauNull = (x: unknown) => x === null || esteNumar(x);
const textSauNull = (x: unknown) => x === null || esteText(x);
const esteObiect = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const listaDe = <T>(x: unknown, e: (y: unknown) => y is T): x is T[] => Array.isArray(x) && x.every(e);
const sauNull = <T>(e: (y: unknown) => y is T) => (x: unknown): x is T | null => x === null || e(x);

const esteMutare = (x: unknown): x is MutareSchimbDrax => esteObiect(x)
  && esteText(x.linie) && textSauNull(x.tur) && textSauNull(x.retur) && (x.tur != null || x.retur != null)
  && esteText(x.nume) && esteText(x.dela) && esteText(x.la)
  && (x.zile === undefined || esteNumar(x.zile)) && (x.schimbInSaptamana === undefined || typeof x.schimbInSaptamana === 'string');
const esteMasinaLant = (x: unknown): x is MasinaLantDrax => esteObiect(x) && esteText(x.m) && esteNumar(x.kmSapt);
const esteLant = (x: unknown): x is LantSchimbDrax => esteObiect(x) && esteNumar(x.economieKmSapt) && numarSauNull(x.economieRotatie)
  && numarSauNull(x.leiSapt) && listaDe(x.faraNorma, esteText) && listaDe(x.peMasina, esteMasinaLant)
  && listaDe(x.mutari, esteMutare) && x.mutari.length > 0;
const esteKmParti = (x: unknown): x is KmPartiDrax => esteObiect(x)
  && esteNumar(x.dimineata) && esteNumar(x.seara) && esteNumar(x.intreCurse) && esteNumar(x.total);
const esteLoc = (x: unknown): x is LocParcareDrax => esteObiect(x) && esteText(x.unde) && numarSauNull(x.departeDeCasaKm)
  && typeof x.acasaEChiarLocul === 'boolean';
const esteLocuri = (x: unknown): x is LocuriParcareDrax => esteObiect(x)
  && sauNull(esteLoc)(x.dimineata) && sauNull(esteLoc)(x.seara) && sauNull(esteLoc)(x.intreCurse);
const esteCasaInDrum = (x: unknown): x is CasaInDrumDrax => esteObiect(x)
  && typeof x.dimineata === 'boolean' && typeof x.seara === 'boolean';
const esteAsteptareMasina = (x: unknown): x is AsteptareMasinaDrax => esteObiect(x) && esteText(x.m) && esteNumar(x.kmSapt)
  && esteNumar(x.kmZi) && sauNull(esteKmParti)(x.gps) && esteLocuri(x.asteapta) && esteCasaInDrum(x.casaInDrum)
  && (x.dupaLant == null || (esteObiect(x.dupaLant) && esteLocuri(x.dupaLant.asteapta) && esteCasaInDrum(x.dupaLant.casaInDrum)));
const esteNemasurata = (x: unknown): x is PlanSchimbDrax['asteptare']['nemasurate'][number] => esteObiect(x)
  && esteText(x.m) && esteText(x.zileGps) && esteNumar(x.kmSapt);
const esteIntrebareMasina = (x: unknown): x is IntrebareSearaMasinaDrax => esteObiect(x) && esteText(x.m) && esteText(x.unde)
  && numarSauNull(x.departeDeCasaKm) && numarSauNull(x.gpsSeara) && esteNumar(x.estimareSeara)
  && textSauNull(x.de) && textSauNull(x.pana) && typeof x.masurat === 'boolean';
const esteGpsEstimare = (x: unknown): x is GpsEstimareDrax => esteObiect(x) && esteNumar(x.gps) && esteNumar(x.estimare);

const esteIntrebare = (q: unknown): q is PlanSchimbDrax['asteptare']['seara']['intrebare'] => esteObiect(q)
  && listaDe(q.masini, esteIntrebareMasina) && esteNumar(q.gpsKmSapt) && esteNumar(q.estimareKmSapt) && listaDe(q.nemasurate, esteText);
const esteSeara = (x: unknown): x is PlanSchimbDrax['asteptare']['seara'] => esteObiect(x)
  && esteNumar(x.gps) && esteNumar(x.estimare) && textSauNull(x.cursaDeNoapte) && esteIntrebare(x.intrebare);
function esteAsteptare(x: unknown): x is PlanSchimbDrax['asteptare'] {
  return esteObiect(x) && esteGpsEstimare(x.dimineata) && esteSeara(x.seara) && esteNumar(x.kmSapt) && numarSauNull(x.leiSapt)
    && listaDe(x.masini, esteAsteptareMasina) && listaDe(x.nemasurate, esteNemasurata);
}
function esteSchimb(x: unknown): x is PlanSchimbDrax['schimb'] {
  return esteObiect(x) && (x.stare === 'verificat' || x.stare === 'neverificat') && esteNumar(x.kmSapt) && numarSauNull(x.leiSapt)
    && esteNumar(x.lanturiFaraLei) && listaDe(x.lanturi, esteLant) && esteNumar(x.neconfirmateKmSapt);
}
export function estePlanSchimb(x: unknown): x is PlanSchimbDrax {
  return esteObiect(x) && esteText(x.sapt) && esteObiect(x.rotatie) && textSauNull(x.rotatie.verificatPe)
    && esteAsteptare(x.asteptare) && esteSchimb(x.schimb);
}

// ─── starea planului în rând ────────────────────────────────────────────
export type StarePlanDrax =
  | { stare: 'ok'; plan: PlanSchimbDrax }
  | { stare: 'lipsa' }
  | { stare: 'indisponibil'; motiv: string | null };

/** lipsă (rând de dinainte de partea A) ≠ indisponibil (calcul eșuat, formă greșită sau plan de altă săptămână) */
export function planDinRand(a: AnalizaDrax): StarePlanDrax {
  if (a.planSchimb === undefined && !a.planSchimbLipsa) return { stare: 'lipsa' };
  if (a.planSchimb == null) return { stare: 'indisponibil', motiv: a.planSchimbLipsa ?? null };
  if (!estePlanSchimb(a.planSchimb)) return { stare: 'indisponibil', motiv: 'forma planului nu e cea așteptată' };
  if (a.planSchimb.sapt !== a.saptamina) return { stare: 'indisponibil', motiv: `planul e al săptămânii ${a.planSchimb.sapt}` };
  return { stare: 'ok', plan: a.planSchimb };
}
export const planOk = (s: StarePlanDrax): PlanSchimbDrax | null => (s.stare === 'ok' ? s.plan : null);

/** schimbul se publică doar verificat pe săptămâna precedentă și cu cel puțin un lanț */
export const schimbPublicat = (p: PlanSchimbDrax | null): boolean =>
  !!p && p.schimb.stare === 'verificat' && p.rotatie.verificatPe != null && p.schimb.lanturi.length > 0;

export interface ParcarePlanDrax {
  locuri: LocuriParcareDrax;
  /** pe parte: casa e în drum spre cursa următoare (decizia planului), pe același calendar ca locurile */
  casaInDrum: CasaInDrumDrax;
  dupaLant: boolean;
  /** liniile pe care mașina le preia în lanțul publicat (nume de afișat) */
  preia: string[];
}

/** locurile de parcare ale mașinii: după lanț când lanțul ei e publicat, altfel cele de azi; null = mașina nu e în plan */
export function locuriParcare(m: string, p: PlanSchimbDrax | null): ParcarePlanDrax | null {
  const x = p?.asteptare.masini.find((q) => q.m === m);
  if (!x) return null;
  const lant = schimbPublicat(p) ? p!.schimb.lanturi.find((l) => l.mutari.some((q) => q.dela === m || q.la === m)) : undefined;
  if (lant && x.dupaLant) {
    const preia = lant.mutari.filter((q) => q.la === m).map((q) => q.nume);
    return { locuri: x.dupaLant.asteapta, casaInDrum: x.dupaLant.casaInDrum, dupaLant: true, preia };
  }
  return { locuri: x.asteapta, casaInDrum: x.casaInDrum, dupaLant: false, preia: [] };
}

/** mașina fără destule zile GPS pe care modelul o arată cu drum acasă (≥ 20 km/zi): intră la «nemăsurate» */
export function nemasurataDinModel(m: string, p: PlanSchimbDrax | null): boolean {
  const x = p?.asteptare.masini.find((q) => q.m === m);
  return !!x && x.gps === null && x.kmZi >= PRAG_NEMASURATA_KM_ZI;
}
export const kmModelNemasurata = (m: string, p: PlanSchimbDrax | null): number | null =>
  p?.asteptare.nemasurate.find((q) => q.m === m)?.kmSapt ?? null;

// ─── textul secțiunii «Planul de schimb» ────────────────────────────────
const nr = (x: number) => Math.round(x).toLocaleString('ro-RO');

export function textStarePlan(s: StarePlanDrax): string {
  if (s.stare === 'lipsa') return 'Planul se calculează luni: care linie trece la care mașină, ca flota să meargă mai puțin gol.';
  if (s.stare === 'indisponibil') return `Planul de schimb nu e disponibil săptămâna asta${s.motiv ? ` (${s.motiv})` : ''}.`;
  const sc = s.plan.schimb;
  if (schimbPublicat(s.plan)) {
    const lei = sc.lanturiFaraLei === 0 && sc.leiSapt != null ? ` (≈ ${nr(sc.leiSapt)} lei)` : '';
    return `După ce mașinile stau parcate între curse, schimbul de linii mai taie ≈ ${nr(sc.kmSapt)} km pe săptămână${lei} `
      + `(estimare; verificat și pe săptămâna ${s.plan.rotatie.verificatPe}, cu schimburile inversate).`;
  }
  if (sc.neconfirmateKmSapt >= 0.5) {
    return `Schimbul de linii: încercare, neverificată pe săptămâna precedentă — nu se aplică (ar tăia ≈ ${nr(sc.neconfirmateKmSapt)} km, estimare).`;
  }
  return 'Schimbul de linii nu găsește nimic de tăiat după ce mașinile stau parcate între curse.';
}

/** fraza unei mașini din lanț: ce dă, ce ia și cât merge în plus sau în minus */
function frazaMasinaLant(m: string, l: LantSchimbDrax): string {
  const da = l.mutari.filter((x) => x.dela === m).map((x) => `${x.nume} lui ${x.la}`);
  const ia = l.mutari.filter((x) => x.la === m).map((x) => x.nume);
  const km = l.peMasina.find((x) => x.m === m)?.kmSapt ?? 0;
  const efect = km > 0.5 ? `merge cu ≈ ${nr(km)} km mai mult pe săptămână` : km < -0.5 ? `merge cu ≈ ${nr(-km)} km mai puțin pe săptămână` : 'merge la fel';
  const parti = [da.length ? `dă ${da.join(', ')}` : null, ia.length ? `ia ${ia.join(', ')}` : null].filter(Boolean).join(' și ');
  return `${m} ${parti}: ${efect}.`;
}

/** lanțul în cuvinte: fraza fiecărei mașini, apoi flota */
export function textLant(l: LantSchimbDrax): string {
  const masini = [...new Set(l.mutari.flatMap((x) => [x.dela, x.la]))];
  const rotatie = l.economieRotatie != null ? `; pe săptămâna cu schimburile inversate −${nr(l.economieRotatie)}` : '';
  return `${masini.map((m) => frazaMasinaLant(m, l)).join(' ')} Flota: −${nr(Math.max(0, l.economieKmSapt))} km pe săptămână (estimare${rotatie}).`;
}

export const textLeiLant = (l: LantSchimbDrax): string | null =>
  (l.leiSapt != null ? `≈ ${nr(l.leiSapt)} lei` : l.faraNorma.length ? `fără lei: ${l.faraNorma.join(', ')} fără normă` : null);
