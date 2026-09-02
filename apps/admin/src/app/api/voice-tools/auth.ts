import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Cheia tool-urilor vocale.
 *
 * Se acceptă DOUĂ chei cât ține rotația: `VOICE_API_KEY` (cea nouă) și
 * `VOICE_API_KEY_PREV` (cea veche). Motivul e mecanic: cheia trăiește în două
 * locuri care nu se pot schimba în aceeași clipă — variabila de mediu de pe
 * Vercel și antetul fiecărui workspace tool din ElevenLabs (opt tool-uri, opt
 * PATCH-uri). Cu o singură cheie acceptată, între cele două momente TOATE
 * apelurile telefonice primesc 401: agentul rămâne fără orar, fără prețuri și
 * fără reclamații, în plină zi de lucru.
 *
 * `VOICE_API_KEY_PREV` se ȘTERGE imediat după ce tool-urile poartă cheia nouă.
 * Lăsată acolo, rotația nu s-a întâmplat: cheia veche merge mai departe.
 */
function cheiAcceptate(): string[] {
  return [process.env.VOICE_API_KEY, process.env.VOICE_API_KEY_PREV]
    .map((k) => (k ?? '').trim())
    .filter(Boolean);
}

// Comparație în timp constant, pe fiecare cheie acceptată. Lungimea diferită se
// tratează ca nepotrivire, fără să iasă din buclă mai devreme.
function potrivire(primit: string, asteptat: string): boolean {
  const a = Buffer.from(primit);
  const b = Buffer.from(asteptat);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function validateVoiceApiKey(req: NextRequest): NextResponse | null {
  const key = req.headers.get('x-voice-api-key');
  const acceptate = cheiAcceptate();
  if (acceptate.length === 0 || !key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Pe VALOARE, nu pe poziție: cu VOICE_API_KEY lipsă, lista are un singur
  // element — chiar cheia veche — iar un test pe index n-ar avertiza niciodată,
  // deși tot traficul ar merge pe ea.
  const prev = (process.env.VOICE_API_KEY_PREV ?? '').trim();
  let ok = false;
  let peCheiaVeche = false;
  for (const asteptat of acceptate) {
    if (potrivire(key, asteptat)) {
      ok = true;
      if (prev && asteptat === prev) peCheiaVeche = true;
    }
  }
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Răspunsul la «pot șterge VOICE_API_KEY_PREV?»: cât timp linia asta mai
  // apare în logurile Vercel, un tool încă poartă cheia veche — rotația nu s-a
  // terminat. Liniște câteva zile = se poate șterge.
  if (peCheiaVeche) console.warn('voice-tools auth: apel pe VOICE_API_KEY_PREV — rotația nu e încheiată');
  return null;
}
