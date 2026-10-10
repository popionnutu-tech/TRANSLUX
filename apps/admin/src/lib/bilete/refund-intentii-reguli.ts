/**
 * Regulile PURE ale intenției de refund (migr. 558; dezbaterea Claude ⇄ Codex 10.10.2026, N2 + C3 + Codex C1). Fără bază,
 * fără rețea — testate exact. Mașina de stări stă în SQL (revendicarea, finalizarea) și în refund-intentii.ts (banca);
 * aici sunt deciziile: ce pas urmează, când se poate trimite, ce înseamnă urma băncii după un rezultat necunoscut,
 * cât se așteaptă după un refuz.
 */

export type StareIntentie = 'de_trimis' | 'revendicata' | 'trimisa_necunoscut' | 'creata' | 'finalizata' | 'refuzata' | 'anulata'
  /** Revizia 10.10 (H2/H1): Manual la bancă, sau refund străin pe plată — fără retrimitere automată, vizibilă. */
  | 'blocata'
  /** Revizia 10.10 (H1): membrii returnați de alt mecanism (fluxul vechi). */
  | 'finalizata_de_altul';

/** Stările din care nu mai urmează nimic (nici în coadă, nici în «Returnări de bani în curs»). */
export const STARI_INCHISE: readonly StareIntentie[] = ['finalizata', 'anulata', 'finalizata_de_altul'];

/** Cât ține o revendicare: token + getPayment + refundPayment (8 s fiecare) cu rezervă largă. */
export const TERMEN_REVENDICARE_S = 120;
/** După un POST fără răspuns clar, banca se citește abia după atât (orice cerere în zbor s-a încheiat de mult). */
export const LINISTE_DUPA_TRIMITERE_MS = 10 * 60_000;
/** Câte trimiteri la bancă are o intenție; după, rămâne «refuzata» blocată (vizibilă în /bilete, alertă o dată). */
export const INCERCARI_MAX = 5;
/** Pauzele după al n-lea refuz (n = 1, 2, …): banca poate refuza temporar; al doilea refund parțial (D6) e încă nedecis. */
export const PAUZE_REFUZ_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
/** Cât se reverifică un refund creat, încă neacceptat. */
export const VERIFICARE_CREAT_MS = 10 * 60_000;
/** O urmă neclară la bancă (nici zero, nici suma) se recitește după atât. */
export const RECITIRE_NECLAR_MS = 60 * 60_000;
/** H2: un refund «Manual» la bancă se recitește (doar citire) după atât. */
export const RECITIRE_BLOCATA_MS = 6 * 60 * 60_000;

/** Ce face workerul cu o intenție revendicată, după starea în care a primit-o. */
export function pasul(stare: StareIntentie): 'trimite' | 'impaca' | 'verifica' | 'nimic' {
  if (stare === 'revendicata') return 'trimite';
  if (stare === 'trimisa_necunoscut') return 'impaca';
  if (stare === 'creata') return 'verifica';
  // H2: «blocata» se revendică doar cu refund_id (SQL) — și atunci doar se citește banca, nu se retrimite.
  if (stare === 'blocata') return 'verifica';
  return 'nimic';
}

/** Pauza după `incercari` trimiteri refuzate; null = gata, intenția rămâne blocată (vizibilă), nu «făcută». */
export function pauzaDupaRefuz(incercari: number): number | null {
  if (!(incercari >= 1) || incercari >= INCERCARI_MAX) return null;
  return PAUZE_REFUZ_MS[Math.min(incercari, PAUZE_REFUZ_MS.length) - 1];
}

export interface PlataMaib {
  status: string;
  amount: number;
  refundedAmount?: number | null;
  requestedRefundAmount?: number | null;
  refundableAmount?: number | null;
  isRefundable?: boolean | null;
  partialRefundAvailable?: boolean | null;
}

/** Urma refund-urilor pe o plată, așa cum o arată getPayment. */
export interface UrmaBanca { returnat: number; cerut: number; returnabil: number | null }

export function urmaBanca(p: PlataMaib): UrmaBanca {
  const n = (x: number | null | undefined) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null);
  return { returnat: n(p.refundedAmount) ?? 0, cerut: n(p.requestedRefundAmount) ?? 0, returnabil: n(p.refundableAmount) };
}

/**
 * Cât s-a mișcat urma băncii față de citirea de dinaintea POST-ului. Documentația maib nu spune dacă «requestedRefundAmount»
 * e doar ce e în curs sau cumulat, deci luăm cea mai mare dintre cele trei mișcări (returnat ↑, cerut ↑, returnabil ↓) —
 * corectă în ambele lecturi, fiindcă pe o plată e cel mult o intenție în zbor (indexul unic din 558).
 */
