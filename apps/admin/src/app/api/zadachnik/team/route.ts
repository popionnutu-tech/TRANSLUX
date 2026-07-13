import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData } from '@/lib/zadachnik/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SETTABLE_ROLES = ['CONTROLLER', 'DIGITAL', 'MANAGER_LDE'];

// Управление командой (экран «Echipa») — только ADMIN.
export async function GET(req: Request) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data } = await getSupabase()
    .from('users')
    .select('id, name, username, role, point, telegram_id, active')
    .in('role', ['ADMIN', 'CONTROLLER', 'DIGITAL', 'MANAGER_LDE'])
    .order('role')
    .order('username');
  return NextResponse.json({ members: data ?? [] });
}

export async function POST(req: Request) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id obligatoriu' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim() || null;
  if (typeof body.role === 'string') {
    if (!SETTABLE_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'rol invalid (doar CONTROLLER/DIGITAL/MANAGER_LDE)' }, { status: 400 });
    }
    patch.role = body.role;
    // DIGITAL/MANAGER_LDE = только Mini App, не оператор рейсов. Бот показывает отчёт по рейсу
    // при наличии point, поэтому снимаем point — иначе человек продолжит слать рейсы.
    if (body.role === 'DIGITAL' || body.role === 'MANAGER_LDE') patch.point = null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nimic de schimbat' }, { status: 400 });

  // не трогаем ADMIN-членов через этот эндпоинт (защита от случайной смены роли владельца)
  const { data: target } = await getSupabase().from('users').select('role').eq('id', id).maybeSingle();
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (target.role === 'ADMIN' && patch.role) {
    return NextResponse.json({ error: 'nu poți schimba rolul unui ADMIN aici' }, { status: 403 });
  }

  const { error } = await getSupabase().from('users').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
