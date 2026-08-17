import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { adaugaDubla, stergeDubla, uzinaOfRoute } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Curse duble: «+» adaugă slotul următor pe rută×schimb, «−» îl șterge de azi înainte.

export async function POST(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    factoryRouteId?: string; shiftNumber?: number; actiune?: 'adauga' | 'sterge'; slot?: number;
  } | null;
  if (!body?.factoryRouteId || !body.shiftNumber || !['adauga', 'sterge'].includes(body.actiune ?? '')) {
    return NextResponse.json({ error: 'parametri lipsă' }, { status: 400 });
  }
  if (body.actiune === 'sterge' && (!Number.isInteger(body.slot) || (body.slot as number) < 2)) {
    return NextResponse.json({ error: 'slot invalid' }, { status: 400 });
  }

  const direction = await uzinaOfRoute(body.factoryRouteId);
  if (!direction) return NextResponse.json({ error: 'rută inexistentă' }, { status: 404 });
  if (!canDirection(auth, direction)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    if (body.actiune === 'adauga') {
      const res = await adaugaDubla(body.factoryRouteId, body.shiftNumber, auth.user.id);
      return NextResponse.json(res);
    }
    await stergeDubla(body.factoryRouteId, body.shiftNumber, body.slot as number);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 });
  }
}
