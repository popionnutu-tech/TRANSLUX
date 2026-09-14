import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { sendWeeklyDriverPenalties } from '@/lib/driver-penalties-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Imaginea săptămânală cu penalitățile de aspect (Ion, 14.09.2026).
 *
 * Nu are program propriu în vercel.json — planul Hobby permite două cronuri și
 * ambele sunt luate; luni o pornește cronul zilnic copy-assignments. Ruta există
 * pentru trimiterea de mână: `?week=2026-09-07` alege săptămâna (luni),
 * `?force=1` retrimite o săptămână deja plecată (imaginea veche se șterge).
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const week = req.nextUrl.searchParams.get('week');
  if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ status: 'error', error: 'week trebuie YYYY-MM-DD (luni)' }, { status: 400 });
  }
  const force = req.nextUrl.searchParams.get('force') === '1';
  try {
    const result = await sendWeeklyDriverPenalties({ weekStart: week ?? undefined, force });
    return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('driver-penalties cron error:', message);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
