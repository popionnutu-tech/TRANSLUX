import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData } from '@/lib/zadachnik/auth';
import { stopRecurring, CATEGORIES } from '@/lib/zadachnik/core';

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

// Corectarea categoriei / țintei săptămânale a unui șablon existent (ADMIN) —
// fără PATCH singura cale era «Stop» + recreare, care ar fi spawn-uit un dublu azi.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const patch: Record<string, unknown> = {};
  if (body.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(String(body.category))) {
      return NextResponse.json({ error: 'categorie necunoscută' }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (body.target_per_week !== undefined) {
    if (body.target_per_week === null || body.target_per_week === '') patch.target_per_week = null;
    else if (Number.isInteger(+body.target_per_week) && +body.target_per_week >= 1) patch.target_per_week = +body.target_per_week;
    else return NextResponse.json({ error: 'target_per_week: întreg ≥1 sau gol' }, { status: 400 });
    // Plafon = zilele de rulare ale șablonului (se numără sarcini închise/săpt, nu video).
    if (typeof patch.target_per_week === 'number') {
      const { data: tpl, error: tplErr } = await getSupabase().from('recurring_task_templates')
        .select('period, week_days').eq('id', id).maybeSingle();
      if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
      if (!tpl) return NextResponse.json({ error: 'not found' }, { status: 404 });
      const maxPerWeek = tpl.period === 'daily' ? 7 : tpl.period === 'mon_fri' ? 5 : ((tpl.week_days as number[] | null)?.length ?? 0);
      if (patch.target_per_week > maxPerWeek) {
        return NextResponse.json({ error: `ținta max ${maxPerWeek}/săpt — șablonul rulează ${maxPerWeek} zile pe săptămână` }, { status: 400 });
      }
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nimic de modificat' }, { status: 400 });

  const { data, error } = await getSupabase().from('recurring_task_templates')
    .update(patch).eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
