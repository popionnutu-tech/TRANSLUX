import { Api } from 'grammy';
import { getSupabase } from '../supabase.js';
import { config } from '../config.js';
import type { Platforma } from './uploadPost.js';

// Motorul clipurilor rulează în botul Translux (Railway) pentru AMBII boți (Ion, 10.10: «noi boți avem, putem folosi
// ce îl avem pentru translux și pentru tlx»). Supergrupul Translux îl ține botul Translux; supergrupul TLX, botul TLX
// (server separat, pe Render): acela doar trimite aici actualizările grupului (POST /social/v1/tlx), iar motorul
// răspunde în grup cu tokenul botului TLX. Trimiterea de mesaje nu se bate cu webhook-ul lui — doar primirea ar face-o.

export type BotSocial = 'translux' | 'tlx';

const apiuri = new Map<BotSocial, Api>();

export function initSocial(apiTranslux: Api): void {
  apiuri.set('translux', apiTranslux);
  const tlx = process.env.TLX_BOT_TOKEN;
  if (tlx) apiuri.set('tlx', new Api(tlx));
}

export function apiBot(bot: BotSocial): Api | null {
  return apiuri.get(bot) ?? null;
}

export function tokenBot(bot: BotSocial): string | null {
  return bot === 'translux' ? config.botToken : (process.env.TLX_BOT_TOKEN || null);
}

export interface Topic {
  id: string;
  bot: BotSocial;
  chat_id: number;
  thread_id: number;
  nume: string;
  upload_post_user: string;
  platforme: Platforma[];
  facebook_page_id: string | null;
  descriere: string | null;
  hashtags: string[];
  ore: string[];
  decalaj_min: number;
  max_pe_zi: number;
  primul_comentariu: string | null;
  activ: boolean;
}

export type StarePostare = 'planificat' | 'se_publica' | 'trimis' | 'publicat' | 'esuat' | 'anulat' | 'proba';

export interface Postare {
  id: string;
  topic_id: string;
  tip: 'video' | 'story';
  chat_id: number;
  thread_id: number;
  message_id: number;
  file_unique_id: string;
  file_size: number | null;
  durata_s: number | null;
  autor_telegram_id: number;
  autor_nume: string | null;
  text_final: string;
  text_ai: boolean;
  planificat_la: string;
  stare: StarePostare;
  incercari: number;
  luat_la: string | null;
  upload_request_id: string | null;
  mesaj_confirmare_id: number | null;
}

export const db = () => getSupabase();

export async function topicDupaLoc(chatId: number, threadId: number): Promise<Topic | null> {
  const { data, error } = await db().from('social_topics').select('*').eq('chat_id', chatId).eq('thread_id', threadId).maybeSingle();
  if (error) throw new Error(`social_topics: ${error.message}`);
  return (data as Topic | null) ?? null;
}

export async function topicDupaId(id: string): Promise<Topic | null> {
  const { data } = await db().from('social_topics').select('*').eq('id', id).maybeSingle();
  return (data as Topic | null) ?? null;
}

/** Adminii sunt cei din `users` cu rolul ADMIN (aceiași oameni în ambele grupuri). */
export async function esteAdmin(telegramId: number | undefined): Promise<boolean> {
  if (!telegramId) return false;
  const { data } = await db().from('users').select('id').eq('telegram_id', telegramId).eq('role', 'ADMIN').eq('active', true).limit(1);
  return Boolean(data?.length);
}

export async function esteBlogger(topicId: string, telegramId: number): Promise<boolean> {
  const { data } = await db().from('social_bloggers').select('telegram_id').eq('topic_id', topicId).eq('telegram_id', telegramId).limit(1);
  return Boolean(data?.length);
}

/** Publicarea reală e pornită doar cu ambele chei; altfel calendarul merge «în probă». */
export function publicareReala(): boolean {
  return Boolean(process.env.UPLOAD_POST_API_KEY && Number(process.env.TELEGRAM_API_ID) && process.env.TELEGRAM_API_HASH);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const NUME_PLATFORMA: Record<string, string> = { tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram' };
