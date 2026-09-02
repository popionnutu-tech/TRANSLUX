// Conversation-initiation webhook: ElevenLabs întreabă ÎNAINTE de primul cuvânt
// ce salut să folosească — aici alegem salutul după ora din Chișinău.
// Schema portată din TLX (app/api/voice/webhooks/init): răspundem ÎNTOTDEAUNA 200 —
// orice alt cod resetează apelul; auth-ul decide doar date vs obiect gol.
// Bonus TLX: fereastra dintre init și salut (3-6s) încălzește lambda proxy-ului
// custom-llm — un POST neautentificat (401 rapid) e suficient să evalueze modulul.

import { NextResponse, after } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { greetingRo } from '@/lib/voice-greeting';

// Rulează în dub1 (regiunea proiectului din vercel.json — lângă Supabase; per-route
// preferredRegion e IGNORAT când proiectul are «regions»). Hop-ul spre ElevenLabs (US)
// e acceptat conștient: ttfb măsurat 0.56s la buget ~1s; ruta citește doar
// memoria limbii din voice_calls, sub race 700ms.
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api/chat/completions';

// Aceleași DOUĂ chei ca la voice-tools cât ține rotația (VOICE_API_KEY +
// VOICE_API_KEY_PREV): antetul webhook-ului îl scrie controlerul din mediul lui,
// deci se schimbă la alt moment decât variabila citită aici. Cu o singură cheie,
// între cele două momente salutul ar cădea pe varianta de avarie.
function authorized(req: Request): boolean {
  const key = req.headers.get('x-voice-api-key');
  if (!key) return false;
  const a = Buffer.from(key);
  return [process.env.VOICE_API_KEY, process.env.VOICE_API_KEY_PREV]
    .map((k) => (k ?? '').trim())
    .filter(Boolean)
    .some((asteptat) => {
      const b = Buffer.from(asteptat);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

export async function POST(req: Request) {
  try {
    if (!authorized(req)) {
      // Fără log salutul ar cădea TĂCUT pe cel static la o rotație de cheie.
      console.warn('[voice/webhooks/init] auth failed — salut static de rezervă');
      return NextResponse.json({}); // auth picat => 200 gol, NU 401
    }

    // Prewarm fire-and-forget DUPĂ auth — altfel POST-uri anonime pe webhook-ul
    // public ar converti trafic străin în invocări reci plătite (amplificare 1:1).
    after(async () => {
      try {
        const r = await fetch(CUSTOM_LLM_URL, { method: 'POST', signal: AbortSignal.timeout(3000) });
        await r.body?.cancel(); // socket-ul nu rămâne nedrenat pe instanța caldă
      } catch {
        /* prewarm best-effort */
      }
    });

    // NU mai trimitem `language`. De când agenții RO și RU sunt separați, limba
    // e proprietatea agentului, iar override-ul o rupea: pe apelul
    // conv_4601m0t56hq5fyd8pvkgabze19y7 memoria a pornit agentul ROMÂNESC în
    // rusă, ASR-ul a trecut pe rusă, vorbirea românească a ieșit în chirilice
    // („салтари" = „Bună seara"), iar modelul, primind text ilizibil, a
    // răspuns în POLONEZĂ și UCRAINEANĂ. Un vorbitor de rusă ajunge acum la
    // agentul rusesc prin transfer_to_agent — cu o tură, nu cu o limbă ruptă.
    //
    // Rămâne DOAR salutul, în limba agentului care chiar preia apelul, ales
    // după ora Chișinăului. first_message nu atinge ASR-ul, deci nu poate
    // reproduce incidentul de mai sus.
    return NextResponse.json({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          first_message: greetingRo(),
        },
      },
    });
  } catch (err) {
    console.error('[voice/webhooks/init]', err);
    return NextResponse.json({}); // niciodată alt cod decât 200
  }
}
