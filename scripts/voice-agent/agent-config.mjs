// scripts/voice-agent/agent-config.mjs
// Единственный источник правды по конфигурации голосового агента TRANSLUX.
// Изменение промпта/tools = правка здесь + `node scripts/voice-agent/setup.mjs`.

export const AGENT_NAME = 'TRANSLUX Voice Operator';

export const SYSTEM_PROMPT = `Ești operatorul telefonic al companiei TRANSLUX — companie de transport pasageri pe rutele Chișinău–Bălți și localitățile intermediare din Moldova.
Ты — телефонный оператор компании TRANSLUX — пассажирские перевозки по маршрутам Кишинёв–Бельцы и промежуточные населённые пункты Молдовы.

## Reguli de bază / Основные правила:
1. LIMBA / ЯЗЫК: Detectează automat limba clientului din primele cuvinte și continuă în acea limbă (română sau rusă). Dacă nu ești sigur, întreabă politicos.
2. TON: Profesional, prietenos, concis. Nu spune mai mult decât e necesar. Răspunsurile la telefon trebuie să fie scurte.
3. CURSE/BILETE/ORAR: folosește tool-ul search_trips (from, to, date YYYY-MM-DD; fără dată → azi).
4. PREȚ: folosește tool-ul get_price (from, to).
5. OFERTE/PROMOȚII: folosește tool-ul get_offers.
6. INFORMAȚII COMPANIE (adrese, bagaje, copii, anulare, contacte): folosește get_company_info.
7. PROGRAM/ORAR general: folosește get_schedule.
8. RECLAMAȚII: ascultă, cere detalii (data, ruta, ce s-a întâmplat), apoi folosește request_callback cu motivul — spune clientului că un coleg îl va suna înapoi.
9. OPERATOR UMAN: dacă clientul insistă să vorbească cu un om, folosește tool-ul request_callback (telefonul apelantului {{system__caller_id}}, conversation_id {{system__conversation_id}}) și confirmă că va fi sunat înapoi. NU da niciun număr de telefon pentru "operator uman".
10. NU INVENTA: dacă nu ai informația, spune sincer și oferă request_callback. Nu inventa curse, prețuri sau orare.

## Cum prezinți cursele:
- RO: "Pe data de [DATA] avem [N] curse de la [FROM] la [TO]. Prima pleacă la [ORA], prețul [PREȚ] lei..."
- RU: "На [ДАТА] есть [N] рейсов из [ОТКУДА] в [КУДА]. Первый в [ВРЕМЯ], цена [ЦЕНА] лей..."
Dacă e ofertă activă: menționează prețul vechi și cel nou.`;

export const FIRST_MESSAGE =
  'Bună ziua! Sunteți la TRANSLUX, transport de pasageri. Cum vă pot ajuta? / Здравствуйте! Вы позвонили в TRANSLUX. Чем могу помочь?';

export const TOOL_NAMES = [
  'search_trips', 'get_price', 'get_offers', 'get_schedule', 'get_company_info', 'request_callback',
];

function webhookTool({ name, description, url, params, required, voiceApiKey }) {
  return {
    type: 'webhook',
    name,
    description,
    response_timeout_secs: 10,
    api_schema: {
      url,
      method: 'POST',
      request_headers: { 'X-Voice-API-Key': voiceApiKey, 'Content-Type': 'application/json' },
      request_body_schema: {
        type: 'object',
        properties: params,
        required: required ?? [],
        description,
      },
    },
  };
}

export function buildTools({ baseUrl, voiceApiKey }) {
  const b = `${baseUrl}/api/voice-tools`;
  const city = (d) => ({ type: 'string', description: d });
  return [
    webhookTool({
      name: 'search_trips',
      description: 'Search available trips between two cities on a date. Use for questions about trips, buses, departures, tickets.',
      url: `${b}/search-trips`, voiceApiKey,
      params: {
        from: city('Departure city in Romanian, e.g. "Chișinău", "Bălți"'),
        to: city('Destination city in Romanian'),
        date: { type: 'string', description: 'Date YYYY-MM-DD; omit for today' },
      },
      required: ['from', 'to'],
    }),
    webhookTool({
      name: 'get_price',
      description: 'Get ticket price between two cities.',
      url: `${b}/get-price`, voiceApiKey,
      params: { from: city('Departure city in Romanian'), to: city('Destination city in Romanian') },
      required: ['from', 'to'],
    }),
    webhookTool({
      name: 'get_offers',
      description: 'Get active promotional offers and discounts.',
      url: `${b}/get-offers`, voiceApiKey, params: {},
    }),
    webhookTool({
      name: 'get_schedule',
      description: 'Get bus schedule/timetable for a route or city.',
      url: `${b}/get-schedule`, voiceApiKey,
      params: { from: city('Departure city (optional)'), to: city('Destination city (optional)') },
    }),
    webhookTool({
      name: 'get_company_info',
      description: 'Company info: addresses, phones, baggage/children/cancellation policies.',
      url: `${b}/get-company-info`, voiceApiKey, params: {},
    }),
    webhookTool({
      name: 'request_callback',
      description: 'Register a callback request when the caller wants a human operator, has a complaint, or the agent lacks information. A colleague will call back.',
      url: `${b}/request-callback`, voiceApiKey,
      params: {
        phone: { type: 'string', description: 'Caller phone, default {{system__caller_id}}' },
        name: { type: 'string', description: 'Caller name if given' },
        reason: { type: 'string', description: 'Short reason in Romanian' },
        conversation_id: { type: 'string', description: 'Set to {{system__conversation_id}}' },
      },
      required: ['reason'],
    }),
  ];
}

export function buildAgentPayload({ baseUrl, voiceApiKey, voiceId }) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: 'ro',
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: 'claude-haiku-4-5',
          temperature: 0.3,
          tools: [
            ...buildTools({ baseUrl, voiceApiKey }),
            { type: 'system', name: 'end_call', description: '' },
            { type: 'system', name: 'language_detection', description: '' },
          ],
        },
      },
      tts: { model_id: 'eleven_v3_conversational', voice_id: voiceId },
    },
  };
}
