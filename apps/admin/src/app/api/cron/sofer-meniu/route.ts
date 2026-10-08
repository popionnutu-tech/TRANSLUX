import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ION-241 (Ion, 05.10.2026: «setează acum butonul bilete»): butonul de meniu (≡) al botului, în chatul privat al fiecărui
// șofer legat, devine «🎫 Билеты» și deschide mini app-ul direct — fără comenzi, fără butoane de căutat. Pentru restul
// (admini, operatori) meniul rămâne cel global («Sarcini» etc.). Idempotent; cheamă-l zilnic (VPS, după 08:00) ca șoferii
// legați între timp să primească butonul chiar dacă botul nu l-a pus la legare. `?chat_id=` = doar unul.

const URL_MINI_APP = process.env.MINI_APP_BILETE_URL || 'https://central-hub-md.vercel.app/mini-app/bilete';

async function puneButonul(chatId: number): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, menu_button: { type: 'web_app', text: '🎫 Билеты', web_app: { url: URL_MINI_APP } } }),
      signal: AbortSignal.timeout(5000),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!j?.ok) console.warn('[sofer-meniu]', chatId, j?.description);
    return !!j?.ok;
  } catch (e) {
    console.error('[sofer-meniu]', chatId, e);
    return false;
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const unul = req.nextUrl.searchParams.get('chat_id');
  const sb = getSupabase();
  let q = sb.from('drivers').select('id, full_name, telegram_id').eq('active', true).neq('is_test', true).not('telegram_id', 'is', null);
  if (unul) q = q.eq('telegram_id', Number(unul));
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rez: { nume: string; ok: boolean }[] = [];
  for (const d of (data ?? []) as { full_name: string; telegram_id: number }[]) {
    rez.push({ nume: d.full_name, ok: await puneButonul(d.telegram_id) });
  }
  return NextResponse.json({ ok: true, url: URL_MINI_APP, puse: rez.filter(r => r.ok).length, total: rez.length, rez });
}
