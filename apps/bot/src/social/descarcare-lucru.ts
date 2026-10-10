import { mkdir, open, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { TelegramClient, Api, helpers } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { idCanal, motivSchimbat, type CerereDescarcare, type RaspunsDescarcare } from './descarcare.js';

// Procesul copil al descărcării (dezbaterea 10.10, runda 2, SBE2-2): MTProto (GramJS) rulează DOAR aici, niciodată în
// procesul botului. La limită părintele îl oprește cu SIGKILL — o descărcare orfană, un sender exportat rămas deschis
// sau o buclă de reconectare pe alt DC (telegramBaseClient.js:56, :158-178 — `destroy()` nu le închide) mor odată cu
// procesul, fără să atingă botul operatorilor.
//
// Cererile proprii merg în `InvokeWithoutUpdates`; GramJS mai trimite singur câteva neîmpachetate (InitConnection/
// GetConfig la conectare, Export/ImportAuthorization pentru alt DC, GetState la NETWORK_MIGRATE — SBE2-1). Dacă asta
// abonează sesiunea la actualizările botului o spune doar proba (scripts/social-proba-mtproto.mts), pe același DC și
// pe alt DC, cu reconectare — nu comentariul de aici.

const BUCATA = 512 * 1024;
const ASTEAPTA_HASH_MS = 30_000;
const RELUARI_MAX = 20;

/**
 * access_hash-ul supergrupului pentru acest bot. Cu 0, `channels.GetMessages` dă CHANNEL_INVALID (10.10.2026), iar un
 * bot nu poate cere lista chaturilor. Îl află din prima actualizare a grupului care ajunge la această sesiune:
 * sesiunea se abonează (`updates.GetState`), botul scrie prin Bot API un mesaj scurt sub clip, actualizarea lui aduce
 * supergrupul cu access_hash, iar mesajul se șterge. Se face o dată per bot și grup; părintele ține rezultatul în
 * memorie. Actualizările Bot API nu se pierd: fiecare sesiune a botului primește copia ei.
 */
async function hashCanal(tg: TelegramClient, c: CerereDescarcare): Promise<bigint> {
  if (c.accessHash) return BigInt(c.accessHash);
  const id = BigInt(idCanal(c.chatId));
  const gaseste = async (): Promise<bigint | null> => {
    try {
      const p = await tg.getInputEntity(new Api.PeerChannel({ channelId: helpers.returnBigInt(id) }));
      return p instanceof Api.InputPeerChannel ? BigInt(p.accessHash.toString()) : null;
    } catch { return null; }
  };
  await tg.invoke(new Api.updates.GetState());
  const bot = `https://api.telegram.org/bot${c.token}`;
  const trimis = await fetch(`${bot}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: c.chatId, text: '⏳ Pregătesc clipul pentru publicare…', disable_notification: true,
      reply_parameters: { message_id: c.messageId, allow_sending_without_reply: true },
    }),
  }).then((r) => r.json() as Promise<{ ok: boolean; result?: { message_id: number } }>).catch(() => null);
  try {
    const pana = Date.now() + ASTEAPTA_HASH_MS;
    while (Date.now() < pana) {
      const h = await gaseste();
      if (h !== null) return h;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    throw new Error('nu am aflat access_hash-ul grupului (actualizarea n-a ajuns la sesiunea MTProto)');
  } finally {
    if (trimis?.result) {
      await fetch(`${bot}/deleteMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: c.chatId, message_id: trimis.result.message_id }),
      }).catch(() => {});
    }
  }
}

