import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TelegramClient, Api, helpers } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

// Descărcarea originalului (plan 09.10, «Publicarea video» p. 3). Bot API dă fișiere doar până la 20 MB, clipurile au
// 300–800 MB. Serverul propriu Bot API ar cere `logOut` — botul Translux (operatorii, biletele) și botul TLX ar trece
// cu totul pe el. În loc de asta botul intră prin MTProto, cu ACELAȘI token (până la 2 GB), doar ca să citească
// mesajul cu clipul din supergrup și să-l descarce; Bot API-ul rămâne neatins. Telegram dă botului voie să ceară un
// supergrup fără access_hash (core.telegram.org/api/peers, «Zero access hash … must be used by bots»).
// Legătura MTProto stă deschisă doar cât descărcarea (o sesiune în plus, câteva minute) și se închide imediat; sesiunea
// se păstrează în memorie, ca botul să nu se logheze din nou la fiecare clip. Clipul se descarcă abia la ora
// publicării și se șterge imediat după trimitere: nu se ține nicăieri.

const sesiuni = new Map<string, string>();
/** Descărcarea întreagă (logare + mesaj + fișier) are o limită: o legătură înțepenită nu blochează publicatorul. */
export const DESCARCARE_MAX_MS = 30 * 60_000;

/** Clipul nu mai e cel planificat (mesaj șters sau fișier schimbat): retrimiterea n-ajută, adminul hotărăște. */
export class ClipSchimbat extends Error {}

export function mtprotoConfigurat(): boolean {
  return Boolean(Number(process.env.TELEGRAM_API_ID) && process.env.TELEGRAM_API_HASH);
}

/** Id-ul Bot API al supergrupului (-100…) → id-ul canalului în MTProto. Pur, testat. */
export function idCanal(chatId: number): string {
  const s = String(chatId);
  if (!s.startsWith('-100')) throw new Error(`chat ${chatId} nu e supergrup`);
  return s.slice(4);
}

/**
 * Descarcă clipul mesajului într-un fișier temporar; întoarce calea. Apelantul îl șterge cu `stergeTemporar`.
 * `marimeAsteptata` = mărimea văzută la primire: dacă autorul a înlocuit clipul între timp (editând mesajul), nu
 * pleacă alt clip sub textul scris pentru primul.
 */
export async function descarcaClip(token: string, chatId: number, messageId: number, idPostare: string, marimeAsteptata: number | null): Promise<string> {
  const sesiune = new StringSession(sesiuni.get(token) ?? '');
  const c = new TelegramClient(sesiune, Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH ?? '', {
    connectionRetries: 5,
    downloadRetries: 5,
  });
  c.setLogLevel('error' as never);
  const cale = join(tmpdir(), 'social', `${idPostare}.mp4`);
  let ceas: NodeJS.Timeout | undefined;
  const limita = new Promise<never>((_, nu) => {
    ceas = setTimeout(() => nu(new Error(`descărcarea a depășit ${DESCARCARE_MAX_MS / 60_000} minute`)), DESCARCARE_MAX_MS);
  });
  try {
    await Promise.race([lucru(), limita]);
    return cale;
  } catch (err) {
    await stergeTemporar(cale);
    throw err;
  } finally {
    clearTimeout(ceas);
    await c.destroy().catch(() => {});
  }

  async function lucru(): Promise<void> {
    await c.start({ botAuthToken: token });
    sesiuni.set(token, sesiune.save());
    const r = await c.invoke(new Api.channels.GetMessages({
      channel: new Api.InputChannel({ channelId: helpers.returnBigInt(idCanal(chatId)), accessHash: helpers.returnBigInt(0) }),
      id: [new Api.InputMessageID({ id: messageId })],
    }));
    const msg = 'messages' in r ? r.messages.find((m): m is Api.Message => m instanceof Api.Message && m.id === messageId) : undefined;
    if (!msg?.media) throw new ClipSchimbat('mesajul cu clipul nu mai există în topic (a fost șters)');
    const doc = msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document ? msg.media.document : null;
    if (!doc) throw new ClipSchimbat('mesajul nu mai conține un clip (a fost editat)');
    if (marimeAsteptata && Number(doc.size) !== marimeAsteptata) throw new ClipSchimbat('clipul din mesaj a fost înlocuit după planificare');
    await mkdir(join(tmpdir(), 'social'), { recursive: true });
    await c.downloadMedia(msg, { outputFile: cale });
    const s = await stat(cale).catch(() => null);
    if (!s || s.size === 0) throw new Error('descărcarea a dat un fișier gol');
  }
}

export async function stergeTemporar(cale: string | null): Promise<void> {
  if (cale) await rm(cale, { force: true }).catch(() => {});
}
