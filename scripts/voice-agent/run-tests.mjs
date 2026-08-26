// Ручной прогон экзаменов агента, при желании — с промптом-КАНДИДАТОМ (правило
// канона цело: кандидат гоняется через agent_config_override run-tests, живой
// агент не меняется). Запуск:
//   ELEVENLABS_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/voice-agent/run-tests.mjs [--prompt-file candidate.txt]
// ВАЖНО (эмпирика 26.08): agent_config_override — полный ad-hoc конфиг, поэтому
// шлём ВЕСЬ живой conversation_config/platform_settings с заменённым промптом,
// а не только изменённое поле — иначе агент тестируется на дефолтах.
import { readFileSync } from 'node:fs';

const KEY = process.env.ELEVENLABS_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY || !SB_URL || !SB_KEY) {
  console.error('Нужны env: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}
const AGENT_ID = 'agent_3301kn4qwa6jep38d4b63m6s6pkh';
const EL = 'https://api.elevenlabs.io';
const promptFileIdx = process.argv.indexOf('--prompt-file');
const promptFile = promptFileIdx > -1 ? process.argv[promptFileIdx + 1] : null;

async function el(method, path, body) {
  const r = await fetch(`${EL}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const regRes = await fetch(`${SB_URL}/rest/v1/voice_agent_tests?active=eq.true&select=test_id,name`, {
  headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
});
const registry = await regRes.json();
if (!Array.isArray(registry) || registry.length === 0) {
  console.error('Реестр voice_agent_tests пуст — сначала seed-tests.mjs');
  process.exit(1);
}
console.log(`Тестов в реестре: ${registry.length}`);

const runBody = { tests: registry.map((t) => ({ test_id: t.test_id })) };
if (promptFile) {
  const candidate = readFileSync(promptFile, 'utf8');
  const agent = await el('GET', `/v1/convai/agents/${AGENT_ID}`);
  const cc = agent.conversation_config;
  cc.agent.prompt.prompt = candidate;
  cc.conversation = { ...(cc.conversation ?? {}), text_only: true };
  runBody.agent_config_override = { conversation_config: cc, platform_settings: agent.platform_settings ?? {} };
  console.log(`Кандидат: ${promptFile} (${candidate.length} символов)`);
}

const run = await el('POST', `/v1/convai/agents/${AGENT_ID}/run-tests`, runBody);
console.log('invocation:', run.id);

const names = new Map(registry.map((t) => [t.test_id, t.name]));
const deadline = Date.now() + 5 * 60 * 1000;
let inv = run;
while (Date.now() < deadline) {
  const runs = inv.test_runs ?? [];
  const pending = runs.filter((r) => r.status === 'pending').length;
  if (runs.length && pending === 0) break;
  await new Promise((r) => setTimeout(r, 4000));
  inv = await el('GET', `/v1/convai/test-invocations/${run.id}`);
}

let failed = 0;
for (const r of inv.test_runs ?? []) {
  const name = names.get(r.test_id) ?? r.test_id;
  const mark = r.status === 'passed' ? '✓' : '✗';
  if (r.status !== 'passed') failed++;
  console.log(`${mark} ${name} [${r.status}]`);
  if (r.status !== 'passed') {
    console.log(`   ${String(r.condition_result?.rationale?.summary ?? '').slice(0, 200)}`);
  }
}
console.log(failed === 0 ? 'ALL GREEN' : `FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
