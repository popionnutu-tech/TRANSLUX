import { FEREASTRA_FIXARE_DUPA_PLECARE_MS, type ComandaFixare, type RepoMesajeBilet, type TintaFixare } from './bileteTelegram.js';

// ION-251 (Ion, 05.10: «biletul actual care e cel mai apropiat întotdeauna trebuie să fie pin»). În chatul clientului e
// fixat mesajul comenzii plătite cu cea mai apropiată plecare care încă n-a trecut; comanda e «încă a lui» până la
// sosire, iar sosirea nu e în bază, deci plecarea + 6 h. Anulata/returnata pierde pinul la primul tick.

const PLATITA = 'platita';

export type DecizieFixare =
  | { tip: 'nimic' }
  | { tip: 'fixeaza'; tinta: TintaFixare }
  | { tip: 'desfixeaza' };

/** Comanda care trebuie fixată acum, sau null. Pur, testat. */
export function comandaDeFixat(comenzi: readonly ComandaFixare[], nowMs: number): ComandaFixare | null {
  const eligibile = comenzi.filter((c) =>
    c.status === PLATITA
    && c.telegram_mesaj_id != null
    && Date.parse(c.departure_at) + FEREASTRA_FIXARE_DUPA_PLECARE_MS > nowMs);
  if (!eligibile.length) return null;
  return eligibile.reduce((a, b) => (Date.parse(b.departure_at) < Date.parse(a.departure_at) ? b : a));
}

/**
 * Ce face botul cu pinul contului: nimic dacă e deja pe mesajul potrivit (și doar pe el), altfel fixează ținta
 * sau desfixează tot. Pur, testat.
 */
export function decizieFixare(comenzi: readonly ComandaFixare[], nowMs: number): DecizieFixare {
  const tinta = comandaDeFixat(comenzi, nowMs);
  const fixate = comenzi.filter((c) => c.telegram_mesaj_fixat_id != null);
  if (!tinta) return fixate.length ? { tip: 'desfixeaza' } : { tip: 'nimic' };
  const mesajId = tinta.telegram_mesaj_id as number;
  const dejaFixata = fixate.length === 1 && fixate[0].cod === tinta.cod && fixate[0].telegram_mesaj_fixat_id === mesajId;
  return dejaFixata ? { tip: 'nimic' } : { tip: 'fixeaza', tinta: { cod: tinta.cod, mesajId } };
}

/** Partea din Bot API de care are nevoie pinul (grammY `Api` o satisface). */
export interface ApiFixare {
  unpinAllChatMessages(chatId: number): Promise<unknown>;
  pinChatMessage(chatId: number, messageId: number, other?: { disable_notification?: boolean }): Promise<unknown>;
}

export interface DepsFixare {
  repo: RepoMesajeBilet;
  api: ApiFixare;
  nowMs: number;
}

/** Telegram: mesajul de fixat a fost șters de client. */
function mesajDisparut(e: unknown): boolean {
  return /message to pin not found/i.test(e instanceof Error ? e.message : String(e));
}

async function fixeaza(telegramId: number, tinta: TintaFixare, deps: DepsFixare): Promise<void> {
  try {
    await deps.api.pinChatMessage(telegramId, tinta.mesajId, { disable_notification: true });
  } catch (e) {
    if (!mesajDisparut(e)) throw e;
    // Fără mesaj nu are ce fixa: comanda iese din regulă, tickul următor alege altă comandă (sau nimic).
    await deps.repo.uitaMesaj(tinta.cod, tinta.mesajId);
    await deps.repo.marcheazaFixarea(telegramId, null);
    return;
  }
  await deps.repo.marcheazaFixarea(telegramId, tinta);
}

/**
 * Aduce pinul din chatul contului (chatul privat are id-ul contului) la regula de mai sus. Repinează doar când ținta
 * se schimbă: evidența e în `telegram_mesaj_fixat_id`. Întoarce decizia aplicată.
 */
export async function sincronizeazaFixarea(telegramId: number, deps: DepsFixare): Promise<DecizieFixare> {
  const decizie = decizieFixare(await deps.repo.comenziPentruFixare(telegramId, deps.nowMs), deps.nowMs);
  if (decizie.tip === 'nimic') return decizie;
  await deps.api.unpinAllChatMessages(telegramId);
  if (decizie.tip === 'desfixeaza') await deps.repo.marcheazaFixarea(telegramId, null);
  else await fixeaza(telegramId, decizie.tinta, deps);
  return decizie;
}

export interface BilantFixare { verificate: number; schimbate: number; erori: number }

/**
 * Tickul pinului: fiecare cont cu bilet în ±2 zile sau cu o comandă fixată. Un cont căzut (botul blocat de client,
 * Telegram indisponibil) nu le oprește pe celelalte.
 */
export async function sincronizeazaToateConturile(
  deps: DepsFixare & { jurnal?: (mesaj: string) => void },
): Promise<BilantFixare> {
  const jurnal = deps.jurnal ?? ((m: string) => console.warn(m));
  const bilant: BilantFixare = { verificate: 0, schimbate: 0, erori: 0 };
  for (const telegramId of await deps.repo.conturiDeVerificat(deps.nowMs)) {
    bilant.verificate++;
    try {
      if ((await sincronizeazaFixarea(telegramId, deps)).tip !== 'nimic') bilant.schimbate++;
    } catch (e) {
      bilant.erori++;
      jurnal(`[bilete/pin] ${telegramId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return bilant;
}
