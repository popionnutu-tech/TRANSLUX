import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types.js';
import { validateInviteToken, markInviteUsed, createOrUpdateUser, getOperatorDayRole, isSwitchableOperator } from '../services/db.js';
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

  // Operator comutabil (ex. Aurel): o dată pe zi alege rolul (zona taxi / peron) înainte de meniu.
  let isTaxi: boolean;
  if (isSwitchableOperator(ctx.dbUser)) {
    const picked = await getOperatorDayRole(ctx.dbUser.id);
    if (!picked) { await showRolePicker(ctx); return; }
    isTaxi = picked === 'TAXI_ZONE';
  } else {
    isTaxi = ctx.dbUser.operator_kind === 'TAXI_ZONE';
  }

  const kb = new InlineKeyboard()
    .text(isTaxi ? '🚕 Raportează zona taxi' : '📋 Raportează cursă', 'menu:report')
    .row();

  if (ctx.dbUser.point === 'CHISINAU' && !isTaxi) {
    kb.text('➕ Adaugă șofer', 'menu:add_driver').row();
  }

  // Operator comutabil: poate schimba rolul pe azi.
  if (isSwitchableOperator(ctx.dbUser)) {
    kb.text(`🔁 Schimbă rolul (azi: ${isTaxi ? 'zona taxi' : 'peron'})`, 'menu:switch_role').row();
  }

  kb.text('🔙 Anulează ultimul', 'menu:cancel_last')
    .text('❓ Ajutor', 'menu:help');

  await ctx.reply('Meniu principal:', { reply_markup: kb });
}

/** Prompt de alegere a rolului pe azi (operator comutabil — ex. Aurel). */
export async function showRolePicker(ctx: BotContext) {
  const kb = new InlineKeyboard()
    .text('🚕 Zona taxi', 'rolepick:taxi')
    .text('🚉 Peron Chișinău', 'rolepick:peron');
  await ctx.reply('Azi ce faci? Alege rolul pentru ziua de azi:', { reply_markup: kb });
}
