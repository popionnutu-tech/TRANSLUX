import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData } from '@/lib/zadachnik/auth';
import { stopRecurring, CATEGORIES, maxPerWeekOf } from '@/lib/zadachnik/core';

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

// Redactarea unui șablon existent (ADMIN) — titlu, descriere, puncte, oră, program,
// categorie, țintă. Fără PATCH singura cale era «Stop» + recreare (dublu spawn azi).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const { data: tpl, error: tplErr } = await getSupabase().from('recurring_task_templates')
    .select('period, week_days, target_per_week').eq('id', id).maybeSingle();
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!tpl) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) patch.title = String(body.title ?? '').trim() || null;
  if (body.description !== undefined) {
    const d = String(body.description ?? '').trim();
    if (!d) return NextResponse.json({ error: 'descrierea nu poate fi goală' }, { status: 400 });
    patch.description = d;
  }
  if (body.points !== undefined) {
    if (!Number.isFinite(+body.points) || +body.points < 0) return NextResponse.json({ error: 'puncte: număr ≥0' }, { status: 400 });
    patch.points = Math.round(+body.points);
  }
  if (body.deadline_time !== undefined) {
    const dt = String(body.deadline_time);
    if (!/^\d{2}:\d{2}$/.test(dt)) return NextResponse.json({ error: 'oră invalidă (HH:MM)' }, { status: 400 });
    // Generatorul rulează de la 07:00 — un termen mai devreme n-ar genera niciodată.
    if (dt < '08:00') return NextResponse.json({ error: 'termenul zilnic trebuie să fie cel devreme 08:00' }, { status: 400 });
    patch.deadline_time = dt;
  }
  if (body.period !== undefined) {
    if (!['daily', 'mon_fri', 'custom'].includes(String(body.period))) {
      return NextResponse.json({ error: 'period: daily|mon_fri|custom' }, { status: 400 });
    }
    patch.period = body.period;
  }
  if (body.week_days !== undefined) {
    patch.week_days = Array.isArray(body.week_days)
      ? [...new Set((body.week_days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      : null;
  }
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
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nimic de modificat' }, { status: 400 });

  // Validări pe starea EFECTIVĂ (patch peste existent): program custom fără zile — invalid;
  // plafonul țintei = zilele de rulare (se numără sarcini închise/săpt, nu video).
  const effPeriod = (patch.period ?? tpl.period) as string;
  const effWeekDays = (patch.week_days !== undefined ? patch.week_days : tpl.week_days) as number[] | null;
  if (effPeriod === 'custom' && (!effWeekDays || effWeekDays.length === 0)) {
    return NextResponse.json({ error: 'alege cel puțin o zi a săptămânii' }, { status: 400 });
  }
  if (effPeriod !== 'custom') patch.week_days = null;
  const effTarget = (patch.target_per_week !== undefined ? patch.target_per_week : tpl.target_per_week) as number | null;
  const maxPerWeek = maxPerWeekOf(effPeriod as 'daily' | 'mon_fri' | 'custom', effWeekDays);
  if (typeof effTarget === 'number' && effTarget > maxPerWeek) {
    return NextResponse.json({ error: `ținta max ${maxPerWeek}/săpt — șablonul rulează ${maxPerWeek} zile pe săptămână` }, { status: 400 });
  }

  const { data, error } = await getSupabase().from('recurring_task_templates')
    .update(patch).eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
