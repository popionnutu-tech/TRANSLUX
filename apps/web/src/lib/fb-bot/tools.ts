import type Anthropic from '@anthropic-ai/sdk';

export const TRANSLUX_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_trips',
    description:
      'Find available TRANSLUX bus trips between two localities on a given date. ' +
      'Returns departure times, prices and driver contacts. ' +
      'Use when the user asks about available rides, seats, or timetables for a specific day.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Origin locality name in Romanian (e.g. "Chișinău", "Bălți").' },
        to: { type: 'string', description: 'Destination locality name in Romanian.' },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format. Optional — defaults to today in Europe/Chisinau timezone.',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_schedule',
    description:
      'Get the general weekly schedule (departure times) for TRANSLUX routes filtered by origin and/or destination. ' +
      'Use when the user asks "what time do you have trips" or "at what hour" without a specific date.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Origin locality name in Romanian.' },
        to: { type: 'string', description: 'Destination locality name in Romanian.' },
      },
    },
  },
  {
    name: 'get_price',
    description:
      'Get the ticket price for a specific TRANSLUX route between two localities. ' +
      'Returns price in MDL and whether a promotional offer applies.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Origin locality name in Romanian.' },
        to: { type: 'string', description: 'Destination locality name in Romanian.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_offers',
    description:
      'Get the list of currently active promotional offers (discounted prices on specific routes). ' +
      'Use when the user asks about discounts, promotions or "oferte".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_company_info',
    description:
      'Get static TRANSLUX company information: phone number, station addresses, baggage policy, children policy, ' +
      'cancellation policy, working hours, website. Use when the user asks about contacts, locations or rules.',
    input_schema: { type: 'object', properties: {} },
  },
];

const ENDPOINT_MAP: Record<string, string> = {
  search_trips: 'search-trips',
  get_schedule: 'get-schedule',
  get_price: 'get-price',
  get_offers: 'get-offers',
  get_company_info: 'get-company-info',
};

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!configured) return 'http://localhost:3000';
  return configured.startsWith('http') ? configured : `https://${configured}`;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const endpoint = ENDPOINT_MAP[name];
  if (!endpoint) {
    return { error: `Unknown tool: ${name}` };
  }

  const apiKey = process.env.VOICE_API_KEY;
  if (!apiKey) {
    return { error: 'VOICE_API_KEY is not configured on the server' };
  }

  try {
    const res = await fetch(`${getBaseUrl()}/api/voice-tools/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-api-key': apiKey,
      },
      body: JSON.stringify(input || {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({ error: 'Invalid JSON from tool endpoint' }));
    if (!res.ok) {
      return { error: `Tool ${name} failed with status ${res.status}`, details: data };
    }
    return data;
  } catch (err) {
    return { error: `Tool ${name} threw`, details: (err as Error).message };
  }
}