export function deltaRefund(baza: UrmaBanca, acum: UrmaBanca): number {
  const d = [acum.returnat - baza.returnat, acum.cerut - baza.cerut];
  if (baza.returnabil != null && acum.returnabil != null) d.push(baza.returnabil - acum.returnabil);
  return Math.max(0, ...d);
}

/**
 * Împăcarea după un POST cu rezultat necunoscut (Codex C1: «reconciliere bancară înaintea oricărei retrimiteri; nu
 * considerați refundedAmount=0 dovadă suficientă»): `exista` = urma are toată suma noastră (nu se retrimite);
 * `lipseste` = nicio mișcare în niciunul din cele trei câmpuri, după liniștea de 10 min (se poate retrimite);
 * `neclar` = o mișcare parțială — nimic automat, se recitește și apare în /bilete.
 */
export function clasificaUrma(baza: UrmaBanca, acum: UrmaBanca, suma: number): 'exista' | 'lipseste' | 'neclar' {
  const d = deltaRefund(baza, acum);
  if (d >= suma - 0.01) return 'exista';
  if (d <= 0.009) return 'lipseste';
  return 'neclar';
}

/** Banii au ajuns (refund fără id, găsit la împăcare): returnatul a crescut cu toată suma. */
export function baniiAuAjuns(baza: UrmaBanca, acum: UrmaBanca, suma: number): boolean {
  return acum.returnat - baza.returnat >= suma - 0.01;
}

const st = (s: string | null | undefined) => (s ?? '').toLowerCase();

/**
 * Se poate cere acum refund-ul de `suma` pe plata citită? Plata parțial returnată (al doilea refund al unui tur-retur)
 * e «PartiallyRefunded», nu «Executed». Al doilea refund parțial (D6) se încearcă — dacă maib îl refuză, refuzul e
 * explicit și intenția rămâne vizibilă și reîncercată.
 */
export function poateTrimite(p: PlataMaib, suma: number): { ok: true } | { ok: false; motiv: string } {
  if (!(suma > 0)) return { ok: false, motiv: 'suma refund-ului nu e pozitivă' };
  const s = st(p.status);
  if (s !== 'executed' && s !== 'partiallyrefunded') return { ok: false, motiv: `plata e ${p.status}, nu Executed / PartiallyRefunded` };
  if (p.isRefundable === false) return { ok: false, motiv: 'maib spune că plata nu se poate returna' };
  const u = urmaBanca(p);
  const returnabil = u.returnabil ?? Number(p.amount) - u.returnat;
  if (suma > returnabil + 0.001) return { ok: false, motiv: `suma ${suma} e peste cât se mai poate returna (${returnabil})` };
  // Restul întreg al plății (ex. turul după returul deja returnat) se încearcă și când maib spune «fără refund parțial»;
  // doar o bucată din rest e refuzată aici, fără drum la bancă.
  if (suma < returnabil - 0.001 && p.partialRefundAvailable === false) return { ok: false, motiv: 'maib nu permite refund parțial pe această plată' };
  return { ok: true };
}

/**
 * L1 (revizia 10.10): ce răspuns al băncii la POST /refund e un refuz CLAR (banii sigur n-au plecat, se poate reveni).
 * 4xx da — afară de 429 (prea multe cereri: cererea poate fi fost primită sau nu; se tratează ca rezultat necunoscut, cu
 * împăcare și pauză) și 408 (timeout). «ok:false» cu HTTP 200 (ION-188) e refuz clar. 0 = eroare locală înaintea
 * trimiterii (validare) — nu e de la bancă.
 */
export function refuzClarMaib(httpStatus: number): boolean {
  if (httpStatus === 200) return true;
  if (httpStatus === 429 || httpStatus === 408) return false;
  return httpStatus >= 400 && httpStatus < 500;
}

/** Ce s-a mișcat la bancă pe plată, în total (returnat, cerut, sau suma minus returnabilul — cea mai mare). */
export function miscareBanca(u: UrmaBanca, sumaPlatii: number): number {
  return Math.max(0, u.returnat, u.cerut, u.returnabil != null ? sumaPlatii - u.returnabil : 0);
}

/** Urma refund-ului de pe rândul plății (maib_checkouts), scrisă de oricine — și de fluxul vechi, de dinainte de 558. */
export interface MarcajPlata { refundId: string | null; refundStatus: string | null; actualizatMs: number }

