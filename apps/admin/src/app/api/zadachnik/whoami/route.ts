import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Временный диагностический эндпоинт: показывает, где рвётся авторизация Mini App
// (без утечки секретов — только длины/флаги + собственный telegram_id владельца).
export async function GET(req: Request) {
  const initData = req.headers.get('x-telegram-init-data') || '';
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  const r: Record<string, unknown> = {
    initLen: initData.length, tokenLen: token.length,
    hashOkExclSig: false, hashOkInclSig: false,
    telegramId: null as number | null, userFound: false,
    userActive: null as boolean | null, userRole: null as string | null,
    keys: [] as string[],
  };
  if (!token || !initData) return NextResponse.json(r);

  const params = new URLSearchParams(initData);
  r.keys = [...params.keys()];
  const hash = params.get('hash') || '';

  const calc = (excludeSig: boolean): string => {
    const p = new URLSearchParams(initData);
    p.delete('hash');
    if (excludeSig) p.delete('signature');
    const dc = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    return crypto.createHmac('sha256', secret).update(dc).digest('hex');
  };
  r.hashOkExclSig = calc(true) === hash;
  r.hashOkInclSig = calc(false) === hash;

  try {
    r.telegramId = Number(JSON.parse(params.get('user') || '{}').id) || null;
  } catch {
    /* ignore */
  }
  if (r.telegramId) {
    const { data } = await getSupabase()
      .from('users').select('id, role, active').eq('telegram_id', r.telegramId).maybeSingle();
    r.userFound = !!data;
    r.userActive = (data?.active as boolean) ?? null;
    r.userRole = (data?.role as string) ?? null;
  }
  return NextResponse.json(r);
}
