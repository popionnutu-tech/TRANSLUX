import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { atribuieMulti, uzinaOfRoute, type AtribuieMultiParams } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as Partial<AtribuieMultiParams> | null;
  if (!body?.factoryRouteId || !body.shiftNumber || !Array.isArray(body.dates) || !body.dates.length
      || body.dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))
      || !(body.vehicleId !== undefined || body.driverId != null)) {
    return NextResponse.json({ error: 'parametri lipsă' }, { status: 400 });
  }
  if (body.slot !== undefined && (!Number.isInteger(body.slot) || body.slot < 1)) {
    return NextResponse.json({ error: 'slot invalid' }, { status: 400 });
  }
  // returul: uuid sau null — altfel FK-ul ar întoarce 500 în loc de 400
  const uuidSauNull = (v: unknown) => v === null || (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v));
  if (body.returVehicleId !== undefined && !uuidSauNull(body.returVehicleId)) {
    return NextResponse.json({ error: 'mașină de retur invalidă' }, { status: 400 });
  }
  if (body.returDriverId !== undefined && !uuidSauNull(body.returDriverId)) {
    return NextResponse.json({ error: 'șofer de retur invalid' }, { status: 400 });
  }
  // respingere ieftină înainte de materializare — limita reală (±31 zile) e verificată în core
  if (body.dates.length > 7) return NextResponse.json({ error: 'prea multe zile' }, { status: 400 });

  const direction = await uzinaOfRoute(body.factoryRouteId);
  if (!direction) return NextResponse.json({ error: 'rută inexistentă' }, { status: 404 });
  if (!canDirection(auth, direction)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const res = await atribuieMulti(body as AtribuieMultiParams, auth.user.id);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 });
  }
}
