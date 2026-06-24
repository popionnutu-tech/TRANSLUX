import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData } from '@/lib/zadachnik/auth';
import {
  getObligation, acceptTask, startTask, submitReport,
  approveTask, rejectTask, reworkTask, cancelTask,
} from '@/lib/zadachnik/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const initData = (req: Request) => req.headers.get('x-telegram-init-data');

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await authFromInitData(initData(req));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const ob = await getObligation(id);
  if (!ob) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (u.role !== 'ADMIN' && ob.assignee_id !== u.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data: attempts } = await getSupabase()
    .from('obligation_attempts').select('*').eq('obligation_id', id).order('number', { ascending: true });
  return NextResponse.json({ task: ob, attempts: attempts ?? [], me: { id: u.id, role: u.role } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await authFromInitData(initData(req));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const ob = await getObligation(id);
  if (!ob) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || '');
  const isAdmin = u.role === 'ADMIN';
  const isAssignee = ob.assignee_id === u.id;
  const comment = (body.comment as string | undefined)?.trim() || null;
  const deny = () => NextResponse.json({ error: 'forbidden' }, { status: 403 });

  switch (action) {
    case 'accept': {
      if (!isAssignee) return deny();
      const est = (body.estimated_date as string | undefined)?.trim() || null;
      await acceptTask(ob, u.id, est); break;
    }
    case 'start':
      if (!isAssignee) return deny();
      await startTask(ob, u.id); break;
    case 'submit_report': {
      if (!isAssignee) return deny();
      const text = (body.report_text as string | undefined)?.trim();
      if (!text) return NextResponse.json({ error: 'report_text obligatoriu' }, { status: 400 });
      await submitReport(ob, u.id, text); break;
    }
    case 'approve':
      if (!isAdmin) return deny();
      await approveTask(ob, u.id, comment); break;
    case 'reject':
      if (!isAdmin) return deny();
      await rejectTask(ob, u.id, comment); break;
    case 'rework': {
      if (!isAdmin) return deny();
      const ok = await reworkTask(ob, u.id, comment);
      if (!ok) return NextResponse.json({ error: 'refacere indisponibilă' }, { status: 409 });
      break;
    }
    case 'cancel':
      if (!isAdmin) return deny();
      await cancelTask(ob, u.id); break;
    default:
      return NextResponse.json({ error: 'acțiune necunoscută' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
