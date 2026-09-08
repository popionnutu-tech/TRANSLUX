// Pozele de curățenie la peronul Chișinău: 3 zone (peron, pietoni, veceu),
// de două ori pe zi (înainte de prima cursă și la 15:00, înaintea cursei 16:25).
// Se apelează din raportarea curselor (poartă obligatorie) sau din meniu.
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../types.js';
import { getCleaningZonesDone, type CleaningSlot, type CleaningZone } from '../services/db.js';
import {
  CLEANING_ZONES,
  ZONE_LABEL,
  ZONE_HINT,
  SLOT_LABEL,
  processCleaningPhoto,
} from '../services/cleaningCheck.js';
import { showMainMenu } from '../handlers/start.js';
import { getTodayDate, getNowTimeHHMM } from '../utils.js';

type Conv = Conversation<BotContext, BotContext>;

/** Tura după ora curentă: până la 12:00 e setul de dimineață, după — cel de zi. */
export function currentCleaningSlot(): CleaningSlot {
  return getNowTimeHHMM() < '12:00' ? 'DIMINEATA' : 'ZIUA';
}

/**
 * Cere pe rând pozele lipsă ale turei. Întoarce true când toate cele 3 zone
 * sunt închise, false dacă operatorul a ieșit cu /start.
 */
export async function collectCleaningPhotos(
  conversation: Conv,
  ctx: BotContext,
  slot: CleaningSlot,
  intro?: string
): Promise<boolean> {
  const user = ctx.dbUser;
  if (!user) return false;
  const checkDate = getTodayDate();

  const done = new Set(
    await conversation.external(() => getCleaningZonesDone(checkDate, slot).then((s) => Array.from(s)))
  );
  const missing = CLEANING_ZONES.filter((z) => !done.has(z));
  if (missing.length === 0) return true;

  if (intro) await ctx.reply(intro);

  for (const zone of missing) {
    const idx = CLEANING_ZONES.indexOf(zone) + 1;
    await ctx.reply(
      `📷 Curățenie — ${SLOT_LABEL[slot]}\n` +
        `Poza ${idx}/3: <b>${ZONE_LABEL[zone]}</b>\n` +
        `${ZONE_HINT[zone]}\n\n` +
        `Trimite poza (sau /start pentru a ieși).`,
      { parse_mode: 'HTML' }
    );

    while (true) {
      const pCtx = await conversation.wait();
      if (pCtx.message?.text === '/start') {
        await showMainMenu(pCtx as BotContext);
        return false;
      }
      const photos = pCtx.message?.photo;
      if (!photos || photos.length === 0) {
        if (pCtx.message?.document) {
          await pCtx.reply('Trimite ca poză (nu ca fișier), din aparatul foto al Telegram-ului.');
        } else if (pCtx.message) {
          await pCtx.reply(`Aștept poza pentru: ${ZONE_LABEL[zone]}.`);
        }
        continue;
      }
      const best = photos[photos.length - 1]; // cea mai mare rezoluție
      const file = await pCtx.getFile();
      if (!file.file_path) {
        await pCtx.reply('Nu am putut prelua poza. Trimite-o din nou.');
        continue;
      }

      await pCtx.reply('⏳ Verific poza…');
      const result = await conversation.external(() =>
        processCleaningPhoto({
          checkDate,
          slot,
          zone,
          telegramFileId: best.file_id,
          telegramFilePath: file.file_path!,
          userId: user.id,
        })
      );

      if (result.verdict === 'ALT_LOC') {
        await pCtx.reply(
          `❌ Poza nu pare să fie din zona <b>${ZONE_LABEL[zone]}</b>.\n` +
            (result.description ? `${result.description}\n` : '') +
            `Refă poza din locul corect: ${ZONE_HINT[zone]}`,
          { parse_mode: 'HTML' }
        );
        continue;
      }
      if (result.verdict === 'EROARE') {
        await pCtx.reply(
          `⚠️ Verificarea automată nu a mers acum. Poza e salvată și va fi verificată de administrator.`
        );
        break;
      }
      if (result.verdict === 'CURAT') {
        await pCtx.reply(`✅ <b>${ZONE_LABEL[zone]}: curat.</b>\n${result.description}`, { parse_mode: 'HTML' });
        break;
      }
      // MURDAR
      const probs = result.problems.length ? result.problems.map((p) => `• ${p}`).join('\n') : result.description;
      await pCtx.reply(
        `🔴 <b>${ZONE_LABEL[zone]}: MURDAR.</b>\n${probs}\n\n` +
          `⚠️ Informația se stochează și va fi penalizată.`,
        { parse_mode: 'HTML' }
      );
      break;
    }
  }

  await ctx.reply(`✔ Pozele de curățenie (${SLOT_LABEL[slot]}) sunt complete.`);
  return true;
}

/** Din meniu: «📷 Poze curățenie» — tura după oră. */
export async function cleaningPhotosConversation(conversation: Conv, ctx: BotContext) {
  const slot = currentCleaningSlot();
  const done = new Set(
    await conversation.external(() => getCleaningZonesDone(getTodayDate(), slot).then((s) => Array.from(s)))
  );
  if (done.size === CLEANING_ZONES.length) {
    await ctx.reply(`Setul de curățenie (${SLOT_LABEL[slot]}) e deja complet pentru azi.`);
    await showMainMenu(ctx);
    return;
  }
  const complete = await collectCleaningPhotos(conversation, ctx, slot);
  if (complete) await showMainMenu(ctx);
}

export type { CleaningZone };
