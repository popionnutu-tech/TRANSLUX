import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../types.js';
import { createDriver } from '../services/db.js';

type AddDriverConversation = Conversation<BotContext, BotContext>;

export async function addDriverConversation(conversation: AddDriverConversation, ctx: BotContext) {
  await ctx.reply(
    'Introdu numele și familia șoferului nou:\n' +
    '(ex: <b>Moldovan Ion</b>)',
    { parse_mode: 'HTML' }
  );

  const nameCtx = await conversation.waitFor('message:text');
  const fullName = nameCtx.message.text.trim();

  if (!fullName || fullName.length < 3) {
    await nameCtx.reply('Numele este prea scurt. Operațiunea anulată.');
    return;
  }

  try {
    await createDriver(fullName);
    const parts = fullName.split(' ');
    const shortName = parts.length > 1
      ? `${parts[0]} ${parts.slice(1).map(p => p[0] + '.').join('')}`
      : fullName;
    await nameCtx.reply(`✅ Șoferul <b>${shortName}</b> a fost adăugat.`, { parse_mode: 'HTML' });
  } catch (err: any) {
    console.error('Add driver error:', err);
    await nameCtx.reply('❌ Eroare la salvare. Încearcă din nou.');
  }
}
