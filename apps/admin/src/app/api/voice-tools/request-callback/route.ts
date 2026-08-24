import { NextRequest, NextResponse, after } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { createCallbackRequest, formatCallbackAlert } from '@/lib/voice/callbacks';
import { alertAdmins } from '@/lib/telegram-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  let body: any = {};
  try { body = await req.json(); } catch { /* body opțional */ }
  // Numărul apelantului vine din dynamic_variable system__caller_id al schemei tool-ului,
  // NU din ce scrie modelul: măsurat pe prod 24.08 — toate cele 3 cereri din
  // voice_callback_requests aveau caller_phone = null, deci nimeni nu putea suna înapoi.
  // `stated_phone` = numărul dictat de client, dacă vrea să fie sunat pe altul (are prioritate).
  // `phone` rămâne acceptat pentru compatibilitate cu versiunea veche a schemei.
  const input = {
    conversation_id: body.conversation_id ?? null,
    caller_phone: body.stated_phone || body.caller_phone || body.phone || null,
    reason: body.reason ?? null,
  };

  try {
    await createCallbackRequest(input);
  } catch (err) {
    console.error('request-callback failed:', err);
    // Tool-контракт: даже при ошибке БД агент получает мягкий текст, не 500.
    return NextResponse.json({
      result: 'Nu am putut înregistra cererea acum. Vă rugăm să sunați mai târziu.',
    });
  }

  // Telegram — ПОСЛЕ ответа агенту (не блокирует речь); ошибки не влияют на ответ.
  after(async () => {
    await alertAdmins(formatCallbackAlert(input, body.name ?? null));
  });

  return NextResponse.json({
    // Fără promisiuni de apel înapoi — nu există operatori care sună (decizia
    // lui Ion 24.08: «agentul nu promite... doar spune ca a colectat datele»).
    result: 'Am notat datele. Nu promite clientului că cineva îl sună înapoi.',
  });
}
