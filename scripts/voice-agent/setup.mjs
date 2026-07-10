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

// Post-call webhook: creare workspace webhook (dacă lipsește) + legare în convai/settings.
// Secretul HMAC îl generează ElevenLabs la creare — scriptul îl printează O SINGURĂ dată:
// pune-l în Vercel (apps/admin) ca ELEVENLABS_WEBHOOK_SECRET și fă redeploy.
const WEBHOOK_NAME = 'TRANSLUX post-call';
const WEBHOOK_URL = `${BASE_URL}/api/voice-webhook`;
try {
  const { webhooks } = await el('/v1/workspace/webhooks');
  let hook = (webhooks || []).find(w => w.webhook_url === WEBHOOK_URL || w.name === WEBHOOK_NAME);
  if (!hook) {
    hook = await el('/v1/workspace/webhooks', {
      method: 'POST',
      body: { settings: { name: WEBHOOK_NAME, webhook_url: WEBHOOK_URL, auth_type: 'hmac' } },
    });
    console.log('Webhook created:', JSON.stringify(hook, null, 2));
    if (hook?.webhook_secret || hook?.secret) {
      console.log(`\n!!! Pune în Vercel env (apps/admin): ELEVENLABS_WEBHOOK_SECRET=${hook.webhook_secret || hook.secret}\n`);
    }
  } else {
    console.log(`Webhook există: ${hook.webhook_id || hook.id} → ${hook.webhook_url}`);
  }
  const hookId = hook.webhook_id || hook.id;
  const settings = await el('/v1/convai/settings');
  if (settings?.webhooks?.post_call_webhook_id !== hookId) {
    await el('/v1/convai/settings', {
      method: 'PATCH',
      body: { webhooks: { ...settings.webhooks, post_call_webhook_id: hookId } },
    });
    console.log(`post_call_webhook_id → ${hookId}`);
  } else {
    console.log('post_call_webhook_id deja legat.');
  }
} catch (err) {
  console.error('Webhook binding failed (se poate lega manual din dashboard):', err.message);
}

if (process.argv.includes('--phone')) {
  const { ZADARMA_SIP_HOST, ZADARMA_SIP_USER, ZADARMA_SIP_PASSWORD, ZADARMA_PHONE_NUMBER } = process.env;
  if (!ZADARMA_SIP_HOST || !ZADARMA_SIP_USER || !ZADARMA_SIP_PASSWORD || !ZADARMA_PHONE_NUMBER) {
    console.error('Missing ZADARMA_* env vars for --phone');
    process.exit(1);
  }
  // Импорт номера через SIP-транк (schema: CreateSIPTrunkPhoneNumberRequestV2).
  // Inbound: без авторизации (Zadarma АТС шлёт INVITE на sip.rtc.elevenlabs.io, матчится по номеру).
  // Outbound: pbx.zadarma.com TCP + креденшалы ВНУТРЕННЕГО номера АТС (578127-100), не главного SIP.
  // https://zadarma.com/en/support/instructions/elevenlabs/
  const existingPhones = await el('/v1/convai/phone-numbers');
  const existingPhone = (existingPhones || []).find(p => p.phone_number === ZADARMA_PHONE_NUMBER);
  if (existingPhone) {
    console.log(`Phone ${ZADARMA_PHONE_NUMBER} deja importat: ${existingPhone.phone_number_id} (agent: ${existingPhone.assigned_agent?.agent_id || 'none'})`);
  } else {
    const phone = await el('/v1/convai/phone-numbers', {
      method: 'POST',
      body: {
        provider: 'sip_trunk',
        phone_number: ZADARMA_PHONE_NUMBER,
        label: 'TRANSLUX Zadarma',
        agent_id: agentId,
        inbound_trunk_config: {
          media_encryption: 'disabled',
        },
        outbound_trunk_config: {
          address: ZADARMA_SIP_HOST,
          transport: 'tcp',
          media_encryption: 'disabled',
          credentials: { username: ZADARMA_SIP_USER, password: ZADARMA_SIP_PASSWORD },
        },
      },
    });
    console.log(`Phone number imported: ${phone.phone_number_id}`);
    console.log(`Phone ${ZADARMA_PHONE_NUMBER} → agent ${agentId}`);
  }
}

console.log(`\nAgent ready: ${agentId}`);
console.log(`Add to env: NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agentId}`);