async function descarca(c: CerereDescarcare): Promise<RaspunsDescarcare> {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? '';
  const sesiune = new StringSession(c.sesiune ?? '');
  const tg = new TelegramClient(sesiune, apiId, apiHash, { connectionRetries: 3, downloadRetries: 5 });
  tg.setLogLevel('error' as never);
  await tg.connect();
  if (!c.sesiune) {
    await tg.invoke(new Api.InvokeWithoutUpdates({
      query: new Api.auth.ImportBotAuthorization({ flags: 0, apiId, apiHash, botAuthToken: c.token }),
    }) as never);
  }
  const accessHash = await hashCanal(tg, c);
  const r = await tg.invoke(new Api.InvokeWithoutUpdates({
    query: new Api.channels.GetMessages({
      channel: new Api.InputChannel({ channelId: helpers.returnBigInt(idCanal(c.chatId)), accessHash: helpers.returnBigInt(accessHash) }),
      id: [new Api.InputMessageID({ id: c.messageId })],
    }),
  }) as never) as unknown as Api.messages.TypeMessages;
  const msg = 'messages' in r ? r.messages.find((m): m is Api.Message => m instanceof Api.Message && m.id === c.messageId) : undefined;
  if (!msg) return { ok: false, schimbat: true, mesaj: 'mesajul cu clipul nu mai există în topic (a fost șters)', sesiune: sesiune.save(), accessHash: accessHash.toString() };
  const doc = msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document ? msg.media.document : null;
  const autor = msg.fromId instanceof Api.PeerUser ? Number(msg.fromId.userId) : null;
  const motiv = motivSchimbat({ autor, editat: Boolean(msg.editDate), marime: doc ? Number(doc.size) : null }, c.asteptat);
  if (motiv || !doc) return { ok: false, schimbat: true, mesaj: motiv ?? 'mesajul nu mai conține un clip', sesiune: sesiune.save(), accessHash: accessHash.toString() };

  await mkdir(dirname(c.cale), { recursive: true });
  const f = await open(c.cale, 'w');
  try {
    const loc = new Api.InputDocumentFileLocation({ id: doc.id, accessHash: doc.accessHash, fileReference: doc.fileReference, thumbSize: '' });
    // Runda 3, SBE3-1: GramJS deschide la FIECARE descărcare o conexiune exportată (downloads.js:84, :100 →
    // telegramBaseClient.js:328-332), cu `help.GetConfig` neîmpachetat; pe alt DC și Export/ImportAuthorization.
    // `dcId` se dă mereu, explicit — ce face asta cu actualizările botului o spune doar proba (pasul 10).
    // 10.10.2026, clipul de 562 MB: `upload.GetFile` a dat «-503: Timeout» după câteva secunde. Telegram dă asta pe
    // fișierele mari din alt DC; bucata se cere din nou de unde a rămas, nu de la început.
    let scris = 0;
    for (let reluari = 0; ; reluari++) {
      try {
        for await (const bucata of tg.iterDownload({
          file: loc, requestSize: BUCATA, fileSize: doc.size, dcId: doc.dcId, offset: helpers.returnBigInt(scris),
        })) {
          await f.write(bucata as Buffer);
          scris += (bucata as Buffer).length;
        }
        break;
      } catch (err) {
        const m = (err as Error)?.message ?? String(err);
        if (reluari >= RELUARI_MAX || !/Timeout|-503|FLOOD|ECONNRESET|Not connected|disconnect/i.test(m)) throw err;
        await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * (reluari + 1))));
      }
    }
  } finally {
    await f.close();
  }
  const s = await stat(c.cale);
  if (s.size !== Number(doc.size)) return { ok: false, schimbat: false, mesaj: `descărcare incompletă: ${s.size} din ${Number(doc.size)} octeți`, sesiune: sesiune.save(), accessHash: accessHash.toString() };
  return { ok: true, sesiune: sesiune.save(), dcSesiune: sesiune.dcId, dcClip: doc.dcId, accessHash: accessHash.toString() };
}

function raspunde(r: RaspunsDescarcare): void {
  // Copilul nu așteaptă închiderea frumoasă a GramJS (senderele exportate n-o au): iese imediat ce mesajul a plecat
  // (runda 3, SBE3-2 — nu după un timp fix).
  process.send!(r, (err: Error | null) => process.exit(err ? 1 : 0));
}

// Părintele a dispărut (botul repornit, proba oprită): copilul nu mai descarcă degeaba.
process.on('disconnect', () => process.exit(1));

process.once('message', (c: CerereDescarcare) => {
  descarca(c)
    .then(raspunde)
    .catch((err: unknown) => raspunde({ ok: false, schimbat: false, mesaj: (err as Error)?.message ?? String(err), sesiune: null }));
});
