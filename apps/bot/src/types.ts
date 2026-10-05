import { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';
import type { User } from '@translux/db';

/** Limba clientului de bilete online (ca `bilete_comenzi.lang`). */
export type Limba = 'ro' | 'ru';

/** Starea returnării biletului (ION-244), ținută în sesiune: supraviețuiește repornirii botului. */
export interface ReturSesiune {
  /** Botul așteaptă ultimele 4 cifre ale telefonului pentru această comandă, până la `expiraLa` (ms). */
  cifre?: { cod: string; lang: Limba; expiraLa: number };
  /** Ofertele recente: oferta_id → codul comenzii și limba (callback_data nu are loc și pentru cod). */
  oferte?: Record<string, { cod: string; lang: Limba; la: number }>;
}

/** ION-252: botul așteaptă plângerea clientului (după 👎 sau după textul pe care AI-ul l-a înțeles ca plângere). */
export interface PlangereSesiune {
  /** Comanda din care vine plângerea; null = clientul nu are o comandă anume. */
  cod: string | null;
  lang: Limba;
  /** Până când (ms) următorul mesaj e plângerea. */
  expiraLa: number;
  /** Poza trimisă fără text: se păstrează până vine textul. */
  fotoFileId?: string;
}

export interface SessionData {
  // Conversation plugin handles state internally
  retur?: ReturSesiune;
  plangere?: PlangereSesiune;
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context> & {
    dbUser: User | null;
  };
