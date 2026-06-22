import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData, userLabel } from '@/lib/zadachnik/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Список исполнителей (контролёров) для пикера в форме новой задачи — только админу.
export async function GET(req: Request) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data } = await getSupabase()
    .from('users')
    .select('id, username, point, operator_kind')
    .eq('role', 'CONTROLLER')
    .eq('active', true);

  const assignees = (data ?? [])
    .map((x) => ({ id: x.id as string, label: userLabel(x as { username: string | null; point: string | null; operator_kind: string | null }) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ assignees });
}
