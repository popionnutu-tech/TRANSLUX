import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { listZi, chisinauToday } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const date = DATE_RE.test(url.searchParams.get('date') ?? '') ? url.searchParams.get('date')! : chisinauToday();
  const dir = url.searchParams.get('dir');

  let directions = auth.directions; // null = toate
  if (dir) {
    if (!canDirection(auth, dir)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    directions = [dir];
  }

  try {
    const rows = await listZi(date, directions);
    return NextResponse.json({ date, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 });
  }
}
