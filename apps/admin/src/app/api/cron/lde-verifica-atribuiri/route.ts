import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { verificaZi } from '@/lib/atribuiri/verify';
import { syncWriteThrough, chisinauToday } from '@/lib/atribuiri/core';

// Verificarea «a doua zi» a atribuirilor + sincronizarea write-through amânat.
// Trigger: crontab pe VPS-ul worker-ului GPS (06:30, după rulajul nocturn 03:00):
//   30 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://central-hub-md.vercel.app/api/cron/lde-verifica-atribuiri
// Backtest: ?date=YYYY-MM-DD&dry=1 (nu scrie, nu trimite push-uri).
// (Sloturile de cron Vercel sunt 2/2 ocupate — de-asta VPS.)

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function chisinauYesterday(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  now.setDate(now.getDate() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const date = DATE_RE.test(url.searchParams.get('date') ?? '') ? url.searchParams.get('date')! : chisinauYesterday();
  const dry = url.searchParams.get('dry') === '1';

  try {
    // 1) editările proactive de ieri-seară pentru AZI intră în graficul dispecerului
    const synced = dry ? 0 : await syncWriteThrough(chisinauToday());
    // 2) verdictul GPS pe ziua de ieri + push-uri
    const summary = await verificaZi(date, dry);
    return NextResponse.json({ status: 'ok', write_through_synced: synced, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('lde-verifica-atribuiri error:', message);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
