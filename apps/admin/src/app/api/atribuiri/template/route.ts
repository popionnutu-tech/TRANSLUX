import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { listTemplate, setTemplateCell, uzineCuSablon, uzinaOfRoute } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const uzina = new URL(req.url).searchParams.get('uzina');
  const uzine = (await uzineCuSablon()).filter((u) => canDirection(auth, u.id));
  if (!uzina) return NextResponse.json({ uzine });
  if (!canDirection(auth, uzina)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const grid = await listTemplate(uzina);
  return NextResponse.json({ uzine, grid });
}

export async function POST(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    factoryRouteId?: string; shiftNumber?: number; weekday?: number; vehicleId?: string | null;
  } | null;
  if (!body?.factoryRouteId || !body.shiftNumber || !body.weekday) {
    return NextResponse.json({ error: 'parametri lipsă' }, { status: 400 });
  }

  const uzina = await uzinaOfRoute(body.factoryRouteId);
  if (!uzina) return NextResponse.json({ error: 'rută inexistentă' }, { status: 404 });
  if (!canDirection(auth, uzina)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    await setTemplateCell(body.factoryRouteId, body.shiftNumber, body.weekday, body.vehicleId ?? null, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 });
  }
}
