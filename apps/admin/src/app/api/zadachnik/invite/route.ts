import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { authFromInitData } from '@/lib/zadachnik/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Создать ссылку-приглашение нового члена команды (только ADMIN).
// Бот при /start={token} регистрирует пользователя (как CONTROLLER); роль/имя владелец правит в «Echipa».
export async function POST(req: Request) {
  const u = await authFromInitData(req.headers.get('x-telegram-init-data'));
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (u.role !== 'ADMIN') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const point = ['CHISINAU', 'BALTI'].includes(String(body.point)) ? String(body.point) : 'CHISINAU';

  const token = crypto.randomBytes(24).toString('base64url');
  const { error } = await getSupabase().from('invite_tokens').insert({
    token,
    role: 'CONTROLLER',
    point,
    // created_by ссылается на admin_accounts(id); Mini-App-админ авторизован через Telegram (users.id)
    // и не имеет строки в admin_accounts → пишем null (колонка nullable, migr. 117).
    created_by: null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot';
  return NextResponse.json({ link: `https://t.me/${botUsername}?start=${token}` });
}
