import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Heartbeat is written by the bot every 60s (key `bot:heartbeat` in bot_storage).
// If it goes stale, the bot crashed / hung / is restart-looping → alert admins.
const STALE_MS = 8 * 60 * 1000; // older than 8 missed beats → consider down
const REALERT_MS = 30 * 60 * 1000; // don't re-spam while it stays down
const HEARTBEAT_KEY = 'bot:heartbeat';
const STATE_KEY = 'bot:watchdog_state';

async function alertAdmins(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  const supabase = getSupabase();
  const { data: admins } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('role', 'ADMIN')
    .eq('active', true)
    .not('telegram_id', 'is', null);

  for (const admin of admins || []) {
    if (!admin.telegram_id) continue;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: admin.telegram_id, text, parse_mode: 'HTML' }),
      });
    } catch (err) {
      console.error(`watchdog alert to ${admin.telegram_id} failed:`, err);
    }
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const supabase = getSupabase();

  const { data: hbRow } = await supabase
    .from('bot_storage')
    .select('value, updated_at')
    .eq('key', HEARTBEAT_KEY)
    .maybeSingle();
  // Never-existed heartbeat (e.g. first deploy, before the bot wrote one) — do NOT
  // treat as "down". Wait until the bot has reported at least once.
  if (!hbRow) {
    return NextResponse.json({ status: 'no-heartbeat-yet' });
  }

  const hb = hbRow as { value: { ts?: string; mode?: string } | null; updated_at: string } | null;
  const tsStr = hb?.value?.ts || hb?.updated_at || null;
  const ts = tsStr ? new Date(tsStr).getTime() : 0;
  const ageMs = ts ? Date.now() - ts : Infinity;
  const stale = ageMs > STALE_MS;

  const { data: stRow } = await supabase
    .from('bot_storage')
    .select('value')
    .eq('key', STATE_KEY)
    .maybeSingle();
  const state = (stRow as { value: { alerting?: boolean; lastAlertTs?: number } | null } | null)?.value || {};
  const alerting = state.alerting === true;
  const lastAlertTs = typeof state.lastAlertTs === 'number' ? state.lastAlertTs : 0;

  const saveState = (v: { alerting: boolean; lastAlertTs: number }) =>
    supabase.from('bot_storage').upsert(
      { key: STATE_KEY, value: v, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (stale) {
    if (!alerting || Date.now() - lastAlertTs > REALERT_MS) {
      const ageMin = Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null;
      await alertAdmins(
        `⚠️ <b>Botul TRANSLUX nu răspunde</b>\n` +
          `Ultima activitate: ${ageMin !== null ? `acum ${ageMin} min` : 'necunoscută'}.\n` +
          `Verifică serviciul <b>bot</b> pe Railway (posibil crash/restart).`,
      );
      await saveState({ alerting: true, lastAlertTs: Date.now() });
    }
    return NextResponse.json({ status: 'down', ageMs });
  }

  // Healthy now — if we previously alerted, send a recovery note once.
  if (alerting) {
    await alertAdmins('✅ <b>Botul TRANSLUX a revenit.</b> Primește din nou mesaje.');
    await saveState({ alerting: false, lastAlertTs });
  }
  return NextResponse.json({ status: 'ok', ageMs, mode: hb?.value?.mode });
}
