import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { setFoaie, directionOfRow } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { rowId?: string; receiptNr?: string } | null;
  if (!body?.rowId || typeof body.receiptNr !== 'string') {
    return NextResponse.json({ error: 'parametri lipsă' }, { status: 400 });
  }

  const direction = await directionOfRow(body.rowId);
  if (!direction) return NextResponse.json({ error: 'rând inexistent' }, { status: 404 });
  if (!canDirection(auth, direction)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const res = await setFoaie(body.rowId, body.receiptNr);
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ foaie: res.foaie ?? null });
}
