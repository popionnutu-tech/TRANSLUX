import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { precalcEtaCache } from '@/lib/site-assistant/eta-precalc';

// ION-206: precalculul orei estimate de pe harta «Acum» (ritmul rutelor + trecerile pe opriri) în
// site_eta_cache (migr. 490), ca /api/asistent-site/acum să nu mai calculeze 14 zile de GPS la cerere
// pe instanța rece. Cron pe VPS root@217.26.149.23, DUPĂ lanțul nopții (run-nightly.sh, 03:00–~03:20):
//   45 3 * * * . /root/lde-worker/cron-secret.env && curl -fsS --max-time 90 -H "Authorization: Bearer $CRON_SECRET" \
//     https://central-hub-md.vercel.app/api/cron/site-eta-cache >> /root/lde-worker/site-eta-cache.log 2>&1
// (Vercel Hobby are doar 2 cron-uri, ambele ocupate.) ?dry=1 calculează, dar nu scrie.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const raport = await precalcEtaCache({ dry, bugetMs: 50_000 });
    if (raport.sarite.length) console.warn('[cron/site-eta-cache] bugetul s-a terminat, rute sărite:', raport.sarite.join(','));
    return NextResponse.json({ ok: true, ...raport });
  } catch (e) {
    console.error('[cron/site-eta-cache]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, eroare: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
