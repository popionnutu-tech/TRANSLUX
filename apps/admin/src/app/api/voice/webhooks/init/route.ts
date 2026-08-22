// Conversation-initiation webhook: ElevenLabs întreabă ÎNAINTE de primul cuvânt
// ce salut să folosească — aici alegem salutul după ora din Chișinău.
// Schema portată din TLX (app/api/voice/webhooks/init): răspundem ÎNTOTDEAUNA 200 —
// orice alt cod resetează apelul; auth-ul decide doar date vs obiect gol.
// Bonus TLX: fereastra dintre init și salut (3-6s) încălzește lambda proxy-ului
// custom-llm — un POST neautentificat (401 rapid) e suficient să evalueze modulul.

import { NextResponse, after } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSupabase } from '@/lib/supabase';

// Rulează în dub1 (regiunea proiectului din vercel.json — lângă Supabase; per-route
// preferredRegion e IGNORAT când proiectul are «regions»). Hop-ul spre ElevenLabs (US)
// e acceptat conștient: ttfb măsurat 0.56s, bugetul e ~1s, ruta citește doar memoria limbii din voice_calls sub race 700ms.
const CUSTOM_LLM_URL = 'https://translux-voice-llm.vercel.app/api/chat/completions';

function greetingRo(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Chisinau',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  const salut = hour >= 5 && hour < 11 ? 'Bună dimineața' : hour >= 11 && hour < 18 ? 'Bună ziua' : 'Bună seara';
  return `${salut}! Ați sunat la TRANSLUX. Convorbirea este înregistrată. Cu ce vă pot ajuta?`;
}

function greetingRu(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Chisinau',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  const salut = hour >= 5 && hour < 11 ? 'Доброе утро' : hour >= 11 && hour < 18 ? 'Добрый день' : 'Добрый вечер';
  // Brandul FONETIC in rusa — TTS-ul citeste gresit literele latine (lectia TLX).
  return `${salut}! Вы позвонили в ТрансЛюкс. Разговор записывается. Чем могу помочь?`;
}

// Memoria limbii FARA tabela noua: transcriptul ultimului apel al numarului
// (voice_calls) — ponderea chirilicelor in replicile clientului. Race 700ms:
// la miss pierdem elegant spre RO (comportamentul de azi), nu tinem apelul.
async function lastCallLocale(phone: string): Promise<'ru' | null> {
  try {
    const { data } = await getSupabase()
      .from('voice_calls')
      .select('transcript')
      .eq('caller_phone', phone)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    const tr = (data?.transcript ?? []) as Array<{ role?: string; message?: string | null }>;
    const userText = tr
      .filter((t) => t?.role === 'user' && t.message)
      .map((t) => t.message)
      .join(' ');
    const cyr = (userText.match(/[а-яёА-ЯЁ]/g) ?? []).length;
    const lat = (userText.match(/[a-zA-ZăâîșțĂÂÎȘȚ]/g) ?? []).length;
    return cyr + lat >= 10 && cyr > lat ? 'ru' : null;
  } catch {
    return null;
  }
}

function authorized(req: Request): boolean {
  const key = req.headers.get('x-voice-api-key');
  const expected = process.env.VOICE_API_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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

    const body = await req.json().catch(() => ({}));
    const phone = String(body?.caller_id ?? '').trim();

    let locale: 'ro' | 'ru' = 'ro';
    if (phone) {
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      const hit = await Promise.race([
        lastCallLocale(phone),
        // 700ms ca la TLX: la o degradare DB fiecare apel ar plăti altfel 2s de
        // eter mort înainte de salut; la miss pierdem elegant spre RO.
        new Promise<null>((res) => { raceTimer = setTimeout(() => res(null), 700); }),
      ]);
      clearTimeout(raceTimer);
      if (hit === 'ru') locale = 'ru';
    }

    return NextResponse.json({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          language: locale,
          first_message: locale === 'ru' ? greetingRu() : greetingRo(),
        },
      },
    });
  } catch (err) {
    console.error('[voice/webhooks/init]', err);
    return NextResponse.json({}); // niciodată alt cod decât 200
  }
}
