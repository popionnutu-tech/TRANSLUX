import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData, userLabel } from '@/lib/zadachnik/auth';
import { createTask, listForAdmin, listForAssignee } from '@/lib/zadachnik/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const initData = (req: Request) => req.headers.get('x-telegram-init-data');

export async function GET(req: Request) {
  const u = await authFromInitData(initData(req));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (u.role === 'ADMIN') {
    const tasks = await listForAdmin();
    const ids = [...new Set(tasks.map((t) => t.assignee_id))];
    const { data: users } = ids.length
      ? await getSupabase().from('users').select('id, name, username, point, operator_kind').in('id', ids)
      : { data: [] as Array<{ id: string; name: string | null; username: string | null; point: string | null; operator_kind: string | null }> };
    const labelOf = (id: string) => {
      const x = (users ?? []).find((y) => y.id === id);
      return x ? userLabel(x) : '—';
    };
    return NextResponse.json({ role: 'ADMIN', tasks: tasks.map((t) => ({ ...t, assignee_label: labelOf(t.assignee_id) })) });
  }
  const bucket = new URL(req.url).searchParams.get('bucket') === 'history' ? 'history' : 'active';
  const tasks = await listForAssignee(u.id, bucket);
  // Progresul săptămânal al țintelor (doar pe ecranul activ — istoria nu-l afișează)
  let targets: Array<{ template_id: string; label: string; done: number; target: number }> = [];
  if (bucket === 'active') {
    const { data: templates } = await getSupabase()
      .from('recurring_task_templates')
      .select('id, title, description, period, week_days, target_per_week')
      .eq('assignee_id', u.id).eq('active', true);
    if (templates?.length) {
      const ids = templates.map((t) => t.id);
      const { data: weekObs } = await getSupabase()
        .from('obligations')
        .select('recurring_template_id, current_state')
        .in('recurring_template_id', ids)
        .gte('created_at', chisinauWeekStartISO());
      targets = templates.map((t) => ({
        template_id: t.id as string,
        label: (t.title as string | null) || String(t.description).slice(0, 30),
        done: (weekObs ?? []).filter((o) => o.recurring_template_id === t.id && o.current_state === 'resolved').length,
        // ținta: explicită, altfel dedusă din program (daily→7, mon_fri→5, custom→nr. zile)
        target: (t.target_per_week as number | null)
          ?? (t.period === 'daily' ? 7 : t.period === 'mon_fri' ? 5 : ((t.week_days as number[] | null)?.length ?? 0)),
      })).filter((t) => t.target > 0);
    }
  }
  return NextResponse.json({ role: 'CONTROLLER', tasks, targets });
}

/** Începutul săptămânii curente (luni 00:00 Europe/Chisinau) ca instant ISO. */
function chisinauWeekStartISO(): string {
  const tzNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Chisinau' }));
  const dow = (tzNow.getDay() + 6) % 7; // 0 = luni
  const monday = new Date(Date.UTC(tzNow.getFullYear(), tzNow.getMonth(), tzNow.getDate() - dow));
  const ymd = monday.toISOString().slice(0, 10);
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Chisinau', timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+3';
  const h = parseInt(tzName.replace('GMT', ''), 10) || 3;
  const sign = h < 0 ? '-' : '+';
  return `${ymd}T00:00:00${sign}${String(Math.abs(h)).padStart(2, '0')}:00`;
}

export async function POST(req: Request) {
  const u = await authFromInitData(initData(req));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.assignee_id || !body?.description?.trim() || !body?.deadline) {
    return NextResponse.json({ error: 'assignee_id, description, deadline obligatorii' }, { status: 400 });
  }
  // исполнитель — активный CONTROLLER или DIGITAL (FK проверяет лишь валидного user)
  const { data: assignee } = await getSupabase()
    .from('users').select('role').eq('id', body.assignee_id).eq('active', true).maybeSingle();
  if (!assignee || !['CONTROLLER', 'DIGITAL'].includes(assignee.role)) {
    return NextResponse.json({ error: 'executor invalid (controlor sau digital activ)' }, { status: 400 });
  }

  const points = Number.isFinite(+body.points) && +body.points >= 0 ? Math.round(+body.points) : 30;
  const ob = await createTask({
    creatorId: u.id,
    assigneeId: body.assignee_id,
    title: body.title?.trim() || null,
    description: String(body.description).trim(),
    points,
    deadline: new Date(body.deadline).toISOString(),
    category: body.category,
  });
  return NextResponse.json({ ok: true, id: ob.id }, { status: 201 });
}
