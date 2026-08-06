import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { executeAntaPriceUpdate, applyDueScheduledProposals } from '@/lib/update-prices';

export const dynamic = 'force-dynamic';
// Cu aplicarea automată, fetch-ul ANTA + aplicarea (RPC, nomenclator, notificări)
// rulează în aceeași invocare — lăsăm timp peste default-ul de 10s.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  // Plasă de siguranță: aplică întâi propunerile programate rămase scadente
  // (dacă cronul zilnic apply-scheduled-tariffs nu a rulat), abia apoi compară cu ANTA.
  const scheduled = await applyDueScheduledProposals();

  const result = await executeAntaPriceUpdate({ source: 'cron', sendTelegramNotification: true });

  return NextResponse.json({ ...result, scheduledApplied: scheduled.applied }, {
    status: result.status === 'error' ? 500 : 200,
  });
}
