// Контролёр голосового агента — прогоняется GitHub Actions каждые 30 минут
// (Vercel Hobby не умеет суб-дневные кроны — та же схема, что bot-watchdog).
// Лечит конфиг молча, расхождения пишет в voice_controller_incidents. Без алертов
// (распоряжение Иона 23.08).
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { runVoiceController } from '@/lib/voice-controller';
import { redactSecrets } from '@/lib/voice/el';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const result = await runVoiceController();
    if (result.drifts.length || result.incidents) {
      console.warn('[voice-controller]', JSON.stringify(result));
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Redactat: workflow-ul face `cat` pe acest JSON, iar repo-ul e PUBLIC — un corp
    // de eroare de la ElevenLabs poate purta ecoul cheii trimise în PATCH.
    const safe = redactSecrets(String(err));
    console.error('[voice-controller]', safe);
    // 200: prăbușirea controlorului nu e o urgență pentru GitHub Actions;
    // eșecul rămâne vizibil în Vercel logs.
    return NextResponse.json({ ok: false, error: safe });
  }
}
