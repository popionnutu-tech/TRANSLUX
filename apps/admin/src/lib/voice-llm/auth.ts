// Custom LLM proxy — verificarea Bearer-ului de la ElevenLabs.
// Comparație timing-safe pe stringuri, fără node:crypto (compatibil Edge).
// Guard pe lungime ÎNAINTE de buclă: lungimi diferite => false, nu excepție.
// Portat din pipeline-ul TLX (validat în producție 21.08.2026).

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Authorization: Bearer <secret> pe custom LLM proxy. */
export function checkLlmBearer(authorization: string | null): boolean {
  const secret = process.env.VOICE_LLM_SECRET;
  if (!secret || !authorization) return false;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqualStr(m[1], secret);
}
