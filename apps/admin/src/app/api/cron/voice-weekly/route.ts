// Statistica săptămânală a agentului vocal — GH Actions, zilnic la 05:20 UTC
// (08:20 Chișinău), după judecătorul de noapte (01:07 UTC).
//
// Zilnic, nu lunea: paza e pe cheia săptămânii raportate, deci mesajul pleacă o
// singură dată, iar o cădere de luni (Telegram, deploy, GH Actions) se repară de
// la sine marți. Schema — ca voice-judge și voice-learner.
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { ruleazaStatisticaSaptamanala } from '@/lib/voice-weekly';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    const result = await ruleazaStatisticaSaptamanala();
    console.log('[voice-weekly]', JSON.stringify(result));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[voice-weekly]', err);
    return NextResponse.json({ ok: false, error: String(err) });
  }
}
