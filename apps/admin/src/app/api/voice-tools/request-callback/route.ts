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
  const input = {
    conversation_id: body.conversation_id ?? null,
    caller_phone: body.phone ?? null,
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
    result: 'Am înregistrat cererea dumneavoastră. Un coleg vă va suna înapoi cât de curând.',
  });
}
