import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { ruleazaImpacarea } from '@/lib/bilete/impacare';

// ION-196 (pasul 5 din ION-190): împăcarea comenzilor de bilete cu banca. Cron pe VPS root@217.26.149.23:
//   */10 * * * * . /root/lde-worker/cron-secret.env && curl -fsS --max-time 60 -H "Authorization: Bearer $CRON_SECRET" \
//     https://central-hub-md.vercel.app/api/cron/bilete-impacare >> /root/lde-worker/bilete-impacare.log 2>&1
// (Vercel Hobby are doar 2 cron-uri, ambele ocupate.) ?dry=1 doar numără, nu scrie nimic.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const raport = await ruleazaImpacarea({ dry, bugetMs: 20_000 });
    return NextResponse.json({ ok: true, ...raport });
  } catch (e) {
    console.error('[cron/bilete-impacare]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
