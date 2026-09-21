/**
 * Consemnarea foilor pe care tomberon-sync NU le poate trimite la terminal
 * (mașină lipsă în nomenclator, șofer nemapat, insert eșuat…).
 *
 * Până pe 21.09 de aici pleca o alertă în privatul adminilor. Ion a scos-o («nu
 * am nevoie toate aceste să vină la mine»), iar regula lui e limpede: ce trebuie
 * să plece în Mejgorod — pleacă, ce nu — rămâne în bază. Foile netrimise nu-s
 * treaba șoferilor, deci rămân FAPT în bot_storage (`tomberon:skip_log`) și se
 * citesc la cerere. Ce nu se scrie nicăieri dispare: pe 13.08.2026 patru curse
 * au stat 9 zile fără f/parcurs fiindcă trăiau doar în tomberon-sync.log, pe VPS.
 *
 * Sync-ul rulează din 10 în 10 minute, deci o problemă nerezolvată ar scrie ~100
 * de rânduri pe zi. Regula: fiecare (foaie, cod) se consemnează O SINGURĂ dată
 * pe zi, și doar dacă persistă peste GRACE_MS — dimineața devreme dispecerul
 * încă completează graficul, iar o mașină care apare la 06:00 nu e un incident.
 *
 * Cheia de deduplicare folosește `cod` (mulțime închisă), NU textul `motiv`:
 * motivul conține plăcuța sau mesajul MS SQL, care se schimbă de la o rulare la
 * alta — cu el în cheie cronometrul s-ar reseta mereu și rândul n-ar fi scris NICIODATĂ.
 */
export const SKIP_CODES = ['nemapat', 'fara_masina', 'auto_lipsa', 'insert_esuat', 'foaie_nenumerica', 'orfana', 'diferit'] as const;
export type SkipCode = (typeof SKIP_CODES)[number];

export type SkipItem = { foaie: string; sofer: string; cod: SkipCode; motiv: string };
export type SkipEntry = { firstSeen: number; alerted: boolean };
/** Stare per zi: sync-ul trimite AZI și MÂINE (curse de noapte — șoferul vine cu
 *  foaia de mâine din ajun), iar zilele care nu mai apar în payload cad singure. */
export type SkipState = { zile: Record<string, Record<string, SkipEntry>> };

export const GRACE_MS = 20 * 60 * 1000;
/** Jurnalul stă într-un singur rând JSON din bot_storage: ține două săptămâni,
 *  cât să se vadă o problemă care se repetă, și nu crește la nesfârșit. */
export const JURNAL_ZILE = 14;

const skipKey = (s: SkipItem) => `${s.foaie}|${s.cod}`;

export type ZiSkips = { ziua: string; skips: SkipItem[] };
export type Alerta = { ziua: string; items: SkipItem[] };

export function decideAlerts(
  prev: SkipState | null,
  zile: ZiSkips[],
  nowMs: number,
): { alerts: Alerta[]; state: SkipState } {
  const state: SkipState = { zile: {} };
  const alerts: Alerta[] = [];

  for (const { ziua, skips } of zile) {
    const base = prev?.zile?.[ziua] ?? {};
    const items: Record<string, SkipEntry> = {};
    const deAlertat: SkipItem[] = [];

    for (const skip of skips) {
      const k = skipKey(skip);
      // Problemele rezolvate nu se copiază în starea nouă → dacă revin, cronometrul reîncepe.
      const entry = items[k] ?? base[k] ?? { firstSeen: nowMs, alerted: false };
      if (!entry.alerted && nowMs - entry.firstSeen >= GRACE_MS) {
        deAlertat.push(skip);
        entry.alerted = true;
      }
      items[k] = entry;
    }

    state.zile[ziua] = items;
    if (deAlertat.length) alerts.push({ ziua, items: deAlertat });
  }

  return { alerts, state };
}

/** Anulează marcajul «consemnat» când scrierea în bază n-a reușit, ca următoarea
 *  rulare (peste 10 min) să reîncerce. Altfel o singură scriere eșuată ar face
 *  problema să tacă toată ziua — exact eșecul pe care featureul îl vânează. */
export function marcheazaNetrimis(state: SkipState, alerta: Alerta): SkipState {
  const items = state.zile[alerta.ziua];
  if (!items) return state;
  for (const item of alerta.items) {
    const entry = items[skipKey(item)];
    if (entry) entry.alerted = false;
  }
  return state;
}

/** Un rând de jurnal: exact ce a raportat sync-ul, plus clipa când problema a
 *  trecut de răgaz. `vazut_la` e ISO, ca să se poată citi fără cod. */
export type JurnalIntrare = SkipItem & { ziua: string; vazut_la: string };
export type SkipLog = { intrari: JurnalIntrare[] };

/**
 * Adaugă în jurnal ce tocmai a trecut de răgaz și taie ce e mai vechi de
 * JURNAL_ZILE, socotit după ZIUA FOII, nu după clipa scrierii: o foaie de mâine
 * (curse de noapte) n-are voie să cadă din jurnal mai devreme decât una de azi.
 *
 * Idempotentă pe (zi, foaie, cod), cu `vazut_la` cel dintâi: jurnalul se scrie
 * ÎNAINTE de stare, deci o stare nesalvată face următoarea rulare să aducă
 * aceleași rânduri. Mai bine un fapt scris o dată decât unul scris de zece ori.
 * Funcție pură — salvarea o face ruta.
 */
export function adaugaInJurnal(
  prev: SkipLog | null,
  alerte: Alerta[],
  acum: Date,
): SkipLog {
  const vazutLa = acum.toISOString();
  const limita = new Date(acum.getTime() - JURNAL_ZILE * 24 * 3600 * 1000)
    .toISOString().slice(0, 10);
  const dupaCheie = new Map<string, JurnalIntrare>();
  for (const x of prev?.intrari ?? []) dupaCheie.set(`${x.ziua}|${skipKey(x)}`, x);
  for (const { ziua, items } of alerte) {
    for (const it of items) {
      const k = `${ziua}|${skipKey(it)}`;
      if (!dupaCheie.has(k)) dupaCheie.set(k, { ...it, ziua, vazut_la: vazutLa });
    }
  }
  return { intrari: [...dupaCheie.values()].filter((x) => x.ziua >= limita) };
}
