import Anthropic from '@anthropic-ai/sdk';
import type { FbEventUsage } from '@translux/db';
import { TRANSLUX_TOOLS, executeTool } from './tools';

const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 5;
const MAX_OUTPUT_TOKENS = 1024;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResult {
  text: string;
  usage: FbEventUsage;
  stopReason: string;
  iterations: number;
}

export async function runClaudeAgent(params: {
  systemPrompt: string;
  messages: AgentMessage[];
}): Promise<AgentResult> {
  const anthropic = getClient();

  // Build a non-cached date prefix so Claude always knows current local date.
  // Without this, Claude has no clock and hallucinates dates when the user
  // says "tomorrow", "next week" etc.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const dateIso = `${get('year')}-${get('month')}-${get('day')}`;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tomorrow);
  const datePrefix =
    `Current date and time: ${dateIso} ${get('hour')}:${get('minute')} (${get('weekday')}, Europe/Chisinau).\n` +
    `When the user says "today" / "azi" / "сегодня", use ${dateIso}.\n` +
    `When the user says "tomorrow" / "mâine" / "завтра", use ${tomorrowIso}.\n` +
    `Always pass dates to tools in YYYY-MM-DD format. Never invent or guess a date — always derive from the current date above.`;

  const anthropicMessages: Anthropic.MessageParam[] = params.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const aggregatedUsage: FbEventUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    model: MODEL,
  };

  let iterations = 0;
  let finalText = '';
  let stopReason = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: datePrefix,
        },
      ],
      tools: TRANSLUX_TOOLS,
      messages: anthropicMessages,
    });

    aggregatedUsage.input_tokens = (aggregatedUsage.input_tokens || 0) + (response.usage.input_tokens || 0);
    aggregatedUsage.output_tokens = (aggregatedUsage.output_tokens || 0) + (response.usage.output_tokens || 0);
    aggregatedUsage.cache_read_input_tokens =
      (aggregatedUsage.cache_read_input_tokens || 0) + (response.usage.cache_read_input_tokens || 0);
    aggregatedUsage.cache_creation_input_tokens =
      (aggregatedUsage.cache_creation_input_tokens || 0) + (response.usage.cache_creation_input_tokens || 0);

    stopReason = response.stop_reason || '';

    if (response.stop_reason !== 'tool_use') {
      finalText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      break;
    }

    anthropicMessages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const result = await executeTool(block.name, (block.input || {}) as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    anthropicMessages.push({ role: 'user', content: toolResults });
  }

  if (!finalText) {
    finalText = 'Momentan nu pot răspunde, reveniți mai târziu.';
  }

  return {
    text: finalText,
    usage: aggregatedUsage,
    stopReason,
    iterations,
  };
}
