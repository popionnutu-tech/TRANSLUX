import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { BotContext, SessionData } from './types.js';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { handleStart, showMainMenu } from './handlers/start.js';
import { handleCancelLastReport } from './handlers/cancel.js';

import { handleWeeklyReport, handleDigest } from './handlers/admin.js';
import { reportConversation } from './conversations/report.js';
import { addDriverConversation } from './conversations/addDriver.js';
import { initAdminAlert } from './services/adminAlert.js';
import { handleDaily, handleSmmWeekly, handleSmmMonth } from './handlers/smm.js';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  // Init admin alert system with bot API
  initAdminAlert(bot.api);

  // Middleware stack
  bot.use(rateLimitMiddleware);
  bot.use(authMiddleware as any);
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );
  bot.use(conversations());
  bot.use(createConversation(reportConversation, 'report'));
  bot.use(createConversation(addDriverConversation, 'addDriver'));

  // /start command
  bot.command('start', handleStart);

  // Admin report commands (admin users managed via web interface)
  bot.command('weeklyreport', handleWeeklyReport as any);
  bot.command('digest', handleDigest as any);
  bot.command('daily', handleDaily as any);
  bot.command('smmweekly', handleSmmWeekly as any);
  bot.command('smmmonth', handleSmmMonth as any);

  // Menu callback handlers
  bot.callbackQuery('menu:report', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.dbUser) {
      await ctx.reply('Acces restricționat. Solicită un link de invitație de la Administrator.');
      return;
    }
    await ctx.conversation.enter('report');
  });

  bot.callbackQuery('menu:add_driver', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.dbUser || ctx.dbUser.point !== 'CHISINAU') {
      await ctx.reply('Această funcție este disponibilă doar pentru operatorii din Chișinău.');
      return;
    }
    await ctx.conversation.enter('addDriver');
  });

  bot.callbackQuery('menu:cancel_last', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleCancelLastReport(ctx as BotContext);
  });

  bot.callbackQuery('menu:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '❓ Ajutor TRANSLUX\n\n' +
        '• Folosește „Raportează cursă" pentru a trimite un raport.\n' +
        '• Selectează ora, pasageri/absent, șoferul, conformitate.\n' +
        '• Raportul nu poate fi repetat pentru aceeași cursă/zi.\n' +
        '• Poți anula ultimul raport în primele 10 minute.\n\n' +
        'Probleme? Contactează administratorul.'
    );
  });

  // Fallback for unauthorized users
  bot.on('message', async (ctx) => {
    if (!(ctx as BotContext).dbUser) {
      await ctx.reply('Acces restricționat. Solicită un link de invitație de la Administrator.');
      return;
    }
    await showMainMenu(ctx as BotContext);
  });

  // Error handler
  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  return bot;
}
