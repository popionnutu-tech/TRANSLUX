import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { BotContext, SessionData } from './types.js';
import { config } from './config.js';
import { supabaseSessionStorage, supabaseConversationAdapter, CONVERSATION_STATE_VERSION } from './services/sessionStorage.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { handleStart, showMainMenu, showRolePicker } from './handlers/start.js';
import { handleCancelLastReport } from './handlers/cancel.js';
import { effectiveRoleToday, setOperatorDayRole, isSwitchableOperator } from './services/db.js';

import { handleWeeklyReport, handleDigest } from './handlers/admin.js';
import { reportConversation } from './conversations/report.js';
import { addDriverConversation } from './conversations/addDriver.js';
import { taxiZoneReportConversation } from './conversations/taxiZoneReport.js';
import { initAdminAlert } from './services/adminAlert.js';
import { handleDaily, handleSmmWeekly, handleSmmMonth } from './handlers/smm.js';
import { initTaskBoard, bindTaskBoard, getDigitalUser, sweepTaskBoards } from './services/taskBoard.js';

/** Operator comutabil (Aurel): setează rolul pe azi și revine la meniu. */
async function setRoleAndMenu(ctx: BotContext, role: 'TAXI_ZONE' | 'MAIN') {
  if (!ctx.dbUser || !isSwitchableOperator(ctx.dbUser)) {
    await ctx.reply('Această opțiune nu este disponibilă pentru tine.');
    return;
  }
  await setOperatorDayRole(ctx.dbUser.id, role);
  await ctx.reply(role === 'TAXI_ZONE' ? '✓ Azi: 🚕 zona taxi.' : '✓ Azi: 🚉 peron Chișinău.');
  await showMainMenu(ctx);
}

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  // Init admin alert system with bot API
  initAdminAlert(bot.api);
  // Init task-board (зеркалирование задач Vlad в группу) — нужен Api для постинга в группу
  initTaskBoard(bot.api);

  // Middleware stack
  bot.use(rateLimitMiddleware);
  bot.use(authMiddleware as any);
  bot.use(
    session({
      initial: (): SessionData => ({}),
      storage: supabaseSessionStorage,
    })
  );
  bot.use(
    conversations({
      storage: {
        type: 'key',
        prefix: 'conv:',
        version: CONVERSATION_STATE_VERSION,
        adapter: supabaseConversationAdapter,
      },
    })
  );

  // Global escape hatch: /start ALWAYS exits any active (possibly corrupted)
  // conversation BEFORE it gets replayed, so a user can never get stuck.
  // exitAll() purges conversation state without replaying it, so it cannot
  // throw "Bad replay". After exiting, the /start command handler runs fresh.
  bot.use(async (ctx, next) => {
    const cmd = ctx.message?.text?.split(/[\s@]/)[0];
    if (cmd === '/start') {
      try {
        await ctx.conversation.exitAll();
      } catch (err) {
        console.error('exitAll on /start failed:', err);
      }
    }
    await next();
  });

  bot.use(createConversation(reportConversation, 'report'));
  bot.use(createConversation(addDriverConversation, 'addDriver'));
  bot.use(createConversation(taxiZoneReportConversation, 'taxiZoneReport'));

  // /start command
  bot.command('start', handleStart);

  // Admin report commands (admin users managed via web interface)
  bot.command('weeklyreport', handleWeeklyReport as any);
  bot.command('digest', handleDigest as any);
  bot.command('daily', handleDaily as any);
  bot.command('smmweekly', handleSmmWeekly as any);
  bot.command('smmmonth', handleSmmMonth as any);

  // Привязать ЭТУ группу к задачам Vlad (DIGITAL) + сразу выложить активные.
  // Только ADMIN, только в группе. Дальше новые задачи доливает минутная сверка.
  bot.command('lega_vlad', async (ctx) => {
    if (!ctx.dbUser || ctx.dbUser.role !== 'ADMIN') {
      await ctx.reply('Doar administratorii pot lega o grupă.');
      return;
    }
    if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
      await ctx.reply('Comanda funcționează doar într-o grupă.');
      return;
    }
    const vlad = await getDigitalUser();
    if (!vlad) {
      await ctx.reply('Vlad (DIGITAL) nu există în sistem.');
      return;
    }
    await bindTaskBoard(ctx.chat.id, vlad.id);
    await ctx.reply(`✓ Grupa a fost legată la sarcinile lui ${vlad.name || 'Vlad'}. Le postez acum.`);
    const n = await sweepTaskBoards();
    if (n > 0) await ctx.reply(`Am postat ${n} sarcină(i) activă(e). Sarcinile noi vor apărea automat.`);
    else await ctx.reply('Nu sunt sarcini active acum. Cele noi vor apărea automat.');
  });

  // Menu callback handlers
  bot.callbackQuery('menu:report', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.dbUser) {
      await ctx.reply('Acces restricționat. Solicită un link de invitație de la Administrator.');
      return;
    }
    if (ctx.dbUser.role === 'DIGITAL') {
      await ctx.reply('Rolul tău este doar pentru sarcini — raportarea curselor nu este disponibilă.');
      return;
    }
    const role = await effectiveRoleToday(ctx.dbUser);
    if (role === 'TAXI_ZONE') {
      await ctx.conversation.enter('taxiZoneReport');
    } else {
      await ctx.conversation.enter('report');
    }
  });

  bot.callbackQuery('menu:add_driver', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.dbUser || ctx.dbUser.point !== 'CHISINAU' || (await effectiveRoleToday(ctx.dbUser)) === 'TAXI_ZONE') {
      await ctx.reply('Această funcție este disponibilă doar pentru operatorii din Chișinău.');
      return;
    }
    await ctx.conversation.enter('addDriver');
  });

  bot.callbackQuery('menu:cancel_last', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleCancelLastReport(ctx as BotContext);
  });

  // Operator comutabil (Aurel): alegerea / schimbarea rolului pe azi.
  bot.callbackQuery('rolepick:taxi', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setRoleAndMenu(ctx as BotContext, 'TAXI_ZONE');
  });
  bot.callbackQuery('rolepick:peron', async (ctx) => {
    await ctx.answerCallbackQuery();
    await setRoleAndMenu(ctx as BotContext, 'MAIN');
  });
  bot.callbackQuery('menu:switch_role', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.dbUser || !isSwitchableOperator(ctx.dbUser)) {
      await ctx.reply('Indisponibil.');
      return;
    }
    await showRolePicker(ctx as BotContext);
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
    // În grupuri botul tace (meniu/raportare = doar privat). Comenzile de grup (ex. /lega_vlad)
    // sunt tratate de handlerele de mai sus; aici evităm spam-ul cu „Meniu principal" la orice mesaj de grup.
    if (ctx.chat?.type !== 'private') return;
    if (!(ctx as BotContext).dbUser) {
      await ctx.reply('Acces restricționat. Solicită un link de invitație de la Administrator.');
      return;
    }
    await showMainMenu(ctx as BotContext);
  });

  // Error handler
  bot.catch((err) => {
    // Log ONLY the underlying error — never the raw BotError/ctx, which carries
    // ctx.api.token and would leak the bot token into logs in plaintext.
    const e: any = (err as any)?.error ?? err;
    console.error('Bot error:', e?.stack || e?.message || String(e));
  });

  return bot;
}
