import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types.js';
import { validateInviteToken, markInviteUsed, createOrUpdateUser } from '../services/db.js';
import { POINT_LABELS } from '@translux/db';

export async function handleStart(ctx: BotContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Check for invite token in /start payload
  const payload = ctx.match as string | undefined;

  if (payload) {
    // Attempt to activate invite
    const invite = await validateInviteToken(payload);
    if (!invite) {
      await ctx.reply('Link de invitație invalid sau expirat.');
      return;
    }

    const user = await createOrUpdateUser(
      telegramId,
      ctx.from?.username,
      invite.point
    );
    await markInviteUsed(invite.token, user.id);

    // Update ctx.dbUser for subsequent middleware
    ctx.dbUser = user;

    await ctx.reply(
      `✓ Acces activat.\nPunctul tău: ${POINT_LABELS[invite.point]}.`
    );
    await showMainMenu(ctx);
    return;
  }

  // No payload — check if already authorized
  if (ctx.dbUser) {
    await showMainMenu(ctx);
    return;
  }

  await ctx.reply('Acces restricționat. Solicită un link de invitație de la Administrator.');
}

export async function showMainMenu(ctx: BotContext) {
  // Meniul e doar pentru chat privat. În grupuri (botul poate fi admin pe „tabla de sarcini")
  // nu afișăm meniul — altfel spam la fiecare mesaj din grup. Comenzile de grup au handlere separate.
  if (ctx.chat?.type !== 'private') return;
  // DIGITAL = doar sarcini (Mini App prin butonul de meniu), fără raportare curse.
  if (ctx.dbUser?.role === 'DIGITAL') {
    await ctx.reply('Sarcinile tale sunt în aplicația „Mostic" — apasă butonul de meniu (≡) din stânga câmpului de mesaj.');
    return;
  }
  // MANAGER_LDE = doar atribuiri zilnice (Mini App), fără raportare curse.
  if (ctx.dbUser?.role === 'MANAGER_LDE') {
    await ctx.reply('Atribuirile tale sunt în aplicația „Atribuiri" — apasă butonul de meniu (≡) din stânga câmpului de mesaj.');
    return;
  }
  if (!ctx.dbUser) {
    await ctx.reply('Acces restricționat. Solicită un link de invitație de la Administrator.');
    return;
  }

  const kb = new InlineKeyboard()
    .text('📋 Raportează cursă', 'menu:report')
    .row();

  if (ctx.dbUser.point === 'CHISINAU') {
    kb.text('📷 Poze curățenie', 'menu:cleaning').text('➕ Adaugă șofer', 'menu:add_driver').row();
  }

  kb.text('🔙 Anulează ultimul', 'menu:cancel_last')
    .text('❓ Ajutor', 'menu:help');

  await ctx.reply('Meniu principal:', { reply_markup: kb });
}
