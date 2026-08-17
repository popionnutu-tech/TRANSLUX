import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData } from '@/lib/zadachnik/auth';
import {
  getObligation, submitReport,
  approveTask, rejectTask, reworkTask, cancelTask, reopenTask, markTaskDone, CATEGORIES,
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
    // 'accept' / 'start' au fost scoase din flux (Ion, 17.08.2026): executantul doar raportează.
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
    case 'reopen': {
      if (!isAdmin) return deny();
      const ok = await reopenTask(ob, u.id);
      if (!ok) return NextResponse.json({ error: 'doar sarcinile eșuate sau anulate se pot redeschide' }, { status: 409 });
      break;
    }
    case 'mark_done': {
      if (!isAdmin) return deny();
      const ok = await markTaskDone(ob, u.id, comment);
      if (!ok) return NextResponse.json({ error: 'doar sarcinile eșuate sau anulate se pot trece la făcute' }, { status: 409 });
      break;
    }
    default:
      return NextResponse.json({ error: 'acțiune necunoscută' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// Redactarea unei sarcini existente (doar ADMIN): categorie, titlu, descriere, puncte, termen.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await authFromInitData(initData(req));
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
  if (body.deadline !== undefined) {
    const dt = new Date(String(body.deadline));
    if (Number.isNaN(dt.getTime())) return NextResponse.json({ error: 'termen invalid' }, { status: 400 });
    // Se mută doar termenul curent — original_deadline rămâne ca istoric.
    patch.current_deadline = dt.toISOString();
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nimic de modificat' }, { status: 400 });

  const { data, error } = await getSupabase().from('obligations')
    .update(patch).eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
