// One-off (30.08): realiniază testul VIU «TLX lucru uitat fara numar strain» de la
// ElevenLabs la mock-ul corectat din seed-lost-item-tests.mjs (numărul companiei era
// 060404010 în loc de 060401010 + formatul vechi de dictare). Testul «ieri» (tool)
// nu conține numere — nu se atinge. Întâi încearcă update in-place (test_id neschimbat);
// dacă API-ul nu suportă, șterge + recreează + mută test_id în voice_agent_tests.
// Rulare:
//   ELEVENLABS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/voice-agent/fix-lost-item-test.mjs [--dry]
const KEY = process.env.ELEVENLABS_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry');
if (!KEY || !SB_URL || !SB_KEY) {
  console.error('Нужны env: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const EL = 'https://api.elevenlabs.io';
const TEST_NAME = 'TLX lucru uitat fara numar strain';

async function el(method, path, body) {
  const r = await fetch(`${EL}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

async function sb(method, path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`supabase ${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// Mock corectat — byte-identic cu seed-lost-item-tests.mjs (sincron manual, mjs↔TS).
const LOST_ZERO_RESULT = JSON.stringify({
  count: 0, date: '2026-08-29', date_label_ro: 'ieri, douăzeci și nouă august', date_label_ru: 'вчера, двадцать девятого августа',
  company_phone_line_ro: 'Nu am putut identifica exact cursa. Vă rog să mai aflați detalii — ziua, ora plecării, numărul mașinii — și să ne sunați din nou la zero. șase. zero... patru. zero. unu... zero. unu. zero.',
  company_phone_line_ru: 'Не удалось точно определить рейс. Уточните детали — день, время отправления, номер машины — и перезвоните нам по ноль. шесть. ноль... четыре. ноль. один... ноль. один. ноль.',
  candidates: [],
});
const u = (msg) => ({ role: 'user', time_in_call_secs: 0, message: msg });
const newBody = {
  type: 'llm', name: TEST_NAME,
  chat_history: [
    u('Bună ziua! Am uitat telefonul în autobuzul de ieri spre Bălți.'),
    {
      role: 'agent', time_in_call_secs: 1, message: null,
      tool_results: [{
        request_id: 'seed_req_1', tool_name: 'find_past_trip', result_value: LOST_ZERO_RESULT,
        is_error: false, tool_has_been_called: true, type: 'webhook',
      }],
    },
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
};

const rows = await sb('GET', `voice_agent_tests?name=eq.${encodeURIComponent(TEST_NAME)}&active=eq.true&select=test_id,name,active`);
if (rows.length !== 1) { console.error(`aștept exact 1 rând activ «${TEST_NAME}», găsite: ${rows.length}`); process.exit(1); }
const oldId = rows[0].test_id;
console.log('test viu:', oldId);

const cur = await el('GET', `/v1/convai/agent-testing/${oldId}`);
if (!cur.ok) { console.error(`GET test: ${cur.status} ${cur.text.slice(0, 200)}`); process.exit(1); }
const curStr = JSON.stringify(cur.json);
console.log('conține 060404010 (greșit):', curStr.includes('patru zero patru') || curStr.includes('четыреста четыре'));
if (DRY) { console.log('DRY DONE'); process.exit(0); }

// 1) update in-place (test_id rămâne, fail_streak/istoric intacte)
const upd = await el('PUT', `/v1/convai/agent-testing/${oldId}`, newBody);
if (upd.ok) {
  const check = await el('GET', `/v1/convai/agent-testing/${oldId}`);
  const s = JSON.stringify(check.json);
  console.log('UPDATE in-place OK. Număr corect prezent:', s.includes('zero. șase. zero... patru. zero. unu'));
  process.exit(0);
}
console.log(`PUT nesuportat (${upd.status}) — fallback delete+create.`);

// 2) fallback: create nou → mută rândul DB → delete vechi (ordinea nu lasă gol în rotație)
const created = await el('POST', '/v1/convai/agent-testing/create', newBody);
if (!created.ok || !created.json?.id) { console.error(`create: ${created.status} ${created.text.slice(0, 200)}`); process.exit(1); }
const newId = created.json.id;
console.log('creat nou:', newId);
await sb('PATCH', `voice_agent_tests?test_id=eq.${encodeURIComponent(oldId)}`, { test_id: newId, fail_streak: 0 });
const del = await el('DELETE', `/v1/convai/agent-testing/${oldId}`);
console.log('delete vechi:', del.ok ? 'OK' : `EȘUAT ${del.status} — de șters manual în dashboard EL`);
console.log('DONE');
