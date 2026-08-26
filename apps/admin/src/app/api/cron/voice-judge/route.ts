// Ночной судья — GH Actions раз в сутки (01:07 UTC = 04:07 Кишинёв, после
// learner-а 00:30 и мимо тика controller-а :00/:30). Схема как voice-learner.
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { runVoiceJudge } from '@/lib/voice-judge';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const result = await runVoiceJudge();
    console.log('[voice-judge]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[voice-judge]', err);
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
