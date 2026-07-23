import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { applyDueScheduledProposals } from '@/lib/update-prices';

export const dynamic = 'force-dynamic';

// Aplică tarifele confirmate care intră în vigoare azi (apply_on ≤ azi, Chișinău).
// Apelat zilnic, după miezul nopții Chișinău, din GitHub Actions
// (.github/workflows/apply-scheduled-tariffs.yml) — Vercel Hobby are deja
// ambele sloturi de cron ocupate. Idempotent: fără propuneri scadente, nu scrie nimic.
export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const result = await applyDueScheduledProposals();

  return NextResponse.json(result, {
    status: result.errors.length > 0 ? 500 : 200,
  });
}
