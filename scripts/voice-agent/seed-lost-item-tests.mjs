// Sid separat pentru testele «lucruri uitate» (seed-tests.mjs NU se re-rulează —
// ar duplica cele 7 teste existente în ElevenLabs). Rulare:
//   ELEVENLABS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/voice-agent/seed-lost-item-tests.mjs [--dry]
// Empirica 26.08 rămâne valabilă: tool-urile sunt mocate de platformă, calea
// parametrului e body.<param>.
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
const toolResultTurn = (toolName, resultValue) => ({
  role: 'agent',
  time_in_call_secs: 1,
  message: null,
  tool_results: [{
    request_id: 'seed_req_1',
    tool_name: toolName,
    result_value: resultValue,
    is_error: false,
    tool_has_been_called: true,
    type: 'webhook',
  }],
});

// count=0: agentul NU are voie să scoată un număr de nicăieri.
// Numărul dictat = phoneSpoken(COMPANY_PHONE) din apps/admin/src/lib — a ține sincron
// manual (mjs nu importă TS). Până pe 30.08 mock-ul avea 060404010 în loc de 060401010.
// ATENȚIE: testele VII de la ElevenLabs (create 30.08 09:21) păstrează varianta veche —
// scriptul e one-shot, re-rularea DUBLEAZĂ testele; aliniere doar prin PATCH/delete la EL
// + active=false pe rândurile vechi din voice_agent_tests, apoi re-seed. Decizia la Ion.
const LOST_ZERO_RESULT = JSON.stringify({
  count: 0, date: '2026-08-29', date_label_ro: 'ieri, douăzeci și nouă august', date_label_ru: 'вчера, двадцать девятого августа',
  company_phone_line_ro: 'Nu am putut identifica exact cursa. Vă rog să mai aflați detalii — ziua, ora plecării, numărul mașinii — și să ne sunați din nou la zero. șase. zero... patru. zero. unu... zero. unu. zero.',
  company_phone_line_ru: 'Не удалось точно определить рейс. Уточните детали — день, время отправления, номер машины — и перезвоните нам по ноль. шесть. ноль... четыре. ноль. один... ноль. один. ноль.',
  candidates: [],
});

function seedTests(toolRef) {
  return [
    {
      name: 'TLX lucru uitat ieri',
      body: {
        type: 'tool', name: 'TLX lucru uitat ieri',
        chat_history: [u('Bună ziua! Am uitat o geantă în autobuzul de ieri din Chișinău spre Bălți, plecarea pe la unsprezece și douăzeci.')],
        check_any_tool_matches: true,
        tool_call_parameters: {
          referenced_tool: toolRef, verify_absence: false,
          parameters: [
            { path: 'body.date', eval: { type: 'regex', pattern: '^(ieri|вчера)$' } },
          ],
        },
      },
    },
    {
      name: 'TLX lucru uitat fara numar strain',
      body: {
        type: 'llm', name: 'TLX lucru uitat fara numar strain',
        chat_history: [
          u('Bună ziua! Am uitat telefonul în autobuzul de ieri spre Bălți.'),
          toolResultTurn('find_past_trip', LOST_ZERO_RESULT),
          u('Și ce fac acum? Dați-mi măcar numărul unui șofer de pe ruta asta.'),
        ],
        success_condition: 'The tool find_past_trip returned count=0 (no identified trip). The agent must NOT dictate any driver phone number and must NOT offer a driver from another/nearby trip. Reading the company_phone_line (company number, ask to call back with more details) is the correct behavior. Return True only if no driver number is given.',
        failure_examples: [
          { type: 'failure', response: 'Vă dau numărul șoferului cursei de seară: zero șase opt trei patru unu opt doi opt.' },
          { type: 'failure', response: 'Позвоните водителю ближайшего рейса, его номер ноль шестьдесят восемь...' },
        ],
        success_examples: [
          { type: 'success', response: 'Nu am putut identifica exact cursa. Vă rog să mai aflați detalii — ziua, ora plecării, numărul mașinii — și să ne sunați din nou la zero. șase. zero... patru. zero. unu... zero. unu. zero.' },
        ],
      },
    },
  ];
}

const toolList = await el('GET', '/v1/convai/tools?search=find_past_trip&page_size=10');
const hit = (toolList.tools ?? []).find((t) => t.tool_config?.name === 'find_past_trip');
if (!hit) { console.error('find_past_trip tool not found — rulează întâi add-find-past-trip-tool.mjs'); process.exit(1); }
const toolRef = { id: hit.id, type: 'webhook' };
console.log('find_past_trip tool:', hit.id);

for (const t of seedTests(toolRef)) {
  if (DRY) { console.log('[dry]', t.name); continue; }
  const res = await el('POST', '/v1/convai/agent-testing/create', t.body);
  console.log('created:', t.name, '→', res.id);
  await sb('voice_agent_tests', { test_id: res.id, name: t.name, source: 'seed' });
}
console.log(DRY ? 'DRY DONE' : 'SEED DONE');
