// scripts/voice-agent/setup.mjs
// Идемпотентная настройка голосового агента TRANSLUX в ElevenLabs.
// Запуск: ELEVENLABS_API_KEY=... ADMIN_BASE_URL=https://<admin>.vercel.app VOICE_API_KEY=... node scripts/voice-agent/setup.mjs [--dry]
import { AGENT_NAME, buildAgentPayload } from './agent-config.mjs';

const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = process.env.ADMIN_BASE_URL;
const VOICE_API_KEY = process.env.VOICE_API_KEY;
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;
const DRY = process.argv.includes('--dry');

if (!BASE_URL || !VOICE_API_KEY || (!KEY && !DRY)) {
  console.error('Missing env: ELEVENLABS_API_KEY, ADMIN_BASE_URL, VOICE_API_KEY are required');
  process.exit(1);
}

async function el(path, { method = 'GET', body } = {}) {
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    // Печатаем тело целиком: 422 ElevenLabs перечисляет допустимые enum-значения.
    throw new Error(`${method} ${path} → ${resp.status}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function resolveVoiceId() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const { voices } = await el('/v1/voices');
  const match = (voices || []).find(v => /ana maria/i.test(v.name));
  if (match) {
    console.log(`Voice: ${match.name} (${match.voice_id})`);
    return match.voice_id;
  }
  console.error('Set ELEVENLABS_VOICE_ID. Available voices:');
  for (const v of voices || []) console.error(`  ${v.voice_id}  ${v.name}`);
  process.exit(1);
}

async function findAgent() {
  // Существующий агент могли создать вручную (другое имя) — env-ID имеет приоритет.
  const envId = process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (envId) {
    try {
      const agent = await el(`/v1/convai/agents/${envId}`);
      return { agent_id: envId, name: agent?.name };
    } catch (err) {
      console.error(`Agent din env (${envId}) inaccesibil, caut după nume:`, err.message.split('\n')[0]);
    }
  }
  const data = await el('/v1/convai/agents?page_size=100');
  return (data.agents || []).find(a => a.name === AGENT_NAME) ?? null;
}

const voiceId = DRY ? (process.env.ELEVENLABS_VOICE_ID || 'DRY_VOICE') : await resolveVoiceId();
const payload = buildAgentPayload({ baseUrl: BASE_URL, voiceApiKey: VOICE_API_KEY, voiceId });

if (DRY) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const existing = await findAgent();
let agentId;
if (existing) {
  agentId = existing.agent_id;
  await el(`/v1/convai/agents/${agentId}`, { method: 'PATCH', body: payload });
  console.log(`Updated agent ${agentId}`);
} else {
  const created = await el('/v1/convai/agents/create', { method: 'POST', body: payload });
  agentId = created.agent_id;
  console.log(`Created agent ${agentId}`);
}

if (WEBHOOK_SECRET) {
  // Post-call webhook. ВНИМАНИЕ: секрет генерирует сам ElevenLabs при создании webhook —
  // если API возвращает секрет, вывести его и положить в env ELEVENLABS_WEBHOOK_SECRET.
  // Привязка: workspace webhook + convai settings (post_call_webhook_id) — сверить форму
  // с актуальными docs (см. Task 9 в плане) и адаптировать при 4xx.
  try {
    const settings = await el('/v1/convai/settings');
    console.log('ConvAI settings:', JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Webhook binding needs manual verification:', err.message);
  }
}

if (process.argv.includes('--phone')) {
  const { ZADARMA_SIP_HOST, ZADARMA_SIP_USER, ZADARMA_SIP_PASSWORD, ZADARMA_PHONE_NUMBER } = process.env;
  if (!ZADARMA_SIP_HOST || !ZADARMA_SIP_USER || !ZADARMA_SIP_PASSWORD || !ZADARMA_PHONE_NUMBER) {
    console.error('Missing ZADARMA_* env vars for --phone');
    process.exit(1);
  }
  // Импорт номера через SIP-транк. Форму payload сверить с docs:
  // https://elevenlabs.io/docs/api-reference/phone-numbers (create phone number, provider: sip_trunk).
  const phone = await el('/v1/convai/phone-numbers', {
    method: 'POST',
    body: {
      provider: 'sip_trunk',
      phone_number: ZADARMA_PHONE_NUMBER,
      label: 'TRANSLUX Zadarma',
      inbound_trunk_config: {
        sip_uri: `sip:${ZADARMA_SIP_USER}@${ZADARMA_SIP_HOST}`,
        username: ZADARMA_SIP_USER,
        password: ZADARMA_SIP_PASSWORD,
        auth_username: ZADARMA_SIP_USER,
      },
      outbound_trunk_config: {
        address: ZADARMA_SIP_HOST,
        transport: 'tcp',
        credentials: { username: ZADARMA_SIP_USER, password: ZADARMA_SIP_PASSWORD },
      },
    },
  });
  console.log('Phone number imported:', JSON.stringify(phone, null, 2));
  // Привязать номер к агенту:
  await el(`/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    body: { phone_numbers: [phone.phone_number_id] },
  });
  console.log(`Phone ${ZADARMA_PHONE_NUMBER} → agent ${agentId}`);
}

console.log(`\nAgent ready: ${agentId}`);
console.log(`Add to env: NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agentId}`);
