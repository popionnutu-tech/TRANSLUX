// Импорт номера Moldcell в ElevenLabs как SIP trunk (inbound, matching по номеру).
// Схема: Moldcell VPBX (operator2) ↔ Zadarma внешняя линия → ext → forward на
// +номер@sip.rtc.elevenlabs.io — как в TLX (zadarma.com/en/support/instructions/elevenlabs/).
// Запуск: node scripts/voice-agent/import-phone.mjs [--import]
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const KEY = env.ELEVENLABS_API_KEY;
const AGENT_ID = env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
const PHONE = '+37360401010';

async function el(path, init = {}) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    signal: AbortSignal.timeout(15000),
    ...init,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', ...init.headers },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const list = await el('/v1/convai/phone-numbers');
for (const p of list || []) {
  console.log(`${p.phone_number}  ${p.phone_number_id}  agent:${p.assigned_agent?.agent_id || 'none'}  ${p.label}`);
}

const existing = (list || []).find((p) => p.phone_number === PHONE);
if (existing) {
  console.log(`\n${PHONE} deja importat: ${existing.phone_number_id}`);
} else if (process.argv.includes('--import')) {
  const phone = await el('/v1/convai/phone-numbers', {
    method: 'POST',
    body: {
      provider: 'sip_trunk',
      phone_number: PHONE,
      label: 'TRANSLUX Moldcell',
      agent_id: AGENT_ID,
      inbound_trunk_config: { media_encryption: 'disabled' },
    },
  });
  console.log(`\nImportat: ${phone.phone_number_id} → agent ${AGENT_ID}`);
} else {
  console.log(`\n${PHONE} lipsește. Rulează cu --import ca să-l creezi (agent țintă: ${AGENT_ID}).`);
}
