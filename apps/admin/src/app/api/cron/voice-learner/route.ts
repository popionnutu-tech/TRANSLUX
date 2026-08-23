// Ночной learner — GH Actions раз в сутки (03:30 Кишинёв). Схема как voice-controller.
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { runVoiceLearner } from '@/lib/voice-learner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const result = await runVoiceLearner();
    console.log('[voice-learner]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[voice-learner]', err);
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
