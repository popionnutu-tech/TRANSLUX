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
  return NextResponse.json({ role: 'CONTROLLER', tasks: await listForAssignee(u.id, bucket) });
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
  });
  return NextResponse.json({ ok: true, id: ob.id }, { status: 201 });
}
