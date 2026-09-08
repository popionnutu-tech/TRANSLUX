/**
 * Mock-urile testelor cap-coadă: Supabase fals, model fals, Telegram capturat.
 *
 * `vi.mock` se hoistează DOAR în fișierul de test și rezolvă calea relativ la acel
 * fișier — de aceea acest modul exportă fabricile, iar fiecare test le montează.
 * Șablonul, pentru un test din `src/api/`:
 *
 *   import { installMocks, alerts, telegram, nextModelAnswer } from '../test/mocks.js'; // PRIMUL import
 *   vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
 *   vi.mock('@anthropic-ai/sdk', () => import('../test/mocks.js').then((m) => m.anthropicModuleFactory()));
 *   vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));
 *
 *   beforeEach(() => { fake = installMocks(seedDay('2026-06-10')); });
 *
 * `mocks.ts` trebuie să fie PRIMUL import: setează variabilele de mediu de care
 * `config.ts` are nevoie (cheia Anthropic — altfel serviciile dau EROARE fără să
 * cheme modelul; token Telegram gol — `notifyTelegram` din db.ts nu face fetch).
 * `dotenv` nu suprascrie variabilele deja setate.
 */
import { createFakeSupabase, FakeSupabaseError, type FakeSupabase, type Seed } from './fakeSupabase.js';
import { TELEGRAM } from './fixtures.js';

process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';

// ── Starea curentă ───────────────────────────────────────────────────────────

let current: FakeSupabase | null = null;

/** Mesajele trimise adminilor prin sendAdminAlert (HTML, în ordine). */
export const alerts: string[] = [];

export interface TelegramCall {
  method: 'sendMessage' | 'editMessageText' | 'pinChatMessage';
  chatId: number;
  text: string | null;
  messageId: number | null;
}
/** Apelurile pe API-ul Telegram al botului (loading board etc.), în ordine. */
export const telegram: TelegramCall[] = [];

export interface ModelAnswer {
  /** răspuns JSON (cel mai des) — devine textul blocului */
  json?: unknown;
  /** text brut, dacă testul vrea un JSON stricat */
  text?: string;
  /** stop_reason 'refusal' */
  refusal?: boolean;
  /** messages.create aruncă */
  throws?: Error;
}
export interface ModelCall {
  model: string;
  hasImage: boolean;
  userText: string;
}
const modelQueue: ModelAnswer[] = [];
/** Apelurile către model, în ordine (pentru a verifica că poza a ajuns la el). */
export const modelCalls: ModelCall[] = [];

/** Răspunsul pe care îl va da modelul la URMĂTORUL apel (coadă; se poate chema de mai multe ori). */
export function nextModelAnswer(answer: ModelAnswer): void {
  modelQueue.push(answer);
}

export function getFake(): FakeSupabase {
  if (!current) throw new FakeSupabaseError('installMocks(seed) nu a fost apelat în acest test');
  return current;
}

/** Golește capturile și coada modelului; fake-ul curent se scoate. */
export function reset(): void {
  current = null;
  alerts.length = 0;
  telegram.length = 0;
  modelQueue.length = 0;
  modelCalls.length = 0;
  messageSeq = 0;
}

/**
 * Montează fake-ul pentru testul curent: client nou din seed, capturi goale.
 * Întoarce clientul, pentru asserții pe `_tables` / `_storage`.
 */
export function installMocks(seed: Seed): FakeSupabase {
  reset();
  current = createFakeSupabase(seed);
  return current;
}

// ── Fabrici de module (pentru vi.mock) ───────────────────────────────────────

/** `../supabase.js` → getSupabase() dă fake-ul curent. */
export function supabaseModuleFactory() {
  return { getSupabase: () => getFake() };
}

/**
 * `@anthropic-ai/sdk` → clasă cu `messages.create` care întoarce ce a pus testul
 * prin nextModelAnswer(). Coadă goală → aruncă FakeSupabaseError (test incomplet,
 * nu «EROARE» tăcută — serviciile ar înghiți-o și testul ar trece degeaba).
 */
export function anthropicModuleFactory() {
  class FakeAnthropic {
    messages = {
      create: async (req: { model: string; messages: Array<{ content: unknown }> }) => {
        const content = Array.isArray(req.messages?.[0]?.content) ? (req.messages[0].content as Array<{ type: string; text?: string }>) : [];
        modelCalls.push({
          model: req.model,
          hasImage: content.some((b) => b.type === 'image'),
          userText: content.find((b) => b.type === 'text')?.text ?? '',
        });
        const a = modelQueue.shift();
        if (!a) throw new FakeSupabaseError('modelul fals: nextModelAnswer() nu a fost setat pentru acest apel');
        if (a.throws) throw a.throws;
        if (a.refusal) return { stop_reason: 'refusal', content: [] };
        const text = a.text ?? JSON.stringify(a.json ?? null);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      },
    };
  }
  return { default: FakeAnthropic };
}

let messageSeq = 0;

/** API-ul Telegram fals: capturează în `telegram[]`, întoarce message_id crescător. */
export function fakeBotApi() {
  return {
    sendMessage: async (chatId: number, text: string) => {
      const messageId = ++messageSeq;
      telegram.push({ method: 'sendMessage', chatId, text, messageId });
      return { message_id: messageId, chat: { id: chatId }, text };
    },
    editMessageText: async (chatId: number, messageId: number, text: string) => {
      telegram.push({ method: 'editMessageText', chatId, text, messageId });
      return { message_id: messageId, chat: { id: chatId }, text };
    },
    pinChatMessage: async (chatId: number, messageId: number) => {
      telegram.push({ method: 'pinChatMessage', chatId, text: null, messageId });
      return true;
    },
  };
}

/** Adminii care primesc alertele și loading board-ul: doar ADMIN-ul din seed. */
export const ADMIN_CHAT_IDS: ReadonlySet<number> = new Set([TELEGRAM.admin]);

/**
 * `./adminAlert.js` (din services) — sendAdminAlert → alerts[], getBotApi() → API fals,
 * getAdminChatIds() → set fix. escapeHtml e cel real (db.ts îl importă de aici).
 */
export function adminAlertModuleFactory() {
  const api = fakeBotApi();
  return {
    initAdminAlert: () => {},
    getBotApi: () => api,
    getAdminChatIds: async () => new Set(ADMIN_CHAT_IDS),
    escapeHtml: (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    sendAdminAlert: async (message: string) => {
      alerts.push(message);
    },
  };
}
