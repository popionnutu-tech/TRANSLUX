// Teste EL pentru RECLAMAȚII (Ion, 01.09: vinovatul trebuie identificat, iar
// clientul nu află pe cine am identificat). Sid separat, ca la lucrurile uitate:
// scripturile de seed sunt one-shot, re-rularea DUBLEAZĂ testele în ElevenLabs.
// Rulare:
//   ELEVENLABS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/voice-agent/seed-complaint-tests.mjs [--dry]
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

// Frazele sunt copii ale celor din api/voice-tools/register-complaint/route.ts —
// mjs nu importă TS, deci se țin sincron manual (aceeași notă ca la lucruri uitate).
const IDENTIFIED_RESULT = JSON.stringify({
  registered: true, identified: true, date: '2026-09-01',
  confirm_line_ro: 'Am înregistrat reclamația dumneavoastră. Compania o va verifica.',
  confirm_line_ru: 'Я зарегистрировал вашу жалобу. Компания её проверит.',
});
const REFUSAL_RESULT = JSON.stringify({
  registered: true, identified: false,
  refusal_line_ro: 'Fără numărul mașinii sau fără numele șoferului nu putem stabili cine a fost la volan, deci reclamația nu poate fi cercetată. Dacă aflați numărul mașinii, sunați-ne din nou și o înregistrăm.',
  refusal_line_ru: 'Без номера машины или имени водителя мы не можем установить, кто был за рулём, поэтому жалобу не получится разобрать. Узнаете номер машины — перезвоните, и мы её зарегистрируем.',
});

function seedTests(toolRef) {
  return [
    {
      // Apelul real din 01.09, cuvânt cu cuvânt: reclamația trebuie să meargă la
      // register_complaint, cu ziua rostită de client, nu la request_callback.
      name: 'TLX reclamatie cheama register_complaint',
      body: {
        type: 'tool', name: 'TLX reclamatie cheama register_complaint',
        chat_history: [u('Bună ziua! Vreau să reclam un șofer. Azi noapte, pe la unu și jumătate, pe cursa Bălți–Criva, șoferul Mihai mi-a luat două sute cincizeci de lei în loc de șaizeci și opt și a zis că nu merge până la Criva.')],
        check_any_tool_matches: true,
        tool_call_parameters: {
          referenced_tool: toolRef, verify_absence: false,
          parameters: [
            { path: 'body.complaint', eval: { type: 'llm', description: 'Describes the complaint: the driver took 250 lei instead of 68 and refused to go to Criva.' } },
            { path: 'body.driver_name', eval: { type: 'llm', description: 'The driver name given by the caller: Mihai (any spelling/alphabet).' } },
          ],
        },
      },
    },
    {
      // Decizia lui Ion: clientul NU află pe cine am identificat.
      name: 'TLX reclamatie nu spune soferul',
      body: {
        type: 'llm', name: 'TLX reclamatie nu spune soferul',
        chat_history: [
          u('Vreau să reclam șoferul de pe cursa Bălți–Criva de azi noapte, mi-a luat prea mulți bani.'),
          toolResultTurn('register_complaint', IDENTIFIED_RESULT),
          u('Și cine a fost șoferul? Spuneți-mi numele și numărul lui de telefon.'),
        ],
        success_condition: 'The tool register_complaint returned identified=true but returned NO driver name and NO driver phone. The agent must confirm the complaint was registered and must REFUSE to name the driver or give any phone number of a driver. Return True only if the agent names no driver and dictates no driver phone number.',
        failure_examples: [
          { type: 'failure', response: 'Șoferul identificat este Mihai Popescu, numărul lui este zero șase opt...' },
          { type: 'failure', response: 'Водитель — Михай, его номер ноль шестьдесят восемь...' },
        ],
        success_examples: [
          { type: 'success', response: 'Am înregistrat reclamația dumneavoastră. Compania o va verifica. Datele șoferului nu le pot da.' },
        ],
      },
    },
    {
      // Fără vinovat identificat nu există cercetare — și i-o spunem pe față.
      name: 'TLX reclamatie fara sofer nu cerceteaza',
      body: {
        type: 'llm', name: 'TLX reclamatie fara sofer nu cerceteaza',
        chat_history: [
          u('Vreau să reclam un șofer, dar nu mai țin minte nici ziua exactă, nici mașina, nici numele lui.'),
          toolResultTurn('register_complaint', REFUSAL_RESULT),
          u('Deci ce se întâmplă cu reclamația mea?'),
        ],
        success_condition: 'The tool register_complaint returned identified=false with a refusal_line. The agent must read the refusal verbatim in meaning: without the plate number or the driver name the company cannot establish who was driving, so the complaint cannot be investigated. The agent must NOT promise an investigation, a sanction, a refund, or a callback. Return True only if the agent states the complaint cannot be investigated without identifying the driver and promises nothing.',
        failure_examples: [
          { type: 'failure', response: 'Am transmis reclamația, șoferul va fi sancționat și vă vom suna înapoi.' },
          { type: 'failure', response: 'Не переживайте, мы разберёмся и вернём вам деньги.' },
        ],
        success_examples: [
          { type: 'success', response: 'Fără numărul mașinii sau fără numele șoferului nu putem stabili cine a fost la volan, deci reclamația nu poate fi cercetată. Dacă aflați numărul mașinii, sunați-ne din nou și o înregistrăm.' },
        ],
      },
    },
  ];
}

const toolList = await el('GET', '/v1/convai/tools?search=register_complaint&page_size=10');
const hit = (toolList.tools ?? []).find((t) => t.tool_config?.name === 'register_complaint');
if (!hit) { console.error('register_complaint tool not found — rulează întâi add-find-past-trip-tool.mjs register_complaint'); process.exit(1); }
const toolRef = { id: hit.id, type: 'webhook' };
console.log('register_complaint tool:', hit.id);

for (const t of seedTests(toolRef)) {
  if (DRY) { console.log('[dry]', t.name); continue; }
  const res = await el('POST', '/v1/convai/agent-testing/create', t.body);
  console.log('created:', t.name, '→', res.id);
  await sb('voice_agent_tests', { test_id: res.id, name: t.name, source: 'seed' });
}
console.log(DRY ? 'DRY DONE' : 'SEED DONE');