/**
 * H1 (revizia 10.10): înaintea POST-ului, plata are vreun refund care NU e al intențiilor noastre? (În fereastra dintre
 * migrație și deploy, codul vechi trimite singur refund-ul la anulare.) Intrări:
 *   `noastre`   — refund_id-urile intențiilor noastre pe plată (oricare stare);
 *   `atinsa`    — vreo intenție de-a noastră pe plată a trimis vreodată ceva (marcajul «Necunoscut» e atunci al nostru);
 *   `cunoscut`  — suma intențiilor noastre (fără aceasta) pe care banca le poate arăta deja (creata/finalizata/…);
 * Rezultat:
 *   trimite          — nicio urmă străină: se poate trimite;
 *   verifica_strain  — refund_id străin pe plată, fără bani străini vizibili: se citește refund-ul străin (getRefund) și
 *                      se decide cu `dupaRefundStrain`;
 *   adopta           — bani străini exact cât suma noastră, cu refund_id străin: e același refund (fluxul vechi) → intenția
 *                      îl preia («creata» cu acel id) și doar îl urmărește;
 *   asteapta         — marcaj vechi «Pending»/«Necunoscut» fără id, mai nou decât liniștea: poate fi un POST în zbor;
 *   blocheaza        — bani străini care nu se potrivesc: nimic automat, vizibilă.
 */
export function decizieRefundStrain(a: {
  marcaj: MarcajPlata; noastre: ReadonlySet<string>; atinsa: boolean; cunoscut: number; urma: UrmaBanca; sumaPlatii: number;
  suma: number; nowMs: number;
}): { fel: 'trimite' } | { fel: 'verifica_strain'; refundId: string } | { fel: 'adopta'; refundId: string } | { fel: 'asteapta'; ms: number } | { fel: 'blocheaza'; motiv: string } {
  const strainId = a.marcaj.refundId && !a.noastre.has(a.marcaj.refundId) ? a.marcaj.refundId : null;
  const strainBani = miscareBanca(a.urma, a.sumaPlatii) - a.cunoscut;
  if (strainBani > 0.009) {
    if (strainId && Math.abs(strainBani - a.suma) <= 0.01) return { fel: 'adopta', refundId: strainId };
    return { fel: 'blocheaza', motiv: `banca arată ${Math.round(strainBani * 100) / 100} lei returnați/ceruți în afara intențiilor (refund ${strainId ?? 'fără id la noi'}); nu se trimite nimic automat` };
  }
  if (strainId) return { fel: 'verifica_strain', refundId: strainId };
  const st = (a.marcaj.refundStatus ?? '').toLowerCase();
  const marcajVechi = !a.marcaj.refundId && (st === 'pending' || (st === 'necunoscut' && !a.atinsa));
  if (marcajVechi) {
    const ramas = a.marcaj.actualizatMs + LINISTE_DUPA_TRIMITERE_MS - a.nowMs;
    if (ramas > 0) return { fel: 'asteapta', ms: ramas };
  }
  return { fel: 'trimite' };
}

/** După citirea refund-ului străin (getRefund): respins → zero bani, se poate trimite; aceeași sumă → preluat; altfel blocat. */
export function dupaRefundStrain(r: { status: string; amount: number | null }, suma: number): 'trimite' | 'adopta' | 'blocheaza' {
  const s = r.status.toLowerCase();
  if (s === 'rejected') return 'trimite';
  if (r.amount != null && Math.abs(Number(r.amount) - suma) <= 0.01) return 'adopta';
  return 'blocheaza';
}

/**
 * H2 (revizia 10.10): refund-ul nostru citit cu getRefund. Accepted → finalizare; Manual → «blocata» (nicio retrimitere,
 * se recitește rar); Rejected → retrimitere DOAR dacă banca arată zero mișcare față de urma de dinaintea POST-ului
 * (ca la împăcare); mișcare → «blocata». Restul → în curs.
 */
export function deciziaVerificare(status: string, baza: UrmaBanca, acum: UrmaBanca | null, suma: number): 'finalizeaza' | 'blocheaza' | 'refuza' | 'asteapta' {
  const s = status.toLowerCase();
  if (s === 'accepted') return 'finalizeaza';
  if (s === 'manual') return 'blocheaza';
  if (s === 'rejected') {
    if (!acum) return 'asteapta'; // banca nu s-a putut citi: nu se decide nimic
    return clasificaUrma(baza, acum, suma) === 'lipseste' ? 'refuza' : 'blocheaza';
  }
  return 'asteapta';
}
