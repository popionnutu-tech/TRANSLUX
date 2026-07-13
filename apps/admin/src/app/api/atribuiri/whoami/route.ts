import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri } from '@/lib/atribuiri/auth';
import { allDirections } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const all = await allDirections();
  const directions = auth.directions === null ? all : all.filter((d) => auth.directions!.includes(d.id));
  return NextResponse.json({ role: auth.user.role, name: auth.user.name, directions });
}
