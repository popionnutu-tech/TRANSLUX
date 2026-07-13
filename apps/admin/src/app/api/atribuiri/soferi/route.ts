import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri } from '@/lib/atribuiri/auth';
import { soferiForPicker } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dir = new URL(req.url).searchParams.get('dir') ?? '';
  const soferi = await soferiForPicker(dir);
  return NextResponse.json({ soferi });
}
