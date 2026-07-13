import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { atribuieSofer, directionOfRow } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { rowId?: string; driverId?: string | null } | null;
  if (!body?.rowId) return NextResponse.json({ error: 'rowId lipsă' }, { status: 400 });

  const direction = await directionOfRow(body.rowId);
  if (!direction) return NextResponse.json({ error: 'rând inexistent' }, { status: 404 });
  if (!canDirection(auth, direction)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const row = await atribuieSofer(body.rowId, body.driverId ?? null, auth.user.id);
    return NextResponse.json({ row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 });
  }
}
