import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { executeAntaPriceUpdate } from '@/lib/update-prices';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const result = await executeAntaPriceUpdate({ source: 'cron', sendTelegramNotification: true });

  return NextResponse.json(result, {
    status: result.status === 'error' ? 500 : 200,
  });
}
