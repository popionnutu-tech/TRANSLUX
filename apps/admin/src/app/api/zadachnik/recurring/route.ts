import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData, userLabel } from '@/lib/zadachnik/auth';
import { createRecurringTemplate, listRecurring, maxPerWeekOf } from '@/lib/zadachnik/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const initData = (req: Request) => req.headers.get('x-telegram-init-data');

// Повторяющиеся задачи (шаблоны) — только ADMIN.
export async function GET(req: Request) {
  const u = await authFromInitData(initData(req));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const templates = await listRecurring();
  const ids = [...new Set(templates.map((t) => t.assignee_id))];
  const { data: users } = ids.length
    ? await getSupabase().from('users').select('id, name, username, point, operator_kind').in('id', ids)
    : { data: [] as Array<{ id: string; name: string | null; username: string | null; point: string | null; operator_kind: string | null }> };
  const labelOf = (id: string) => {
    const x = (users ?? []).find((y) => y.id === id);
    return x ? userLabel(x) : '—';
  };
  return NextResponse.json({ templates: templates.map((t) => ({ ...t, assignee_label: labelOf(t.assignee_id) })) });
}

export async function POST(req: Request) {
  const u = await authFromInitData(initData(req));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.assignee_id || !body?.description?.trim() || !['daily', 'mon_fri', 'custom'].includes(body?.period)) {
    return NextResponse.json({ error: 'assignee_id, description, period (daily|mon_fri|custom) obligatorii' }, { status: 400 });
  }
  let weekDays: number[] | null = null;
  if (body.period === 'custom') {
    weekDays = Array.isArray(body.week_days)
      ? [...new Set((body.week_days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      : [];
    if (weekDays.length === 0) return NextResponse.json({ error: 'alege cel puțin o zi a săptămânii' }, { status: 400 });
  }
  const { data: assignee } = await getSupabase()
    .from('users').select('role').eq('id', body.assignee_id).eq('active', true).maybeSingle();
  if (!assignee || !['CONTROLLER', 'DIGITAL'].includes(assignee.role)) {
    return NextResponse.json({ error: 'executor invalid (controlor sau digital activ)' }, { status: 400 });
  }

  const points = Number.isFinite(+body.points) && +body.points >= 0 ? Math.round(+body.points) : 30;
  const deadlineTime = /^\d{2}:\d{2}$/.test(String(body.deadline_time)) ? String(body.deadline_time) : '18:00';
  // Generatorul rulează de la 07:00 — un termen mai devreme ar face șablonul să nu genereze NICIODATĂ
  // (claim + skip zilnic, în tăcere). Comparație de string, validă pe HH:MM.
  if (deadlineTime < '08:00') {
    return NextResponse.json({ error: 'termenul zilnic trebuie să fie cel devreme 08:00 (generatorul rulează la 07:00)' }, { status: 400 });
  }
  const targetPerWeek = Number.isInteger(+body.target_per_week) && +body.target_per_week >= 1
    ? +body.target_per_week : null;
  // Progresul numără SARCINI închise — nu pot fi mai multe decât zilele în care șablonul rulează.
  // O țintă peste plafon ar bloca bara pe roșu pentru totdeauna (semnal fals despre executor).
  const maxPerWeek = maxPerWeekOf(body.period, weekDays);
  if (targetPerWeek !== null && targetPerWeek > maxPerWeek) {
    return NextResponse.json({ error: `ținta max ${maxPerWeek}/săpt — șablonul rulează ${maxPerWeek} zile pe săptămână (se numără sarcini închise, nu video)` }, { status: 400 });
  }
  const t = await createRecurringTemplate({
    creatorId: u.id,
    assigneeId: body.assignee_id,
    title: body.title?.trim() || null,
    description: String(body.description).trim(),
    points,
    period: body.period,
    deadlineTime,
    weekDays,
    category: body.category,
    targetPerWeek,
    goal: typeof body.goal === 'string' ? body.goal.trim().slice(0, 300) || null : null,
  });
  return NextResponse.json({ ok: true, id: t.id }, { status: 201 });
}
