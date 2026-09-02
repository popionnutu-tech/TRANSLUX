// Клиент API ElevenLabs — общий для voice-controller / voice-judge / voice-exams.
// Вынесен из voice-controller.ts 26.08 (третий потребитель). Поведение то же.
// AGENT_ID — RO-агент (номер на нём, 8/10 звонков). RU-агент (RU_AGENT_ID) живёт
// только в дашборде и полным каноном НЕ управляется; контролёр лечит в нём ТОЧЕЧНО
// одну станцию (Critical 28.08: RU-промпт слал клиентов на Северный автовокзал).

export const AGENT_ID = 'agent_3301kn4qwa6jep38d4b63m6s6pkh';
export const RU_AGENT_ID = 'agent_9101m0t3ej97ekttf2matgf203p9';
export const EL = 'https://api.elevenlabs.io';

export const elHeaders = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' });

// Corpul unei erori de la EL poate purta ecoul cererii, iar cererea poartă chei:
// PATCH-ul de platform_settings trimite `x-voice-api-key`. Textul ajunge în jurnal
// (jsonb) ȘI în logul GitHub Actions — repo-ul e PUBLIC. De aceea redactarea stă
// AICI, în punctul unde se aruncă eroarea: cine prinde `catch` mai sus primește deja
// text curat și nu trebuie să-și amintească de asta (security review 31.08).
//
// Trei treceri, fiindcă fiecare singură se ocolește: (1) după numele câmpului, orice
// ar fi valoarea — inclusiv «Bearer tok» cu spațiu și valoarea neterminată dintr-un
// ecou trunchiat; (2) cheia rostită dosloven oriunde; (3) prefixele ei, pentru ecoul
// tăiat la mijlocul cheii, unde potrivirea exactă nu mai are ce prinde.
export function redactSecrets(s: string): string {
  let out = s.replace(
    /("?(?:x-voice-api-key|xi-api-key|authorization)"?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|"[^"\n]*|[^",}\s]*)/gi,
    '$1***',
  );
  // Și cheia VECHE, cât ține rotația: jurnalul jsonb și logul GitHub Actions
  // sunt persistente, iar repo-ul e public.
  for (const key of [process.env.VOICE_API_KEY, process.env.VOICE_API_KEY_PREV, process.env.ELEVENLABS_API_KEY, process.env.CRON_SECRET]) {
    if (!key || key.length < 8) continue;
    for (let n = key.length; n >= 8; n--) out = out.split(key.slice(0, n)).join('***');
  }
  return out;
}

export async function elGet(path: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
  const r = await fetch(`${EL}${path}`, { headers: elHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`EL GET ${path}: ${r.status}`);
  return r.json();
}

export async function elPost(path: string, body: unknown, timeoutMs = 15000): Promise<Record<string, unknown>> {
  const r = await fetch(`${EL}${path}`, {
    method: 'POST', headers: elHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(redactSecrets(`EL POST ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`));
  return r.json();
}

export async function elPatchAgent(body: unknown, agentId: string = AGENT_ID): Promise<void> {
  const r = await fetch(`${EL}/v1/convai/agents/${agentId}`, {
    method: 'PATCH', headers: elHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  // Redactare ÎNAINTE de orice tăiere: o felie luată întâi ar putea lăsa cheia afară.
  if (!r.ok) throw new Error(redactSecrets(`EL PATCH agent: ${r.status} ${await r.text()}`));
}
