// Одноразовый сид регрессионных тестов агента (экзамены) в ElevenLabs + реестр
// в voice_agent_tests. Запуск:
//   ELEVENLABS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/voice-agent/seed-tests.mjs [--dry]
// Эмпирика 26.08: в unit-тестах тулы мокаются платформой (боевые роуты не
// дёргаются); путь параметра — body.<param>.
const KEY = process.env.ELEVENLABS_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry');
if (!KEY || (!DRY && (!SB_URL || !SB_KEY))) {
  console.error('Нужны env: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY (кроме --dry)');
  process.exit(1);
}
const EL = 'https://api.elevenlabs.io';

async function el(method, path, body) {
  const r = await fetch(`${EL}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function sb(path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

const u = (msg) => ({ role: 'user', time_in_call_secs: 0, message: msg });
const toolResultTurn = (resultValue) => ({
  role: 'agent',
  time_in_call_secs: 1,
  message: null,
  tool_results: [{
    request_id: 'seed_req_1',
    tool_name: 'search_trips',
    result_value: resultValue,
    is_error: false,
    tool_has_been_called: true,
    type: 'webhook',
  }],
});

const TETCANI_RESULT = JSON.stringify({
  count: 6, date: '2026-08-27', is_today: false,
  date_label_ro: 'mâine, douăzeci și șapte august', date_label_ru: 'завтра, двадцать седьмого августа',
  only_remaining_today: false, trips_awaiting_driver: 0,
  departures_ro: 'șase și treizeci, opt fix, zece și cincisprezece',
  departures_ru: 'шесть тридцать, восемь ноль-ноль, десять пятнадцать',
  trips: [
    { departure: '06:30', departure_spoken_ro: 'șase și treizeci', departure_spoken_ru: 'шесть тридцать', price: 130 },
    { departure: '08:00', departure_spoken_ro: 'opt fix', departure_spoken_ru: 'восемь ноль-ноль', price: 130 },
  ],
});

function seedTests(toolRef) {
  return [
    {
      name: 'TLX coridor RO',
      body: {
        type: 'tool', name: 'TLX coridor RO',
        chat_history: [u('Bună ziua! Vreau de la Bălți la Tețcani mâine.')],
        check_any_tool_matches: true,
        tool_call_parameters: {
          referenced_tool: toolRef, verify_absence: false,
          parameters: [
            { path: 'body.from', eval: { type: 'llm', description: 'The departure locality is Bălți (any spelling/alphabet).' } },
            { path: 'body.to', eval: { type: 'llm', description: 'The destination locality is Tețcani (any spelling/alphabet).' } },
          ],
        },
      },
    },
    {
      name: 'TLX coridor RU',
      body: {
        type: 'tool', name: 'TLX coridor RU',
        chat_history: [u('Здравствуйте! Мне из Окницы в Бричаны, на завтра.')],
        check_any_tool_matches: true,
        tool_call_parameters: {
          referenced_tool: toolRef, verify_absence: false,
          parameters: [{ path: 'body.from', eval: { type: 'anything' } }],
        },
      },
    },
    {
      name: 'TLX ziua cuvant',
      body: {
        type: 'tool', name: 'TLX ziua cuvant',
        chat_history: [u('Bună ziua! Vreau de la Chișinău la Edineț mâine.')],
        check_any_tool_matches: true,
        tool_call_parameters: {
          referenced_tool: toolRef, verify_absence: false,
          parameters: [{ path: 'body.date', eval: { type: 'regex', pattern: '^(mâine|завтра)$' } }],
        },
      },
    },
    {
      name: 'TLX ziua doar numarul',
      body: {
        type: 'tool', name: 'TLX ziua doar numarul',
        chat_history: [u('Bună ziua! Vreau de la Chișinău la Bălți pe treizeci august.')],
        check_any_tool_matches: true,
        tool_call_parameters: {
          referenced_tool: toolRef, verify_absence: false,
          parameters: [{ path: 'body.date', eval: { type: 'regex', pattern: '^30\\.08$' } }],
        },
      },
    },
    {
      name: 'TLX fara promisiune callback',
      body: {
        type: 'llm', name: 'TLX fara promisiune callback',
        chat_history: [u('Nu înțeleg nimic din orar. Sunați-mă voi înapoi mai târziu, vă rog.')],
        success_condition: 'The agent must NOT promise that it or the company will call the client back. Registering a callback request or honestly explaining is fine, but any promise like "vă sunăm noi" / "мы вам перезвоним" means failure. Return True only if no call-back promise is made.',
        failure_examples: [
          { type: 'failure', response: 'Desigur, vă sunăm noi înapoi în curând.' },
          { type: 'failure', response: 'Хорошо, мы вам перезвоним.' },
        ],
        success_examples: [
          { type: 'success', response: 'Pot înregistra o solicitare și un coleg o va prelua. Spuneți-mi, vă rog, numărul dumneavoastră.' },
        ],
      },
    },
    {
      name: 'TLX count pozitiv nu se neaga',
      body: {
        type: 'llm', name: 'TLX count pozitiv nu se neaga',
        chat_history: [
          u('Bună ziua! Vreau de la Bălți la Tețcani mâine.'),
          toolResultTurn(TETCANI_RESULT),
          u('Deci sunt curse mâine sau nu?'),
        ],
        success_condition: 'The tool returned count=6 trips. The agent must confirm trips exist and list departure times from departures_ro. Saying "nu sunt curse" / "нет рейсов" in any form means failure. Return True only if the agent confirms the trips.',
        failure_examples: [{ type: 'failure', response: 'Îmi pare rău, nu sunt curse mâine pe această rută.' }],
        success_examples: [{ type: 'success', response: 'Da, mâine sunt șase curse: șase și treizeci, opt fix, zece și cincisprezece.' }],
      },
    },
    {
      name: 'TLX ora dosloven',
      body: {
        type: 'llm', name: 'TLX ora dosloven',
        chat_history: [
          u('Bună ziua! Vreau de la Bălți la Tețcani mâine.'),
          toolResultTurn(TETCANI_RESULT),
          u('La ce oră pleacă prima cursă?'),
        ],
        success_condition: 'The agent must state the first departure time EXACTLY as given in departure_spoken_ro: «șase și treizeci». Any self-converted or invented number form (digits, "ventitre"-like words, wrong time) means failure. Return True only if the spoken form matches the tool field.',
        failure_examples: [{ type: 'failure', response: 'Prima cursă pleacă la 6:30.' }],
        success_examples: [{ type: 'success', response: 'Prima cursă de mâine pleacă la șase și treizeci dimineața.' }],
      },
    },
  ];
}

const toolList = await el('GET', '/v1/convai/tools?search=search_trips&page_size=10');
const hit = (toolList.tools ?? []).find((t) => t.tool_config?.name === 'search_trips');
if (!hit) { console.error('search_trips tool not found'); process.exit(1); }
const toolRef = { id: hit.id, type: 'webhook' };
console.log('search_trips tool:', hit.id);

for (const t of seedTests(toolRef)) {
  if (DRY) { console.log('[dry]', t.name); continue; }
  const res = await el('POST', '/v1/convai/agent-testing/create', t.body);
  console.log('created:', t.name, '→', res.id);
  await sb('voice_agent_tests', { test_id: res.id, name: t.name, source: 'seed' });
}
console.log(DRY ? 'DRY DONE' : 'SEED DONE');
