import { NextRequest, NextResponse, after } from 'next/server';
import { verifyElevenLabsSignature } from '@/lib/voice/webhook-verify';
import { extractCall, saveVoiceCall, hasCallbackRequest, formatCallReport } from '@/lib/voice/calls';
import { alertAdmins } from '@/lib/telegram-notify';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ELEVENLABS_WEBHOOK_SECRET missing' }, { status: 500 });
  }

  // Raw body ДО JSON.parse — иначе HMAC не сойдётся.
  const rawBody = await req.text();
  const sig = req.headers.get('elevenlabs-signature');
  if (!verifyElevenLabsSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload?.type !== 'post_call_transcription') {
    return NextResponse.json({ ignored: payload?.type ?? 'unknown' });
  }

  const row = extractCall(payload);
  if (!row.conversation_id) {
    return NextResponse.json({ error: 'No conversation_id' }, { status: 400 });
  }

  const outcome = await saveVoiceCall(row, payload);
  if (outcome === 'inserted') {
    // ВАЖНО: уведомление — ПОСЛЕ ответа 200 и в try/catch. Если оно упадёт после
    // сохранения звонка, роут НЕ должен вернуть 500: ретрай ElevenLabs увидит
    // duplicate и отчёт не уйдёт уже никогда.
    after(async () => {
      try {
        const callbackAlerted = await hasCallbackRequest(row.conversation_id);
        if (callbackAlerted) {
          // Держим voice_calls.callback_requested в синхроне с voice_callback_requests.
          await getSupabase().from('voice_calls')
            .update({ callback_requested: true })
            .eq('conversation_id', row.conversation_id);
        }
        await alertAdmins(formatCallReport(row, callbackAlerted));
      } catch (err) {
        console.error('voice-webhook notify failed:', err);
      }
    });
  }
  return NextResponse.json({ outcome });
}
