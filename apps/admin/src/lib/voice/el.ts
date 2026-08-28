// Клиент API ElevenLabs — общий для voice-controller / voice-judge / voice-exams.
// Вынесен из voice-controller.ts 26.08 (третий потребитель). Поведение то же.
// AGENT_ID — RO-агент (номер на нём, 8/10 звонков). RU-агент (RU_AGENT_ID) живёт
// только в дашборде и полным каноном НЕ управляется; контролёр лечит в нём ТОЧЕЧНО
// одну станцию (Critical 28.08: RU-промпт слал клиентов на Северный автовокзал).

export const AGENT_ID = 'agent_3301kn4qwa6jep38d4b63m6s6pkh';
export const RU_AGENT_ID = 'agent_9101m0t3ej97ekttf2matgf203p9';
export const EL = 'https://api.elevenlabs.io';

export const elHeaders = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' });

export async function elGet(path: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
  const r = await fetch(`${EL}${path}`, { headers: elHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`EL GET ${path}: ${r.status}`);
  return r.json();
}

export async function elPost(path: string, body: unknown, timeoutMs = 15000): Promise<Record<string, unknown>> {
  const r = await fetch(`${EL}${path}`, {
    method: 'POST', headers: elHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`EL POST ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export async function elPatchAgent(body: unknown, agentId: string = AGENT_ID): Promise<void> {
  const r = await fetch(`${EL}/v1/convai/agents/${agentId}`, {
    method: 'PATCH', headers: elHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`EL PATCH agent: ${r.status} ${await r.text()}`);
}
