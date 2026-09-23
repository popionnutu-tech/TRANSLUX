import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { runTurn } from '@/lib/site-assistant/engine';
import { CONV_ID_RE, loadConversation, saveConversation, usageLastHour, type SiteConversation } from '@/lib/site-assistant/store';

// Asistentul din colțul site-ului translux.md (ION-37). Public — pagina e publică —
// deci se apără singur: CORS doar spre site, text plafonat, ture plafonate pe
// conversație și pe sursă. Tool-urile le cheamă pe aceleași rute ca linia 060401010.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// O reclamație poate cere 3-4 tool-uri, fiecare cu identificarea cursei.
export const maxDuration = 60;

const ORIGINS = new Set([
  'https://translux.md',
  'https://www.translux.md',
  'https://translux-web.vercel.app',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
]);

const MAX_MESSAGE = 1000;
const MAX_TURNS_PER_CONVERSATION = 30;
const MAX_CONVERSATIONS_PER_HOUR = 10;
const MAX_TURNS_PER_HOUR = 60;

// Plafon pe instanță, înaintea oricărei citiri din bază: un val de cereri nu
// ajunge nici la Supabase, nici la model.
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 60;
let burstStart = Date.now();
let burstCount = 0;
function burst(): boolean {
  const now = Date.now();
  if (now - burstStart > BURST_WINDOW_MS) { burstStart = now; burstCount = 0; }
  burstCount += 1;
  return burstCount > BURST_MAX;
}

function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  if (!ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Aceeași formă ca ip_hash din search_log (apps/web, migr. 282).
function ipHash(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT || process.env.SUPABASE_ANON_KEY || '';
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 16);
}

const TEXT = {
  busy: {
    ro: 'Ați scris multe mesaje într-un timp scurt. Reveniți puțin mai târziu sau sunați la 060 401 010.',
    ru: 'Слишком много сообщений за короткое время. Вернитесь чуть позже или позвоните на 060 401 010.',
  },
  long: {
    ro: 'Conversația a devenit prea lungă. Începeți una nouă sau sunați la 060 401 010.',
    ru: 'Разговор стал слишком длинным. Начните новый или позвоните на 060 401 010.',
  },
  down: {
    ro: 'Momentan nu pot răspunde. Încercați peste un minut sau sunați la 060 401 010.',
    ru: 'Сейчас не могу ответить. Попробуйте через минуту или позвоните на 060 401 010.',
  },
};

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  // Fără origin-ul site-ului nu răspundem deloc: endpoint-ul costă bani la fiecare tură.
  if (!headers['Access-Control-Allow-Origin']) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* validat mai jos */ }
  const locale: 'ro' | 'ru' = body.locale === 'ru' ? 'ru' : 'ro';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE) return reply(400, { error: 'message' });
  if (burst()) return reply(429, { reply: TEXT.busy[locale] });

  const hash = ipHash(req);
  const convIdIn = typeof body.conversation_id === 'string' ? body.conversation_id : '';

  let conv: SiteConversation | null = null;
  try {
    conv = CONV_ID_RE.test(convIdIn) ? await loadConversation(convIdIn) : null;
  } catch (err) {
    console.error('asistent-site load:', err);
    return reply(503, { reply: TEXT.down[locale] });
  }
  const isNew = conv === null;

  if (hash) {
    const u = await usageLastHour(hash);
    if (u.turns >= MAX_TURNS_PER_HOUR || (isNew && u.conversations >= MAX_CONVERSATIONS_PER_HOUR)) {
      return reply(429, { reply: TEXT.busy[locale], conversation_id: conv?.id ?? null });
    }
  }
  if (conv && conv.turns >= MAX_TURNS_PER_CONVERSATION) {
    return reply(429, { reply: TEXT.long[locale], conversation_id: null });
  }

  const current: SiteConversation = conv ?? {
    id: `conv_site_${randomUUID()}`, locale, messages: [], turns: 0, tools_used: [],
  };

  try {
    const turn = await runTurn(current.messages, message, locale, {
      baseUrl: req.nextUrl.origin,
      conversationId: current.id,
    });
    const next: SiteConversation = {
      ...current,
      locale,
      messages: turn.messages,
      turns: current.turns + 1,
      tools_used: [...current.tools_used, ...turn.toolsUsed],
    };
    try {
      await saveConversation(next, hash, isNew);
    } catch (err) {
      // Răspunsul l-am avut; o istorie nescrisă înseamnă doar că tura următoare
      // începe fără ea — nu merită să-l lăsăm pe om fără răspuns.
      console.error('asistent-site save:', err);
      return reply(200, { reply: turn.reply, conversation_id: isNew ? null : current.id });
    }
    return reply(200, { reply: turn.reply, conversation_id: current.id });
  } catch (err) {
    console.error('asistent-site turn:', err);
    return reply(503, { reply: TEXT.down[locale], conversation_id: isNew ? null : current.id });
  }
}
