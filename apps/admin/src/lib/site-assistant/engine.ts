// Tura asistentului de pe site: modelul + bucla de tool-uri.
// Același model ca linia vocală (voice-llm): Haiku 4.5 — rapid și ieftin, iar
// cunoașterea vine toată din tool-uri, nu din model.

import Anthropic from '@anthropic-ai/sdk';
import { activeComplaintTypes } from '@/lib/voice/complaint-types';
import { buildSystemPrompt } from './prompt';
import { SITE_TOOLS, executeSiteTool, type ToolContext } from './tools';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 700;
// O întrebare obișnuită: 1-2 tool-uri. Reclamația cu repetări: 3-4. Peste 6 e o buclă.
const MAX_ITERATIONS = 6;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Ziua și ora de acum la Chișinău — modelul n-are ceas. */
function nowLine(): string {
  const parts = new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Chisinau', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return `Acum la Chișinău: ${parts}. Zilele («azi», «mâine», «sâmbătă») le trimiți tool-urilor exact cum le-a spus clientul — serverul le rezolvă.`;
}

export interface TurnResult {
  reply: string;
  messages: Anthropic.MessageParam[];
  toolsUsed: string[];
}

const FALLBACK = {
  ro: 'Momentan nu pot răspunde. Încercați peste un minut sau sunați la 060 401 010.',
  ru: 'Сейчас не могу ответить. Попробуйте через минуту или позвоните на 060 401 010.',
};

export async function runTurn(
  history: Anthropic.MessageParam[], userText: string, locale: 'ro' | 'ru', ctx: ToolContext,
): Promise<TurnResult> {
  const types = await activeComplaintTypes().catch(() => []);
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: buildSystemPrompt(types), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `${nowLine()}\nClientul a deschis site-ul în limba: ${locale === 'ru' ? 'rusă' : 'română'}.` },
  ];
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userText }];
  const toolsUsed: string[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await getClient().messages.create({
      model: MODEL, max_tokens: MAX_TOKENS, temperature: 0.3,
      system, tools: SITE_TOOLS, messages,
    });
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('\n').trim();
      return { reply: reply || FALLBACK[locale], messages, toolsUsed };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name);
      const out = await executeSiteTool(ctx, block.name, (block.input ?? {}) as Record<string, unknown>);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }

  // Bucla n-a ajuns la un text: istoria se închide cu un răspuns, ca tura
  // următoare să nu înceapă după un tool_result fără replică.
  messages.push({ role: 'assistant', content: FALLBACK[locale] });
  return { reply: FALLBACK[locale], messages, toolsUsed };
}
