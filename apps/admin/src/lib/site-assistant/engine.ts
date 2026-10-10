// Tura asistentului de pe site: modelul + bucla de tool-uri.
// Același model ca linia vocală (voice-llm): Haiku 4.5 — rapid și ieftin, iar
// cunoașterea vine toată din tool-uri, nu din model.

import Anthropic from '@anthropic-ai/sdk';
import { activeComplaintTypes } from '@/lib/voice/complaint-types';
import { buildSystemPrompt } from './prompt';
import { SITE_TOOLS, executeSiteTool, type ToolContext } from './tools';
import type { Card } from './cards';
import { cerereRescriere, verificaRaspuns, type Surse } from './guard';

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
  /** Cardurile de sub mesaj; de fiecare fel rămâne ultimul (modelul poate repeta un tool). */
  cards: Card[];
}

/** Ce poate cita modelul: promptul (datele fixe), ceasul, ce a scris clientul și ce au întors tool-urile — NU propriile
 *  lui replici de dinainte (o cifră inventată nu devine sursă). */
function surse(system: Anthropic.TextBlockParam[], messages: Anthropic.MessageParam[]): Surse {
  const texte = system.map((b) => b.text);
  for (const m of messages) {
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') { texte.push(m.content); continue; }
    for (const b of m.content) {
      if (b.type === 'text') texte.push(b.text);
      else if (b.type === 'tool_result') texte.push(typeof b.content === 'string' ? b.content : JSON.stringify(b.content));
    }
  }
  return { texte };
}

/** A doua oară cu cifre inventate: un răspuns fără cifre; cardurile (făcute de server) rămân. */
const SIGUR = {
  ro: 'Nu vreau să-ți dau o informație greșită. Uită-te la datele de mai jos sau scrie-mi întrebarea altfel; linia +373 60 401 010 (05:00–22:00) te ajută și ea.',
  ru: 'Не хочу дать вам неверную информацию. Посмотрите данные ниже или переформулируйте вопрос; также поможет линия +373 60 401 010 (05:00–22:00).',
};

const FALLBACK = {
  ro: 'Momentan nu pot răspunde. Încercați peste un minut sau sunați la +373 60 401 010.',
  ru: 'Сейчас не могу ответить. Попробуйте через минуту или позвоните на +373 60 401 010.',
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
  const cards = new Map<Card['type'], Card>();
  const cardList = () => [...cards.values()];
  let rescrieri = 0;
  let inceputPaza = messages.length;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await getClient().messages.create({
      model: MODEL, max_tokens: MAX_TOKENS, temperature: 0,
      system, tools: SITE_TOOLS, messages,
    });
    if (res.stop_reason !== 'tool_use' && !rescrieri) inceputPaza = messages.length;
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('\n').trim();
      // Paza (Ion, 10.10.2026: «să nu inventeze — bate în cuie»): orele, datele, sumele, procentele și telefoanele din
      // răspuns trebuie să fie în surse. Altfel: o rescriere; a doua oară — răspunsul sigur, fără cifre.
      const inc = reply ? verificaRaspuns(reply, surse(system, messages)) : [];
      if (inc.length) {
        console.warn('[asistent-site] paza: cifre fără sursă', JSON.stringify({ inc, rescris: rescrieri }));
        if (rescrieri < 1 && i < MAX_ITERATIONS - 1) {
          rescrieri++;
          messages.push({ role: 'user', content: cerereRescriere(inc) });
          continue;
        }
        messages.splice(inceputPaza);
        messages.push({ role: 'assistant', content: SIGUR[locale] });
        return { reply: SIGUR[locale], messages, toolsUsed, cards: cardList() };
      }
      if (rescrieri) {
        // Istoria păstrată fără replica respinsă și fără mesajul controlului: tura următoare vede doar varianta bună.
        // (Tool-urile chemate după control rămân: rezultatele lor sunt surse și pentru turele următoare.)
        messages.splice(inceputPaza, 2);
      }
      return { reply: reply || FALLBACK[locale], messages, toolsUsed, cards: cardList() };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name);
      const out = await executeSiteTool(ctx, block.name, (block.input ?? {}) as Record<string, unknown>);
      if (out.card) { cards.delete(out.card.type); cards.set(out.card.type, out.card); }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: 'user', content: results });
  }

  // Bucla n-a ajuns la un text: istoria se închide cu un răspuns, ca tura
  // următoare să nu înceapă după un tool_result fără replică.
  messages.push({ role: 'assistant', content: FALLBACK[locale] });
  return { reply: FALLBACK[locale], messages, toolsUsed, cards: cardList() };
}
