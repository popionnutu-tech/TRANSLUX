// Înregistrează tool-ul find_past_trip (lucruri uitate) ca workspace tool în
// ElevenLabs și îl leagă de AMBII agenți (RO Cristina + RU). Idempotent: tool
// existent nu se recreează, id deja legat nu se dublează.
// Rulare:
//   ELEVENLABS_API_KEY=... ADMIN_BASE_URL=https://<admin>.vercel.app VOICE_API_KEY=... \
//     node scripts/voice-agent/add-find-past-trip-tool.mjs [--dry]
import { buildTools } from './agent-config.mjs';

const KEY = process.env.ELEVENLABS_API_KEY;
const DRY = process.argv.includes('--dry');
// Aceiași agenți ca în apps/admin/src/lib/voice/el.ts — se schimbă împreună.
const AGENT_IDS = [
  'agent_3301kn4qwa6jep38d4b63m6s6pkh', // RO (Cristina, numărul e pe el)
  'agent_9101m0t3ej97ekttf2matgf203p9', // RU
];

if (!KEY) {
  console.error('Missing env: ELEVENLABS_API_KEY');
  process.exit(1);
}

const EL = 'https://api.elevenlabs.io';
async function el(method, path, body) {
  const r = await fetch(`${EL}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ADMIN_BASE_URL și VOICE_API_KEY: din env sau, dacă lipsesc local, din tool-ul
// LIVE search_trips — el poartă exact URL-ul și cheia cu care merge producția.
async function resolveBaseAndKey() {
  let baseUrl = process.env.ADMIN_BASE_URL;
  let voiceApiKey = process.env.VOICE_API_KEY;
  if (baseUrl && voiceApiKey) return { baseUrl, voiceApiKey };
  const list = await el('GET', '/v1/convai/tools?search=search_trips&page_size=10');
  const st = (list.tools ?? []).find((t) => t.tool_config?.name === 'search_trips');
  const schema = st?.tool_config?.api_schema;
  if (!schema) { console.error('search_trips tool inaccesibil — setează ADMIN_BASE_URL și VOICE_API_KEY'); process.exit(1); }
  baseUrl = baseUrl ?? String(schema.url).replace(/\/api\/voice-tools\/.*$/, '');
  voiceApiKey = voiceApiKey ?? schema.request_headers?.['X-Voice-API-Key'] ?? schema.request_headers?.['x-voice-api-key'];
  if (!baseUrl || !voiceApiKey) { console.error('Nu am putut deduce baza/cheia din search_trips'); process.exit(1); }
  console.log(`Base URL din tool-ul live: ${baseUrl}`);
  return { baseUrl, voiceApiKey };
}

const { baseUrl, voiceApiKey } = await resolveBaseAndKey();
const toolConfig = buildTools({ baseUrl, voiceApiKey })
  .find((t) => t.name === 'find_past_trip');
if (!toolConfig) { console.error('find_past_trip lipsește din agent-config.mjs'); process.exit(1); }

// Cheia NU se tipărește (security High 1: scrollback/istoric = scurgere).
if (DRY) {
  const masked = { ...toolConfig, api_schema: { ...toolConfig.api_schema, request_headers: { ...toolConfig.api_schema.request_headers, 'X-Voice-API-Key': '***' } } };
  console.log(JSON.stringify(masked, null, 2));
  process.exit(0);
}

// 1) Workspace tool: refolosește-l dacă există deja.
const list = await el('GET', '/v1/convai/tools?search=find_past_trip&page_size=10');
let tool = (list.tools ?? []).find((t) => t.tool_config?.name === 'find_past_trip');
if (tool) {
  console.log(`Tool există deja: ${tool.id}`);
} else {
  tool = await el('POST', '/v1/convai/tools', { tool_config: toolConfig });
  console.log(`Tool creat: ${tool.id}`);
}

// 2) Legare la agenți prin tool_ids (agenții folosesc workspace tools, nu inline).
for (const agentId of AGENT_IDS) {
  const cfg = await el('GET', `/v1/convai/agents/${agentId}`);
  const prompt = cfg?.conversation_config?.agent?.prompt ?? {};
  const ids = prompt.tool_ids ?? [];
  if (ids.includes(tool.id)) {
    console.log(`${agentId}: deja legat`);
    continue;
  }
  await el('PATCH', `/v1/convai/agents/${agentId}`, {
    conversation_config: { agent: { prompt: { tool_ids: [...ids, tool.id] } } },
  });
  console.log(`${agentId}: tool_ids += ${tool.id}`);
}
console.log('DONE');
