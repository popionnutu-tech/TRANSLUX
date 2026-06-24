import { NextResponse } from 'next/server';
import { authFromInitData } from '@/lib/zadachnik/auth';
import { stopRecurring } from '@/lib/zadachnik/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Остановить повторение (active=false). Только ADMIN. Уже созданные задачи живут дальше.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  await stopRecurring(id);
  return NextResponse.json({ ok: true });
}
