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
  const r = await tg.invoke(new Api.InvokeWithoutUpdates({
    query: new Api.channels.GetMessages({
      channel: new Api.InputChannel({ channelId: helpers.returnBigInt(idCanal(c.chatId)), accessHash: helpers.returnBigInt(0) }),
      id: [new Api.InputMessageID({ id: c.messageId })],
    }),
  }) as never) as unknown as Api.messages.TypeMessages;
  const msg = 'messages' in r ? r.messages.find((m): m is Api.Message => m instanceof Api.Message && m.id === c.messageId) : undefined;
  if (!msg) return { ok: false, schimbat: true, mesaj: 'mesajul cu clipul nu mai există în topic (a fost șters)', sesiune: sesiune.save() };
  const doc = msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document ? msg.media.document : null;
  const autor = msg.fromId instanceof Api.PeerUser ? Number(msg.fromId.userId) : null;
  const motiv = motivSchimbat({ autor, editat: Boolean(msg.editDate), marime: doc ? Number(doc.size) : null }, c.asteptat);
  if (motiv || !doc) return { ok: false, schimbat: true, mesaj: motiv ?? 'mesajul nu mai conține un clip', sesiune: sesiune.save() };

  await mkdir(dirname(c.cale), { recursive: true });
  const f = await open(c.cale, 'w');
  try {
    const loc = new Api.InputDocumentFileLocation({ id: doc.id, accessHash: doc.accessHash, fileReference: doc.fileReference, thumbSize: '' });
    // Runda 3, SBE3-1: GramJS deschide la FIECARE descărcare o conexiune exportată (downloads.js:84, :100 →
    // telegramBaseClient.js:328-332), cu `help.GetConfig` neîmpachetat; pe alt DC și Export/ImportAuthorization.
    // `dcId` se dă mereu, explicit — ce face asta cu actualizările botului o spune doar proba (pasul 10).
    for await (const bucata of tg.iterDownload({ file: loc, requestSize: BUCATA, fileSize: doc.size, dcId: doc.dcId })) {
      await f.write(bucata as Buffer);
    }
  } finally {
    await f.close();
  }
  const s = await stat(c.cale);
  if (s.size !== Number(doc.size)) return { ok: false, schimbat: false, mesaj: `descărcare incompletă: ${s.size} din ${Number(doc.size)} octeți`, sesiune: sesiune.save() };
  return { ok: true, sesiune: sesiune.save(), dcSesiune: sesiune.dcId, dcClip: doc.dcId };
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
