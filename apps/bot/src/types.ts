import { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';
import type { User } from '@translux/db';

export interface SessionData {
  // Conversation plugin handles state internally
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context> & {
    dbUser: User | null;
  };
